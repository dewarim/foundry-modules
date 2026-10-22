// The pure half of the tables: turning cell input into values, values into cell text, edits into
// one batched update. No Foundry globals, so `node --test` covers it (test/table-model.test.mjs).

/** Column types a cell can have. */
export const CELL_TYPES = ["text", "formula", "number", "boolean", "select", "set", "image"];

/**
 * Choices in any of the shapes Foundry and systems use, as a list:
 * {key: "Label"}, {key: {label}}, ["a", "b"], or [{value, label}].
 * @param {object|Array|undefined} choices
 * @returns {{value: string, label: string}[]}
 */
export function normalizeChoices(choices) {
  if ( !choices ) return [];
  if ( Array.isArray(choices) ) {
    return choices.map(c => (typeof c === "object") ? {value: String(c.value), label: String(c.label ?? c.value)}
      : {value: String(c), label: String(c)});
  }
  return Object.entries(choices).map(([value, c]) => ({
    value,
    label: String((typeof c === "object") && (c !== null) ? (c.label ?? c.name ?? value) : c)
  }));
}

/**
 * Parse what was typed into a cell.
 * @param {string} type        one of CELL_TYPES
 * @param {string|boolean} raw the input's value (checked state for booleans)
 * @param {{nullable?: boolean, choices?: {value: string}[], numeric?: boolean}} [options]
 *   numeric: a select whose values are numbers (ownership levels, grid types)
 * @returns {{value: *}|{error: string}}
 */
export function coerce(type, raw, {nullable = false, choices = [], numeric = false} = {}) {
  const allowed = new Set(choices.map(c => c.value));
  switch ( type ) {
    case "boolean":
      return {value: Boolean(raw)};
    case "number": {
      const s = String(raw).trim().replace(",", ".");
      if ( s === "" ) return nullable ? {value: null} : {error: "a number is required"};
      const fraction = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);     // "1/4", the way challenge ratings are written
      const n = fraction ? (Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : NaN) : Number(s);
      return Number.isFinite(n) ? {value: n} : {error: `not a number: ${raw}`};
    }
    case "select": {
      const s = String(raw);
      if ( (s === "") && nullable ) return {value: null};
      if ( allowed.size && !allowed.has(s) && (s !== "") ) return {error: `not a choice: ${s}`};
      return {value: numeric && (s !== "") ? Number(s) : s};
    }
    case "set": {
      const values = [...new Set(String(raw).split(/[,;]/).map(s => s.trim()).filter(Boolean))];
      const unknown = allowed.size ? values.filter(v => !allowed.has(v)) : [];
      return unknown.length ? {error: `not a choice: ${unknown.join(", ")}`} : {value: values};
    }
    default:
      return {value: String(raw).trim()};
  }
}

/**
 * The text a cell shows for a value (booleans stay booleans, for checkboxes).
 * @param {string} type
 * @param {*} value
 * @returns {string|boolean}
 */
export function formatValue(type, value) {
  if ( type === "boolean" ) return Boolean(value);
  if ( (value === null) || (value === undefined) ) return "";
  if ( type === "set" ) return [...value].join(", ");
  return String(value);
}

/**
 * Edits as one update per document, ready for `updateDocuments`.
 * @param {Map<string, Map<string, *>>} dirty  document id -> (data path -> new value)
 * @param {Record<string, (value: *, id: string) => object>} [writers]  columns that are not a plain data
 *   path (a scene's background lives on its level): path -> the update data for a value
 * @returns {object[]}  [{_id, "system.x": 1, ...}]
 */
export function collectUpdates(dirty, writers = {}) {
  const updates = [];
  for ( const [id, cells] of dirty ) {
    if ( !cells.size ) continue;
    const update = {_id: id};
    for ( const [path, value] of cells ) {
      if ( writers[path] ) mergeUpdate(update, writers[path](value, id));
      else update[path] = value;
    }
    updates.push(update);
  }
  return updates;
}

/** Merge update data; arrays of embedded documents merge by _id (two columns on the same level). */
export function mergeUpdate(target, patch) {
  for ( const [key, value] of Object.entries(patch) ) {
    const current = target[key];
    if ( Array.isArray(value) && Array.isArray(current) ) {
      for ( const entry of value ) {
        const same = entry?._id && current.find(c => c?._id === entry._id);
        if ( same ) mergeUpdate(same, entry);
        else current.push(entry);
      }
    }
    else if ( isPlain(value) && isPlain(current) ) mergeUpdate(current, value);
    else target[key] = value;
  }
  return target;
}

function isPlain(value) {
  return (value !== null) && (typeof value === "object") && !Array.isArray(value);
}

/**
 * Record an edit, or drop it again when the value is back to what the document has.
 * @param {Map<string, Map<string, *>>} dirty
 * @param {string} id
 * @param {string} path
 * @param {*} value
 * @param {*} original  the document's current value
 */
export function setEdit(dirty, id, path, value, original) {
  const same = JSON.stringify(normalize(value)) === JSON.stringify(normalize(original));
  if ( same ) {
    dirty.get(id)?.delete(path);
    if ( dirty.get(id)?.size === 0 ) dirty.delete(id);
    return;
  }
  if ( !dirty.has(id) ) dirty.set(id, new Map());
  dirty.get(id).set(path, value);
}

function normalize(value) {
  if ( value instanceof Set ) return [...value].sort();
  if ( Array.isArray(value) ) return [...value].sort();
  return value ?? null;
}
