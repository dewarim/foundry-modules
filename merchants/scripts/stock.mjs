// Restocking a placed merchant: candidates from his sources (compendium indexes - never loaded whole -,
// item folders, single items), filtered by his types and filter, then the plan of stock-model.mjs applied
// to the token's own items. Runs on a GM's client: the stock is the GM's document.
import {adapter} from "./adapter.mjs";
import {craftRule} from "./config-model.mjs";
import {matchesQuery, parseQuery} from "./filters.mjs";
import {MODULE_ID, accepts, config, effectiveLevel, itemData, quantityOf, sceneLevel, stockItems} from "./merchant.mjs";
import {planRestock, restockDue, stockLevel} from "./stock-model.mjs";

/** Condition keys for a merchant's filter: type, level and price everywhere, the rest from the system. */
export function filterFields() {
  return {
    type: {path: "type"},
    level: {get: effectiveLevel},
    price: {get: e => (adapter.basePrice?.(e) ?? 0) / (adapter.unit?.value || 1)},
    ...(adapter.filterFields ?? {})
  };
}

function valueOf(entry, fields) {
  return key => {
    const field = fields[key];
    if ( !field ) return undefined;
    return field.get ? field.get(entry) : foundry.utils.getProperty(entry, field.path);
  };
}

/** Everything a source offers: the entries of a compendium's index, the items of a folder (and its subfolders), one item. */
async function sourceEntries(source) {
  const pack = game.packs.get(source);
  if ( pack ) {
    if ( pack.documentName !== "Item" ) return [];
    const index = await pack.getIndex({fields: [...(adapter.indexFields ?? []), `flags.${MODULE_ID}.level`]});
    return [...index];
  }
  const doc = await fromUuid(source).catch(() => null);
  if ( doc instanceof Item ) return [doc];
  if ( (doc instanceof Folder) && (doc.type === "Item") ) {
    return [doc, ...doc.getSubfolders(true)].flatMap(f => f.contents);
  }
  return [];
}

/**
 * What a merchant may offer: {uuid, level, stack} per item.
 * @param {object} cfg   the merchant's configuration
 */
export async function candidates(cfg) {
  const sources = cfg.sources.length ? cfg.sources : (adapter.defaultSources?.() ?? []);
  const query = parseQuery(cfg.filter);
  const fields = filterFields();
  // By name and type too: the system's own packs hold the same item more than once (dnd5e's 2024
  // equipment has seven "Oil")
  const seen = new Set();
  const out = [];
  for ( const source of sources ) {
    for ( const entry of await sourceEntries(source) ) {
      // Nothing without a price: it would be given away (dnd5e's SRD has priceless "equipment" such as traps)
      if ( seen.has(entry.uuid) || !accepts(cfg, entry) || !(adapter.basePrice?.(entry) > 0) ) continue;
      if ( seen.has(`${entry.type}|${entry.name}`) || !matchesQuery(query, [entry.name], valueOf(entry, fields)) ) continue;
      seen.add(entry.uuid);
      seen.add(`${entry.type}|${entry.name}`);
      out.push({uuid: entry.uuid, name: entry.name, level: effectiveLevel(entry), stack: !!adapter.stackable?.(entry)});
    }
  }
  return out;
}

/** dewarim-items' API, if it is active: it makes the variants of a merchant's craft. */
const itemsApi = () => (game.modules.get("dewarim-items")?.active ? game.modules.get("dewarim-items").api ?? null : null);

/**
 * A random stock item in the merchant's own make: the first craft entry whose filter matches gives the
 * variant (stronger, dearer). Unchanged without dewarim-items, without a matching entry, or when the
 * variant's strength changes nothing on this item (a longsword's 1d8 at +5 %).
 */
function crafted(cfg, source, data) {
  const api = itemsApi();
  if ( !api?.vary || !cfg.craft.length ) return data;
  const fields = filterFields();
  const entry = cfg.craft.find(c => matchesQuery(parseQuery(c.filter), [source.name], valueOf(source, fields)));
  if ( !entry ) return data;
  try {
    return api.vary(data, craftRule(entry)) ?? data;
  } catch(err) {
    console.warn(`${MODULE_ID} | craft variant of ${source.name}`, err);
    return data;
  }
}

/** The restock state of a placed merchant: {last: {real, game}, stocked: [uuids], purse, level}. */
export function stateOf(token) {
  return token.getFlag(MODULE_ID, "state") ?? null;
}

export function isDue(token) {
  return restockDue(config(token.actor).restock, stateOf(token)?.last ?? null, Date.now(), game.time.worldTime);
}

/**
 * Restock a placed merchant.
 * @param {TokenDocument} token
 * @param {{force?: boolean}} [options]  force: also when not due
 * @returns {Promise<{removed: number, added: number, refilled: number}|null>} null when nothing was due
 */
export async function restock(token, {force = false} = {}) {
  const actor = token.actor;
  if ( !actor ) return null;
  const cfg = config(actor);
  const state = stateOf(token);
  if ( !force && !restockDue(cfg.restock, state?.last ?? null, Date.now(), game.time.worldTime) ) return null;

  const level = stockLevel(cfg.level, sceneLevel(token.parent), adapter.partyLevel?.() ?? null);
  const stock = stockItems(actor).map(i => {
    const flag = i.flags[MODULE_ID].stock;
    return {id: i.id, name: i.name, source: flag.source ?? null, fixed: !!flag.fixed, level: Number(flag.level) || 0,
      quantity: quantityOf(i)};
  });
  const plan = planRestock({
    stock, fixed: cfg.fixed, stocked: state?.stocked ?? [], candidates: await candidates(cfg),
    stockSize: cfg.stockSize, turnover: cfg.turnover, level, rng: Math.random
  });

  if ( plan.remove.length ) await actor.deleteEmbeddedDocuments("Item", plan.remove);
  if ( plan.refill.length && adapter.quantityPath ) {
    await actor.updateEmbeddedDocuments("Item", plan.refill.map(r => ({_id: r.id, [adapter.quantityPath]: r.quantity})));
  }
  const data = [];
  for ( const add of plan.add ) {
    const source = await fromUuid(add.uuid).catch(() => null);
    if ( !(source instanceof Item) ) continue;
    const entry = cfg.fixed.find(f => add.fixed && (f.uuid === add.uuid));
    const item = itemData(source, add.quantity, {
      source: add.uuid, fixed: add.fixed, unlimited: !!entry && (entry.quantity === null),
      level: add.level ?? effectiveLevel(source)
    });
    // Custom stock is offered as it is; the random stock in the merchant's own make
    data.push(add.fixed ? item : crafted(cfg, source, item));
  }
  if ( data.length ) await actor.createEmbeddedDocuments("Item", data);

  await token.setFlag(MODULE_ID, "state", {
    last: {real: Date.now(), game: game.time.worldTime},
    stocked: [...new Set([...(state?.stocked ?? []), ...cfg.fixed.map(f => f.uuid)])],
    purse: cfg.purse,
    level
  });
  return {removed: plan.remove.length, added: data.length, refilled: plan.refill.length};
}

/** Restock every merchant token that is due (or all, forced). */
export async function restockAll(tokens, options = {}) {
  let count = 0;
  for ( const token of tokens ) {
    try {
      if ( await restock(token, options) ) count++;
    } catch(err) {
      console.error(`${MODULE_ID} | restocking ${token.name} failed`, err);
    }
  }
  return count;
}
