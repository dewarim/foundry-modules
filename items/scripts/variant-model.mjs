// Item templates, system-neutral: a base item, aspects that change it (potency, price, weight, rarity, a data
// path, a rider - a save that guards a side effect) and a variance that makes several items of it (a rolled
// range, fixed tiers, or rows typed or pasted like a spreadsheet). The system adapter turns a variant's plan
// into item data. A template is stored in a world setting and may be written by an older version or by
// hand, so everything read goes through `repairTemplate`.
// No Foundry globals - covered by test/variant-model.test.mjs.
import {parseTSV, toTSV} from "./tsv.mjs";

export const ASPECT_KINDS = ["potency", "price", "weight", "rarity", "set", "rider"];
export const MODES = ["single", "range", "tiers", "rows"];
export const APPLIES = ["both", "heal", "damage"];
export const DURATION_UNITS = ["round", "minute", "hour", "day"];

/** The columns of rows mode: what a row may set besides data paths. */
export const ROW_FIELDS = ["name", "price", "weight", "img", "note"];

/** A pattern per mode when the template names none. */
export const DEFAULT_PATTERNS = {single: "{base}", range: "{base} ({percent})", tiers: "{tier} {base}", rows: "{name}"};

const number = (value, fallback, min = -Infinity, max = Infinity) => {
  const n = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return (value === "") || (value === null) || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};
const text = value => (typeof value === "string" ? value.trim() : (typeof value === "number" ? String(value) : ""));
const list = value => (Array.isArray(value) ? value : []);
const optional = (value, min = 0) => ((value === null) || (value === undefined) || (value === "") ? null : number(value, null, min));

/** A percent change as a factor: +50 -> 1.5, -20 -> 0.8. */
export const factorOf = percent => Math.round((1 + (percent / 100)) * 10000) / 10000;

/** "+12%", "−10%", "±0%". */
export function percentText(factor) {
  const p = Math.round((factor - 1) * 100);
  return p > 0 ? `+${p}%` : (p < 0 ? `−${-p}%` : "±0%");
}

/** One aspect, every field valid; null for an unknown kind. */
export function repairAspect(raw) {
  const kind = raw?.kind;
  switch ( kind ) {
    case "potency":
      return {kind, applies: APPLIES.includes(raw.applies) ? raw.applies : "both", percent: number(raw.percent, 0, -90),
        follow: raw.follow !== false};
    case "price":
    case "weight":
      return {kind, percent: number(raw.percent, 0, -100), follow: !!raw.follow, value: optional(raw.value)};
    case "rarity":
      return {kind, value: text(raw.value)};
    case "set": {
      const path = text(raw.path);
      return path ? {kind, path, value: text(raw.value)} : null;
    }
    case "rider": {
      const duration = raw.duration ?? {};
      return {
        kind,
        ability: text(raw.ability) || "con",
        dc: Math.round(number(raw.dc, 13, 1, 40)),
        condition: text(raw.condition) || "poisoned",
        duration: {value: number(duration.value, 1, 0), units: DURATION_UNITS.includes(duration.units) ? duration.units : "hour"},
        percent: number(raw.percent, 0, -100)
      };
    }
    default:
      return null;
  }
}

function repairRow(raw) {
  const name = text(raw?.name);
  if ( !name ) return null;
  const set = {};
  for ( const [path, value] of Object.entries(raw.set ?? {}) ) if ( text(path) && (text(value) !== "") ) set[text(path)] = text(value);
  return {name, price: optional(raw.price), weight: optional(raw.weight), img: text(raw.img), note: text(raw.note), set};
}

