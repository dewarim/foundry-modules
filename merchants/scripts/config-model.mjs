// A merchant's configuration (actor flag `merchant`) with defaults and repair: a flag can be written by an
// older version, by hand or by the studio, so everything read from it goes through `merchantConfig`.
// No Foundry globals - covered by test/config-model.test.mjs.

export const DIMENSIONS = ["race", "profession"];

export const DEFAULT_CONFIG = Object.freeze({
  level: 5,
  race: "",
  profession: "",
  itemTypes: [],          // empty: every type the system can sell
  sources: [],            // compendium ids, folder or item UUIDs; empty: the system's default sources
  filter: "",             // condition filter on the candidates ("rarity!=artifact price<=500")
  fixed: [],              // custom stock, see fixedEntry
  stockSize: 20,          // random stock items (custom stock comes on top)
  turnover: 30,           // percent of the random stock replaced on a restock
  markup: 0,              // percent on all sale prices; negative is a discount
  buyDiscount: 50,        // percent below value the merchant pays for what he buys
  restock: {period: 24, clock: "real"},   // hours; real time or the world's game time
  rules: [],              // the merchant's own price rules, see priceRule
  purse: null,            // smallest currency unit per restock; null: unlimited
  craft: []               // his own make: variants of the stock (with dewarim-items), see craftEntry
});

const number = (value, fallback, min = -Infinity, max = Infinity) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const text = value => (typeof value === "string" ? value.trim() : "");
const list = value => (Array.isArray(value) ? value : []);

/**
 * A price rule: `percent` for buyers whose race (or profession) is `buyer`, from merchants whose race (or
 * profession) is `merchant` ("*": any). A merchant's own rules leave `merchant` out.
 * @returns {{dimension: string, merchant: string, buyer: string, percent: number}|null}
 */
export function priceRule(raw) {
  if ( !raw || !DIMENSIONS.includes(raw.dimension) ) return null;
  const buyer = text(raw.buyer).toLowerCase();
  if ( !buyer ) return null;
  return {dimension: raw.dimension, merchant: text(raw.merchant).toLowerCase() || "*", buyer,
    percent: number(raw.percent, 0, -100)};
}

/**
 * One custom stock entry: an item that is always offered, whatever the level.
 * quantity null: unlimited. price null: computed from the item; exact: the price ignores the rules.
 * replenish false: once sold out, it does not come back (a quest item exists once).
 */
export function fixedEntry(raw) {
  const uuid = text(raw?.uuid);
  if ( !uuid ) return null;
  const quantity = (raw.quantity === null) || (raw.quantity === "") ? null : Math.round(number(raw.quantity, 1, 1));
  const price = (raw.price === null) || (raw.price === undefined) || (raw.price === "") ? null : number(raw.price, null, 0);
  return {uuid, name: text(raw.name), quantity, price, exact: !!raw.exact && (price !== null), replenish: raw.replenish !== false};
}

/**
 * A merchant's craft: random stock that matches the filter (empty: all of it) comes out `min`..`max` percent
 * stronger (or weaker) than the plain item and costs `price` percent more - an alchemist better than the rest.
 * Applied by dewarim-items; without it, ignored.
 */
export function craftEntry(raw) {
  if ( !raw || (typeof raw !== "object") ) return null;
  const a = number(raw.min, 5, -90, 500);
  const b = number(raw.max, 20, -90, 500);
  return {filter: text(raw.filter), min: Math.min(a, b), max: Math.max(a, b), price: number(raw.price, 10, -100)};
}

/** A craft entry as a dewarim-items rule: strength in its range, the price change on top. */
export function craftRule(entry) {
  return {
    pattern: "{base} ({percent})",
    aspects: [{kind: "potency", applies: "both", percent: 0, follow: true}, {kind: "price", percent: entry.price, follow: false}],
    variance: {mode: "range", min: entry.min, max: entry.max, count: 1, step: 1}
  };
}

/** The configuration from a flag value, every field valid. */
export function merchantConfig(raw = {}) {
  const r = raw && (typeof raw === "object") ? raw : {};
  const d = DEFAULT_CONFIG;
  const restock = r.restock ?? {};
  return {
    level: Math.round(number(r.level, d.level, 1, 30)),
    race: text(r.race).toLowerCase(),
    profession: text(r.profession).toLowerCase(),
    itemTypes: [...new Set(list(r.itemTypes).map(text).filter(Boolean))],
    sources: [...new Set(list(r.sources).map(text).filter(Boolean))],
    filter: text(r.filter),
    fixed: list(r.fixed).map(fixedEntry).filter(Boolean),
    stockSize: Math.round(number(r.stockSize, d.stockSize, 0, 200)),
    turnover: number(r.turnover, d.turnover, 0, 100),
    markup: number(r.markup, d.markup, -100),
    buyDiscount: number(r.buyDiscount, d.buyDiscount, 0, 100),
    restock: {
      period: number(restock.period, d.restock.period, 0),
      clock: restock.clock === "game" ? "game" : "real"
    },
    rules: list(r.rules).map(priceRule).filter(Boolean).map(rule => ({...rule, merchant: "*"})),
    purse: (r.purse === null) || (r.purse === undefined) || (r.purse === "") ? null : Math.round(number(r.purse, 0, 0)),
    craft: list(r.craft).map(craftEntry).filter(Boolean)
  };
}

/** A configuration merged with changes, repaired. */
export function patchConfig(config, patch) {
  return merchantConfig({...config, ...patch, restock: {...config?.restock, ...patch?.restock}});
}

/**
 * Item levels by price: the highest price (in the system's main unit) an item of level n may have, for
 * n = 1, 2 ... Read from a text such as "10, 25, 50"; invalid or decreasing values are dropped.
 */
export function parseBrackets(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(/[\s,;]+/);
  const out = [];
  for ( const v of raw ) {
    if ( String(v).trim() === "" ) continue;
    const n = Number(String(v).replace(",", "."));
    if ( Number.isFinite(n) && (n >= 0) && (!out.length || (n >= out.at(-1))) ) out.push(n);
  }
  return out;
}

/**
 * Options for a race or profession dropdown: the extra entries first ("*" anyone, "" none), then the
 * system's keys; a value the list does not know (typed in an earlier version, a homebrew race) is kept
 * as an option of its own, so choosing nothing else never loses it.
 * @param {{key: string, label: string}[]} list
 * @param {string} value
 * @param {{key: string, label: string}[]} [extra]
 * @returns {{key: string, label: string, selected: boolean}[]}
 */
export function keyChoices(list, value, extra = []) {
  const options = [...extra, ...list];
  const wanted = String(value ?? "").toLowerCase();
  if ( wanted && !options.some(o => o.key === wanted) ) options.push({key: wanted, label: wanted});
  return options.map(o => ({...o, selected: o.key === wanted}));
}

export const DEFAULT_BRACKETS = [10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500,
  10000, 15000, 20000, 30000, 50000];
