// Templates into world items: the base copied, each variant's plan applied by the system adapter, written
// into the template's folder. Re-generating replaces the items it made before (matched by template and
// variant key) with their ids kept, so custom stock, sources and @UUID links stay valid.
import {adapter} from "./adapter.mjs";
import {mulberry32} from "./rng.mjs";
import {repairTemplate, rollFactor, variantPlan, variants} from "./variant-model.mjs";

export const MODULE_ID = "dewarim-items";

/* -------------------------------------------- */
/*  Templates (world setting)                   */
/* -------------------------------------------- */

export function templates() {
  return (game.settings.get(MODULE_ID, "templates") ?? []).map(repairTemplate).filter(t => t.id);
}

export function getTemplate(id) {
  return templates().find(t => t.id === id) ?? null;
}

export async function saveTemplate(template) {
  const t = repairTemplate(template);
  if ( !t.id ) t.id = foundry.utils.randomID();
  const list = templates();
  const i = list.findIndex(x => x.id === t.id);
  if ( i >= 0 ) list[i] = t;
  else list.push(t);
  await game.settings.set(MODULE_ID, "templates", list);
  return t;
}

export async function deleteTemplate(id) {
  await game.settings.set(MODULE_ID, "templates", templates().filter(t => t.id !== id));
}

/* -------------------------------------------- */
/*  Item data                                   */
/* -------------------------------------------- */

/** A copy of an item for the world: no id, folder, sort or ownership; the compendium source kept. */
export function baseData(item) {
  const data = item.pack ? game.items.fromCompendium(item, {keepId: false}) : item.toObject();
  for ( const key of ["_id", "folder", "sort", "ownership"] ) delete data[key];
  if ( data.flags?.[MODULE_ID] ) delete data.flags[MODULE_ID];
  return data;
}

/**
 * The items a template makes, not yet written: one per variant, items that come out the same (a range whose
 * strengths round to the same dice) once.
 * @returns {Promise<{base: Item|null, items: {key: string, data: object, potent: boolean|null}[]}>}
 */
export async function build(template) {
  const t = repairTemplate(template);
  const base = t.base ? await fromUuid(t.base).catch(() => null) : null;
  if ( !(base instanceof Item) ) return {base: null, items: []};
  const source = baseData(base);
  const seen = new Set();
  const items = [];
  for ( const variant of variants(t, mulberry32(t.seed)) ) {
    const plan = variantPlan(t, variant, base.name);
    const {data, potent} = adapter.apply(foundry.utils.deepClone(source), plan);
    if ( seen.has(data.name) ) continue;
    seen.add(data.name);
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.template`, t.id);
    // potent false: a strength that should change the item changed nothing (a Normal tier is meant to)
    items.push({key: plan.key, data, potent: plan.potency?.factor === 1 ? null : potent});
  }
  return {base, items};
}

/** The world items a template made earlier, by variant key. */
export function generated(templateId) {
  return game.items.filter(i => i.flags?.[MODULE_ID]?.template === templateId);
}

/** The folder a template writes into: its own, else a new one named after it. */
async function targetFolder(template, folder) {
  const wanted = folder ?? template.folder;
  const existing = wanted ? fromUuidSync(wanted, {strict: false}) : null;
  if ( (existing instanceof Folder) && (existing.type === "Item") ) return existing;
  return Folder.implementation.create({name: _loc("DEWARIM_ITEMS.FolderName", {name: template.name || "?"}), type: "Item",
    color: "#6b4f2a"});
}

/**
 * Write a template's items: new ones created, earlier ones replaced (same id), ones no longer made deleted
 * only if `removeStale` (the app asks first).
 * @param {object} template
 * @param {{folder?: string, removeStale?: boolean}} [options]   folder: a Folder UUID overriding the template's
 * @returns {Promise<{created: number, updated: number, stale: Item[], removed: number, folder: Folder}|null>}
 */
export async function generate(template, {folder, removeStale = false} = {}) {
  const t = repairTemplate(template);
  const {base, items} = await build(t);
  if ( !base ) return null;
  const target = await targetFolder(t, folder);
  if ( target.uuid !== t.folder ) await saveTemplate({...t, folder: target.uuid});

  const before = new Map(generated(t.id).map(i => [i.flags[MODULE_ID].key, i]));
  const keep = new Set(items.map(i => i.key));
  const replace = items.filter(i => before.has(i.key));
  // Replaced whole, not updated: activities and effects of the old version must not linger
  if ( replace.length ) await Item.implementation.deleteDocuments(replace.map(i => before.get(i.key).id));
  const data = items.map(({key, data}) => {
    const old = before.get(key);
    return {...data, folder: old?.folder?.id ?? target.id, ...(old ? {_id: old.id, sort: old.sort} : {})};
  });
  if ( data.length ) await Item.implementation.createDocuments(data, {keepId: true});

  const stale = [...before.values()].filter(i => !keep.has(i.flags[MODULE_ID].key));
  let removed = 0;
  if ( removeStale && stale.length ) {
    await Item.implementation.deleteDocuments(stale.map(i => i.id));
    removed = stale.length;
  }
  return {created: data.length - replace.length, updated: replace.length, stale: removeStale ? [] : stale, removed, folder: target};
}

/**
 * One variant of an item's data for a rule (a merchant's craft): the strength rolled from the rule's range.
 * @param {object} data   item data (not changed)
 * @param {object} rule   a template without base: {pattern, aspects, variance}
 * @param {() => number} [rng]
 * @returns {object|null}  null when the rule's potency changes nothing on this item
 */
export function vary(data, rule, rng = Math.random) {
  const t = repairTemplate({...rule, id: "vary"});
  const factor = t.variance.mode === "range" ? rollFactor(t.variance, rng) : 1;
  const plan = variantPlan(t, {key: "vary", factor}, data.name);
  const result = adapter.apply(foundry.utils.deepClone(data), plan);
  if ( result.potent === false ) return null;
  if ( result.data.flags?.[MODULE_ID] ) delete result.data.flags[MODULE_ID].template;
  return result.data;
}
