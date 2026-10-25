// The dnd5e side of a variant, on plain item data (dnd5e 6.0.6): heal and damage parts rewritten for a
// strength (dnd5e has no multiplier - `healing.bonus` is additive), the price in sensible coins, rarity by
// price, weight, data paths, and riders - a save that guards a side effect: an ActiveEffect on the item
// (`transfer: false`, as the SRD's Potion of Poison has it) listed on the drinking activity, so the chat card
// offers it, and named in the module's flag for the automation (dnd5e.mjs).
// No Foundry globals - covered by test/dnd5e-model.test.mjs.
import {itemName, percentText} from "../variant-model.mjs";

export const MODULE_ID = "dewarim-items";

export const RARITIES = ["common", "uncommon", "rare", "veryRare", "legendary", "artifact"];

/** The highest price (gp) per rarity when it follows the price; above the last one: legendary. */
export const DEFAULT_THRESHOLDS = {common: 100, uncommon: 500, rare: 5000, veryRare: 50000};

/** Activity types whose damage parts a potency scales. */
const DAMAGING = ["attack", "damage", "save"];

const SECONDS = {minute: 60, hour: 3600, day: 86400};

const isNumeric = value => (value === "") || (value === null) || (value === undefined) || /^\s*[+-]?\d+(\.\d+)?\s*$/.test(String(value));

/** The average of a damage part without a custom formula; null when it cannot be told (a formula bonus). */
export function partAverage(part) {
  if ( !part || part.custom?.enabled || !isNumeric(part.bonus) ) return null;
  const dice = (Number(part.number) || 0) * (((Number(part.denomination) || 0) + 1) / 2);
  return dice + (Number(part.bonus) || 0);
}

/** A formula multiplied as a whole; weakened, it still does at least 1. */
function multiplied(part, formula, factor) {
  const scaled = factor < 1 ? `max(1, floor((${formula}) * ${factor}))` : `floor((${formula}) * ${factor})`;
  return {part: {...part, custom: {...(part.custom ?? {}), enabled: true, formula: scaled}}, ratio: factor};
}

/**
 * A damage or healing part for a strength: about the average times the factor, in the same dice - the count
 * scaled and rounded, the bonus making up the rest. A custom formula is multiplied as a whole, and so is a
 * part the dice cannot follow: off by more than a quarter, or a weakened part whose bonus would turn negative
 * (a failed potion at 10 %: 2d4 + 2 is not 1d4 - 2, which could heal nothing or less).
 * @returns {{part: object, ratio: number|null}}  ratio: the new average over the old one, null if unknown
 */
export function scalePart(part, factor) {
  if ( !part || (factor === 1) ) return {part, ratio: 1};
  if ( part.custom?.enabled ) {
    const formula = String(part.custom.formula ?? "").trim();
    if ( !formula ) return {part, ratio: 1};
    return multiplied(part, formula, factor);
  }
  const n = Number(part.number) || 0;
  const d = Number(part.denomination) || 0;
  if ( !isNumeric(part.bonus) ) {
    // A bonus such as "@mod": only the dice can follow
    return {part: n ? {...part, number: Math.max(1, Math.round(n * factor))} : part, ratio: null};
  }
  const before = partAverage(part);
  if ( !before ) return {part, ratio: 1};
  const target = before * factor;
  const number = n && d ? Math.max(1, Math.round(n * factor)) : n;
  const bonus = Math.round(target - (number * ((d + 1) / 2)));
  const scaled = {...part, number, bonus: bonus ? String(bonus) : ""};
  const ratio = partAverage(scaled) / before;
  const negative = (factor < 1) && (bonus < 0) && ((Number(part.bonus) || 0) >= 0);
  if ( negative || (Math.abs(ratio - factor) / factor > 0.25) ) return multiplied(part, partFormula(part), factor);
  return {part: scaled, ratio};
}

/** A part's formula as text: "2d4 + 2". */
export function partFormula(part) {
  if ( !part ) return "";
  if ( part.custom?.enabled ) return String(part.custom.formula ?? "");
  const dice = part.number && part.denomination ? `${part.number}d${part.denomination}` : "";
  const bonus = String(part.bonus ?? "").trim();
  if ( !bonus || (bonus === "0") ) return dice;
  if ( !dice ) return bonus;
  return /^[+-]/.test(bonus) ? `${dice} ${bonus[0]} ${bonus.slice(1).trim()}` : `${dice} + ${bonus}`;
}

/**
 * Every heal (and/or damage) part of an item scaled: its activities and a weapon's base damage.
 * @param {object} system   the item's system data (changed in place)
 * @param {"both"|"heal"|"damage"} applies
 * @returns {{changed: boolean, ratio: number|null, formulas: string[]}}  ratio of the first changed part
 */
