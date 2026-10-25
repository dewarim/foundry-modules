// Copied from dewarim-studio/scripts/filters.mjs (modules cannot import each other's files) - keep the two
// in step. Used here for the condition filter on a merchant's stock candidates.

const CONDITION = /^([a-z][\w.]*)(<=|>=|!=|<|>|=)(.+)$/i;

/**
 * Split a filter text into name words and conditions. Quoted words keep their spaces.
 * @param {string} text
 * @returns {{words: string[], conditions: {key: string, op: string, value: string}[]}}
 */
export function parseQuery(text) {
  const words = [];
  const conditions = [];
  for ( const [, quoted, plain] of String(text ?? "").matchAll(/"([^"]*)"|(\S+)/g) ) {
    const token = quoted ?? plain;
    const match = (quoted === undefined) && token.match(CONDITION);
    if ( match ) conditions.push({key: match[1].toLowerCase(), op: match[2], value: match[3]});
    else if ( token ) words.push(token.toLowerCase());
  }
  return {words, conditions};
}

/** "2", "0.5", "1/4", "2,5" as a number; anything else: NaN. */
export function toNumber(value) {
  if ( typeof value === "number" ) return value;
  const s = String(value ?? "").trim().replace(",", ".");
  const fraction = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if ( fraction ) return Number(fraction[1]) / Number(fraction[2]);
  return s === "" ? NaN : Number(s);
}

/** One comparison. Numbers compare as numbers, anything else as case-insensitive text (= and != only). */
function compare(actual, op, wanted) {
  // A set or list (dnd5e rarities) matches when one of its values does
  if ( (actual instanceof Set) || Array.isArray(actual) ) {
    const values = [...actual];
    return op === "!=" ? values.every(v => compare(v, op, wanted)) : values.some(v => compare(v, op, wanted));
  }
  if ( (actual === undefined) || (actual === null) || (actual === "") ) return op === "!=";
  const a = toNumber(actual);
  const w = toNumber(wanted);
  if ( !Number.isNaN(a) && !Number.isNaN(w) ) {
    switch ( op ) {
      case "<": return a < w;
      case "<=": return a <= w;
      case ">": return a > w;
      case ">=": return a >= w;
      case "=": return a === w;
      case "!=": return a !== w;
    }
  }
  const sa = String(actual).toLowerCase();
  const sw = String(wanted).toLowerCase();
  if ( op === "=" ) return sa === sw;
  if ( op === "!=" ) return sa !== sw;
  return false;
}

/**
 * Does an entry match? Every word must be in one of the texts, every condition must hold.
 * @param {{words: string[], conditions: object[]}} query  from parseQuery
 * @param {string[]} texts                                 the entry's name and other searchable text
 * @param {(key: string) => *} valueOf                     the entry's value for a condition key;
 *                                                         undefined for an unknown key or a missing value
 */
export function matchesQuery(query, texts, valueOf = () => undefined) {
  const haystack = texts.map(t => String(t ?? "").toLowerCase());
  if ( !query.words.every(w => haystack.some(t => t.includes(w))) ) return false;
  return query.conditions.every(c => compare(valueOf(c.key), c.op, c.value));
}

/** Condition keys the query uses that no field defines - shown as a hint, so a typo does not just empty the list. */
export function unknownKeys(query, known) {
  return [...new Set(query.conditions.map(c => c.key))].filter(k => !known.includes(k));
}