/** How a template makes several items, every field valid. */
export function repairVariance(raw) {
  const mode = MODES.includes(raw?.mode) ? raw.mode : "single";
  switch ( mode ) {
    case "range": {
      const a = number(raw.min, 50, -90);
      const b = number(raw.max, 100, -90);
      return {mode, min: Math.min(a, b), max: Math.max(a, b), count: Math.round(number(raw.count, 3, 1, 50)),
        step: number(raw.step, 5, 1, 100)};
    }
    case "tiers":
      return {mode, tiers: list(raw.tiers).map(t => ({name: text(t?.name), percent: number(t?.percent, 0, -90)}))
        .filter(t => t.name)};
    case "rows":
      return {mode, columns: [...new Set(list(raw.columns).map(text).filter(p => p && !ROW_FIELDS.includes(p)))],
        rows: list(raw.rows).map(repairRow).filter(Boolean)};
    default:
      return {mode};
  }
}

/** A template from a stored value, every field valid. */
export function repairTemplate(raw = {}) {
  const r = raw && (typeof raw === "object") ? raw : {};
  return {
    id: text(r.id),
    name: text(r.name),
    base: text(r.base),
    folder: text(r.folder),
    pattern: text(r.pattern),
    aspects: list(r.aspects).map(repairAspect).filter(Boolean),
    variance: repairVariance(r.variance),
    seed: Math.round(number(r.seed, 1, 0, 2 ** 31))
  };
}

/** The pattern a template's names follow. */
export const patternOf = template => template.pattern || DEFAULT_PATTERNS[template.variance.mode];

/**
 * A name from a pattern: {base}, {tier}, {percent}, {name}, and {~word} - a word the system adapter may
 * translate or decline (dnd5e: "{~wild} {base}" is "Wilder Heiltrank" in German). Empty placeholders and
 * their spaces vanish.
 * @param {(word: string) => string} [word]
 */
export function itemName(pattern, {base = "", tier = "", percent = "", name = ""} = {}, word = w => w) {
  const out = pattern.replace(/\{~([^}]+)\}/g, (m, w) => word(w.trim())).replaceAll("{base}", base).replaceAll("{tier}", tier)
    .replaceAll("{percent}", percent).replaceAll("{name}", name || base);
  return out.replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim() || base;
}

const slug = s => String(s).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

/** A factor drawn from a range variance, rounded to its step. */
export function rollFactor(variance, rng) {
  const value = variance.min + (rng() * (variance.max - variance.min));
  return factorOf(Math.round(value / variance.step) * variance.step);
}

/**
 * The items a template makes: a key (stable across re-generation, so items are updated in place), the factor,
 * the tier or row. Factors that come out the same are one item.
 * @param {object} template   repaired
 * @param {() => number} rng
 * @returns {{key: string, factor: number, tier?: string, row?: object}[]}
 */
export function variants(template, rng) {
  const v = template.variance;
  switch ( v.mode ) {
    case "range": {
      const factors = new Set();
      for ( let i = 0; i < v.count; i++ ) factors.add(rollFactor(v, rng));
      return [...factors].sort((a, b) => a - b).map((factor, i) => ({key: `range:${i}`, factor}));
    }
    case "tiers": {
      const seen = new Set();
      return v.tiers.filter(t => !seen.has(slug(t.name)) && seen.add(slug(t.name)))
        .map(t => ({key: `tier:${slug(t.name)}`, factor: factorOf(t.percent), tier: t.name}));
    }
    case "rows": {
      const seen = new Set();
      return v.rows.filter(r => !seen.has(slug(r.name)) && seen.add(slug(r.name)))
        .map(row => ({key: `row:${slug(row.name)}`, factor: 1, row}));
    }
    default:
      return [{key: "single", factor: 1}];
  }
}

/** An aspect's own change times the variant's factor, if it follows it. */
export const aspectFactor = (aspect, factor) => factorOf(aspect.percent ?? 0) * (aspect.follow ? factor : 1);

/**
 * What the adapter applies for one variant - neutral, so the price and name rules are the same for every
 * system.
 * @param {object} template   repaired
 * @param {{key, factor, tier?, row?}} variant
 * @param {string} baseName
 */