export function scaleSystem(system, applies, factor) {
  const heal = applies !== "damage";
  const damage = applies !== "heal";
  let ratio = null;
  let changed = false;
  const formulas = [];
  const take = (part, set) => {
    const before = partFormula(part);
    const result = scalePart(part, factor);
    set(result.part);
    const after = partFormula(result.part);
    formulas.push(after);
    if ( after !== before ) {
      changed = true;
      ratio ??= result.ratio;
    }
  };
  for ( const activity of Object.values(system.activities ?? {}) ) {
    if ( heal && (activity.type === "heal") && activity.healing ) take(activity.healing, p => activity.healing = p);
    if ( damage && DAMAGING.includes(activity.type) && Array.isArray(activity.damage?.parts) ) {
      activity.damage.parts.forEach((part, i) => take(part, p => activity.damage.parts[i] = p));
    }
  }
  if ( damage && system.damage?.base?.denomination ) take(system.damage.base, p => system.damage.base = p);
  return {changed, ratio, formulas};
}

/**
 * A price times a factor, in coins a merchant would name: whole gold from 10 gp, gold or silver below,
 * silver or copper under a gold piece.
 * @param {{value: number, denomination: string}} price
 * @param {Record<string, number>} coins   copper per coin ({cp: 1, sp: 10, gp: 100, ...})
 */
export function scalePrice(price, factor, coins) {
  const per = coins[price?.denomination || "gp"] ?? coins.gp;
  const copper = (Number(price?.value) || 0) * per * factor;
  if ( copper <= 0 ) return {value: 0, denomination: price?.denomination || "gp"};
  const gp = coins.gp;
  const sp = coins.sp ?? (gp / 10);
  if ( copper >= 10 * gp ) return {value: Math.round(copper / gp), denomination: "gp"};
  if ( copper >= gp ) {
    const silver = Math.round(copper / sp);
    return (silver * sp) % gp === 0 ? {value: (silver * sp) / gp, denomination: "gp"} : {value: silver, denomination: "sp"};
  }
  if ( copper >= sp ) return {value: Math.round(copper / sp), denomination: "sp"};
  return {value: Math.max(1, Math.round(copper)), denomination: "cp"};
}

/** A price in gold pieces. */
export const priceGp = (price, coins) => ((Number(price?.value) || 0) * (coins[price?.denomination || "gp"] ?? coins.gp)) / coins.gp;

/** The rarity a price stands for. */
export function rarityForPrice(gp, thresholds = DEFAULT_THRESHOLDS) {
  for ( const key of RARITIES ) {
    if ( (thresholds[key] !== undefined) && (gp <= thresholds[key]) ) return key;
  }
  return "legendary";
}

/** The higher of two rarities. */
export const higherRarity = (a, b) => (RARITIES.indexOf(a) >= RARITIES.indexOf(b) ? a : b);

/** Thresholds from a setting's text "100, 500, 5000, 50000" (common, uncommon, rare, very rare). */
export function parseThresholds(value) {
  const numbers = String(value ?? "").split(/[\s,;]+/).map(Number).filter(n => Number.isFinite(n) && (n > 0));
  if ( numbers.length !== 4 ) return {...DEFAULT_THRESHOLDS};
  return Object.fromEntries(RARITIES.slice(0, 4).map((key, i) => [key, numbers[i]]));
}

function rarityOf(system) {
  const set = system.rarities;
  if ( Array.isArray(set) && set.length ) return set[0];
  return system.rarity || "";
}

/** An effect's duration: rounds stay rounds, the rest in seconds (the SRD's poisons count seconds). */
export function effectDuration({value, units}) {
  if ( units === "round" ) return {value, units: "rounds", expiry: "turnStart"};
  return {value: Math.round(value * (SECONDS[units] ?? 3600)), units: "seconds", expiry: "turnStart"};
}

/** The ActiveEffect a rider applies: the condition, for its duration, on the target - not the owner. */
export function riderEffect(rider, {id, name, img}) {
  return {
    _id: id, name, img, type: "base", transfer: false, disabled: false, statuses: [rider.condition],
    duration: effectDuration(rider.duration), system: {changes: []}, showIcon: 2,
    flags: {[MODULE_ID]: {rider: true}}
  };
}

/** The activity a rider belongs to: the first heal, else the first activity. */
function drinkingActivity(system) {
  const activities = Object.values(system.activities ?? {});
  return activities.find(a => a.type === "heal") ?? activities[0] ?? null;
}

