// Merchants as documents: the actor carries the configuration (flag `merchant`), each placed token its
// own stock (items in the token's delta, flag `stock`) and restock state (token flag `state`).
import {adapter} from "./adapter.mjs";
import {DEFAULT_BRACKETS, merchantConfig, parseBrackets, patchConfig, priceRule} from "./config-model.mjs";
import {itemLevel} from "./stock-model.mjs";

export const MODULE_ID = "dewarim-merchants";
export const SHEET_CLASS = `${MODULE_ID}.MerchantSheet`;
/** Part of Foundry's own icons: nothing to ship, nothing to license */
export const DEFAULT_IMG = "icons/environment/settlement/market-stall.webp";

/** Is this actor (or a token's actor) a merchant? */
export function isMerchant(actor) {
  return !!actor?.flags?.[MODULE_ID]?.merchant;
}

/** A merchant's configuration, every field valid. */
export function config(actor) {
  return merchantConfig(actor?.flags?.[MODULE_ID]?.merchant);
}

/** The world actor behind a token's actor - the configuration is written there. */
export function baseActor(actor) {
  return actor?.isToken ? (game.actors.get(actor.token.actorId) ?? actor) : actor;
}

/**
 * Make an actor a merchant or change its configuration: the flag, and the sheet that shows the shop.
 * @param {Actor} actor
 * @param {object} patch  configuration fields to change
 */
export async function configure(actor, patch = {}) {
  const base = baseActor(actor);
  const next = patchConfig(config(base), patch);
  await base.update({[`flags.${MODULE_ID}.merchant`]: next, "flags.core.sheetClass": SHEET_CLASS});
  return next;
}

/**
 * A new merchant actor.
 * @param {{name?: string, template?: string, level?: number, race?: string, profession?: string,
 *   img?: string, folder?: string|null, config?: object}} data
 */
export async function createMerchant(data = {}) {
  const template = adapter.templates?.().find(t => t.id === data.template);
  const merchant = merchantConfig({
    ...(template ? {itemTypes: template.itemTypes, filter: template.filter, sources: template.sources ?? []} : {}),
    ...data.config,
    ...Object.fromEntries(["level", "race", "profession"].filter(k => data[k] !== undefined).map(k => [k, data[k]]))
  });
  const img = data.img || DEFAULT_IMG;
  const [actor] = await Actor.implementation.createDocuments([{
    name: data.name || template?.label || _loc("DEWARIM_MERCHANTS.Merchant"),
    type: adapter.actorType ?? Actor.TYPES.find(t => t !== "base"),
    img,
    folder: data.folder ?? null,
    // Players open the shop with limited permission; trades run on the GM's side
    ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED},
    // Unlinked: each placed token has its own stock, so the same merchant can stand in two towns
    prototypeToken: {texture: {src: img}, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY, actorLink: false},
    flags: {[MODULE_ID]: {merchant}, core: {sheetClass: SHEET_CLASS}}
  }]);
  return actor;
}

/** The merchant tokens on a scene the current user may see. */
export function merchantTokens(scene = canvas.scene) {
  return (scene?.tokens.contents ?? []).filter(t => isMerchant(t.actor) && (game.user.isGM || !t.hidden));
}

/** A scene's level for merchant stock (null: not set). */
export function sceneLevel(scene) {
  const level = Number(scene?.getFlag(MODULE_ID, "level"));
  return Number.isFinite(level) && (level > 0) ? level : null;
}

export function setSceneLevel(scene, level) {
  const n = Number(level);
  return (Number.isFinite(n) && (n > 0)) ? scene.setFlag(MODULE_ID, "level", Math.round(n)) : scene.unsetFlag(MODULE_ID, "level");
}

/** Price rules of the world, repaired. */
export function worldRules() {
  return (game.settings.get(MODULE_ID, "rules") ?? []).map(priceRule).filter(Boolean);
}

export function brackets() {
  const stored = parseBrackets(game.settings.get(MODULE_ID, "brackets"));
  return stored.length ? stored : DEFAULT_BRACKETS;
}

/** An item's (or index entry's) effective level. */
export function effectiveLevel(entry) {
  return itemLevel({
    flag: foundry.utils.getProperty(entry, `flags.${MODULE_ID}.level`),
    system: adapter.systemLevel?.(entry) ?? null,
    price: (adapter.basePrice?.(entry) ?? 0) / (adapter.unit?.value || 1),
    brackets: brackets()
  });
}

/** How many pieces an item is. */
export function quantityOf(item) {
  if ( !adapter.quantityPath ) return 1;
  return Number(foundry.utils.getProperty(item, adapter.quantityPath)) || 0;
}

/** The items a merchant token offers: those its restock put there or it bought. */
export function stockItems(actor) {
  return (actor?.items.contents ?? []).filter(i => i.flags?.[MODULE_ID]?.stock);
}

/** May this item go to this merchant (his types; physical)? */
export function accepts(cfg, item) {
  if ( !adapter.sellable?.(item) ) return false;
  return !cfg.itemTypes.length || cfg.itemTypes.includes(item.type);
}

/**
 * Item data for an actor: a copy of an item (world, compendium or embedded), without what ties it to the
 * old place, with a quantity.
 * @param {Item} source
 * @param {number} quantity
 * @param {object} [stock]  the stock flag, if it goes into a merchant's stock
 */
export function itemData(source, quantity, stock = null) {
  const data = source.pack ? game.items.fromCompendium(source, {keepId: false}) : source.toObject();
  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  if ( adapter.quantityPath ) foundry.utils.setProperty(data, adapter.quantityPath, quantity);
  if ( data.flags?.[MODULE_ID] ) delete data.flags[MODULE_ID].stock;
  if ( stock ) foundry.utils.setProperty(data, `flags.${MODULE_ID}.stock`, stock);
  return data;
}

/**
 * Put pieces of an item into an actor: onto a stack of the same name and type, or as a new item.
 * @param {Actor} actor
 * @param {Item} source
 * @param {number} quantity
 * @param {object} [stock]   the stock flag for a merchant's stock (stacks only onto stock)
 */
export async function giveItem(actor, source, quantity, stock = null) {
  const pool = stock ? stockItems(actor).filter(i => !i.flags[MODULE_ID].stock.fixed) : actor.items.filter(i => !i.flags?.[MODULE_ID]?.stock);
  const target = adapter.quantityPath ? pool.find(i => (i.name === source.name) && (i.type === source.type)) : null;
  if ( target ) return target.update({[adapter.quantityPath]: quantityOf(target) + quantity});
  return actor.createEmbeddedDocuments("Item", [itemData(source, quantity, stock)]);
}

/** Take pieces of an item away: the stack shrinks, or the item goes. */
export async function takeItem(item, quantity) {
  const left = quantityOf(item) - quantity;
  if ( adapter.quantityPath && (left > 0) ) return item.update({[adapter.quantityPath]: left});
  return item.delete();
}