export function variantPlan(template, variant, baseName) {
  const of = kind => template.aspects.filter(a => a.kind === kind);
  const round = f => Math.round(f * 10000) / 10000;
  const product = (aspects, extra = 1) => round(aspects.reduce((f, a) => f * aspectFactor(a, variant.factor), extra));
  const riders = of("rider");
  const potency = of("potency")[0];
  const row = variant.row ?? null;
  const priceAspect = of("price").find(a => a.value !== null);
  const weightAspect = of("weight").find(a => a.value !== null);
  const sets = of("set").map(a => ({path: a.path, value: a.value}));
  if ( row ) for ( const [path, value] of Object.entries(row.set) ) sets.push({path, value});
  const nameParts = {base: baseName, tier: variant.tier ?? "", name: row?.name ?? "", percent: percentText(variant.factor)};
  return {
    key: variant.key,
    factor: variant.factor,
    pattern: patternOf(template),
    nameParts,
    name: itemName(patternOf(template), nameParts),
    potency: potency ? {applies: potency.applies, factor: round(aspectFactor(potency, variant.factor))} : null,
    price: {
      factor: product(of("price"), riders.reduce((f, r) => f * factorOf(r.percent), 1)),
      value: row?.price ?? priceAspect?.value ?? null
    },
    weight: {factor: product(of("weight")), value: row?.weight ?? weightAspect?.value ?? null},
    rarity: of("rarity").at(-1)?.value ?? "",
    sets,
    riders: riders.map(({kind, ...r}) => r),
    img: row?.img ?? "",
    note: row?.note ?? ""
  };
}

/** A number from a cell: "1,5" and "1.5" alike; empty: null. */
const cellNumber = cell => optional(cell);

/**
 * Rows from pasted spreadsheet text. The header names the columns: name, price, weight, img, note (or the
 * labels given), anything else with a dot is a data path ("system.material"). Unknown headers are reported.
 * @param {string} text
 * @param {Record<string, string>} [labels]   field -> label, matched case-insensitively
 * @returns {{rows: object[], columns: string[], unknown: string[]}}
 */
export function rowsFromTSV(text, labels = {}) {
  const [header = [], ...body] = parseTSV(text);
  const byLabel = Object.fromEntries(Object.entries(labels).map(([k, l]) => [String(l).toLowerCase(), k]));
  const fields = header.map(h => {
    const key = h.trim();
    if ( ROW_FIELDS.includes(key.toLowerCase()) ) return key.toLowerCase();
    if ( byLabel[key.toLowerCase()] ) return byLabel[key.toLowerCase()];
    return key.includes(".") ? `set:${key}` : null;
  });
  const rows = body.filter(r => r.some(c => c.trim() !== "")).map(cells => {
    const row = {set: {}};
    fields.forEach((field, i) => {
      const cell = (cells[i] ?? "").trim();
      if ( !field ) return;
      if ( field.startsWith("set:") ) row.set[field.slice(4)] = cell;
      else row[field] = ["price", "weight"].includes(field) ? cellNumber(cell) : cell;
    });
    return repairRow(row);
  }).filter(Boolean);
  return {
    rows,
    columns: fields.filter(f => f?.startsWith("set:")).map(f => f.slice(4)),
    unknown: header.filter((h, i) => !fields[i] && h.trim())
  };
}

/** Rows as spreadsheet text, the extra data path columns included. */
export function rowsToTSV(variance) {
  const header = [...ROW_FIELDS, ...variance.columns];
  return toTSV(header, variance.rows.map(r => [
    r.name, r.price ?? "", r.weight ?? "", r.img, r.note, ...variance.columns.map(p => r.set[p] ?? "")
  ]));
}

/** A template copied from a preset: a new id and name, the preset's settings. */
export function fromPreset(preset, id, name) {
  return repairTemplate({...preset.template, id, name: name || preset.label});
}