const coerce = (value, current) => {
  const s = String(value);
  if ( Array.isArray(current) ) return s.split(/\s*,\s*/).filter(Boolean);
  if ( typeof current === "boolean" ) return ["true", "1", "yes", "ja"].includes(s.toLowerCase());
  if ( typeof current === "number" ) return Number(s.replace(",", ".")) || 0;
  if ( /^\s*[[{]/.test(s) ) {
    try { return JSON.parse(s); } catch { return s; }
  }
  return s;
};

function setPath(obj, path, value) {
  const keys = path.split(".");
  let at = obj;
  for ( const key of keys.slice(0, -1) ) {
    if ( (at[key] === null) || (typeof at[key] !== "object") ) at[key] = {};
    at = at[key];
  }
  const last = keys.at(-1);
  at[last] = coerce(value, at[last]);
}

/**
 * Apply a variant's plan (variant-model.mjs `variantPlan`) to item data.
 * @param {object} data   item data of the base (a copy - changed in place)
 * @param {object} plan
 * @param {object} ctx
 * @param {Record<string, number>} ctx.coins        copper per coin
 * @param {object} [ctx.thresholds]                 rarity by price
 * @param {() => string} ctx.randomId
 * @param {(name: string) => string} ctx.slugify
 * @param {(id: string) => {name: string, img: string}} ctx.condition
 * @param {(rider: object) => string} ctx.riderText          "DC 13 Constitution save or Poisoned for 1 hour"
 * @param {(percent: string) => string} ctx.potencyText      "Potency +20%"
 * @param {(pattern: string, parts: object, data: object) => string} [ctx.name]  the item's name, in one language
 * @returns {{data: object, potent: boolean|null, ratio: number}}  potent: null without a potency aspect
 */
export function applyPlan(data, plan, ctx) {
  const system = data.system ??= {};
  const notes = [];
  let potent = null;
  let ratio = plan.factor;

  if ( plan.potency ) {
    const result = scaleSystem(system, plan.potency.applies, plan.potency.factor);
    potent = result.changed;
    if ( result.changed && result.ratio ) ratio = Math.round(result.ratio * 100) / 100;
    if ( result.changed ) notes.push(ctx.potencyText(percentText(ratio)));
  }

  // Price: a value from the row or the aspect wins, else the base's times every factor
  if ( plan.price.value !== null ) system.price = scalePrice({value: plan.price.value, denomination: "gp"}, 1, ctx.coins);
  else if ( system.price && (plan.price.factor !== 1) ) system.price = scalePrice(system.price, plan.price.factor, ctx.coins);

  if ( (plan.weight.value !== null) || (plan.weight.factor !== 1) ) {
    const weight = (system.weight && (typeof system.weight === "object")) ? system.weight : {value: Number(system.weight) || 0, units: "lb"};
    const value = plan.weight.value ?? (Math.round(weight.value * plan.weight.factor * 100) / 100);
    system.weight = {...weight, value};
  }

  // Rarity: "auto" follows the price, never below the base's; only magic items have one
  const base = rarityOf(system);
  const magic = !!base || (Array.isArray(system.properties) && system.properties.includes("mgc"));
  let rarity = "";
  if ( plan.rarity === "auto" ) rarity = magic ? higherRarity(rarityForPrice(priceGp(system.price, ctx.coins), ctx.thresholds), base || "common") : "";
  else if ( RARITIES.includes(plan.rarity) ) rarity = plan.rarity;
  if ( rarity ) {
    system.rarities = [rarity];
    delete system.rarity;
  }

  const riders = [];
  for ( const rider of plan.riders ) {
    const id = ctx.randomId();
    const condition = ctx.condition(rider.condition);
    (data.effects ??= []).push(riderEffect(rider, {id, name: condition.name, img: condition.img}));
    const activity = drinkingActivity(system);
    if ( activity ) (activity.effects ??= []).push({_id: id});
    riders.push({...rider, effect: id, activity: activity?._id ?? null});
    notes.push(ctx.riderText(rider));
  }

  for ( const {path, value} of plan.sets ) setPath(data, path, value);
  if ( plan.img ) data.img = plan.img;
  if ( plan.note ) notes.push(plan.note);

  // The name in one language (ctx.name: dnd5e-names.mjs); the identifier stays the base's - dnd5e and other
  // modules look items up by it - except for a row, which is an item of its own
  const parts = {...plan.nameParts, percent: percentText(ratio)};
  data.name = ctx.name ? ctx.name(plan.pattern, parts, data) : itemName(plan.pattern, parts);
  if ( plan.nameParts.name || !system.identifier ) system.identifier = ctx.slugify(data.name);
  if ( notes.length ) {
    system.description ??= {};
    system.description.value = `${system.description.value ?? ""}${notes.map(n => `<p class="${MODULE_ID}">${n}</p>`).join("")}`;
  }
  data.flags ??= {};
  data.flags[MODULE_ID] = {...data.flags[MODULE_ID], key: plan.key, factor: plan.factor, ratio, riders};
  return {data, potent, ratio};
}

/** What a preview shows of an item: its heal or damage formulas. */
export function formulasOf(system) {
  const out = [];
  for ( const activity of Object.values(system?.activities ?? {}) ) {
    if ( (activity.type === "heal") && activity.healing ) out.push(partFormula(activity.healing));
    if ( DAMAGING.includes(activity.type) ) for ( const part of activity.damage?.parts ?? [] ) out.push(partFormula(part));
  }
  if ( system?.damage?.base?.denomination ) out.push(partFormula(system.damage.base));
  return out.filter(Boolean);
}
