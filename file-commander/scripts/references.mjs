// The pure half of repointing: where a file path occurs in a document's data, and the update that points
// those places at another file. Works on plain source data plus a description of the embedded collections,
// so `node --test` covers it (test/references.test.mjs). The studio's asset rewrite (dewarim-studio
// assets.mjs) does the same for its export; modules cannot import each other's files.

/** Fields that record history, not use. */
const SKIP = new Set(["_id", "_stats", "ownership", "sort"]);

function decode(path) {
  try { return decodeURI(path); }
  catch { return path; }
}

/** The forms a path is stored in: as written, decoded, URL-encoded. */
export function pathVariants(path) {
  return [...new Set([path, decode(path), encodeURI(decode(path))])].filter(Boolean);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A path inside HTML or CSS: in quotes or url(), optionally followed by a query or fragment. */
function embeddedPattern(variant) {
  return new RegExp(`(["'(]\\s*)${escapeRegExp(variant)}(?=\\s*["')?#])`, "g");
}

/**
 * A string with `from` pointed at `to`: the whole string, or each occurrence inside HTML/CSS. The form is
 * kept - a path stored decoded gets the decoded new path.
 * @returns {string|null}  null when the string does not use `from`
 */
export function replaceInString(value, from, to) {
  const variants = pathVariants(from);
  const decodedTo = decode(to);
  const formOf = v => {
    if ( v === from ) return to;
    return v === decode(v) ? decodedTo : encodeURI(decodedTo);
  };
  for ( const v of variants ) if ( value === v ) return formOf(v);
  if ( !value.includes("<") && !value.includes("url(") ) return null;
  // Matches counted, not compared: finding uses replaces a path with itself
  let out = value;
  let matched = false;
  for ( const v of variants ) {
    out = out.replace(embeddedPattern(v), (_, pre) => {
      matched = true;
      return `${pre}${formOf(v)}`;
    });
  }
  return matched ? out : null;
}

/**
 * Plan the update of one document.
 * @param {object} source     the document's source data (toObject())
 * @param {string} from       old path
 * @param {string} to         new path
 * @param {object} embedded   embedded collections: {key: {documentName, embedded}} for arrays of documents
 *                            ("tokens"), the same with `single: true` for one embedded document ("delta")
 * @returns {{update: object, children: Record<string, {documentName: string, entries: {_id: string, plan: object}[]}>, fields: string[]}|null}
 *   update: dotted fields of this document; children: per collection key, plans of embedded documents;
 *   fields: readable paths of every use, for the report. null when nothing uses `from`.
 */
export function planUpdate(source, from, to, embedded = {}) {
  const update = {};
  const children = {};
  const fields = [];

  for ( const [key, value] of Object.entries(source ?? {}) ) {
    if ( SKIP.has(key) || (value === null) || (value === undefined) ) continue;
    const spec = embedded[key];
    if ( spec && !spec.single && Array.isArray(value) ) {
      const entries = [];
      for ( const child of value ) {
        const plan = planUpdate(child, from, to, spec.embedded ?? {});
        if ( !plan ) continue;
        entries.push({_id: child._id, plan});
        const label = child.name ? `${key}[${child.name}]` : `${key}[${child._id}]`;
        fields.push(...plan.fields.map(f => `${label}.${f}`));
      }
      if ( entries.length ) children[key] = {documentName: spec.documentName, entries};
      continue;
    }
    if ( spec?.single && (typeof value === "object") ) {
      // One embedded document (a token's delta): its fields go into the parent's update
      const plan = planUpdate(value, from, to, spec.embedded ?? {});
      if ( !plan ) continue;
      for ( const [k, v] of Object.entries(plan.update) ) update[`${key}.${k}`] = v;
      for ( const [k, c] of Object.entries(plan.children) ) children[`${key}.${k}`] = c;
      fields.push(...plan.fields.map(f => `${key}.${f}`));
      continue;
    }
    collect(value, [key]);
  }

  // Plain data: objects are walked into (dotted keys), an array is replaced as a whole
  function collect(value, path) {
    if ( typeof value === "string" ) {
      const replaced = replaceInString(value, from, to);
      if ( replaced !== null ) {
        update[path.join(".")] = replaced;
        fields.push(path.join("."));
      }
    }
    else if ( Array.isArray(value) ) {
      const found = [];
      const rewritten = rewriteTree(value, from, to, found);
      if ( found.length ) {
        update[path.join(".")] = rewritten;
        fields.push(...found.map(f => [...path, ...f].join(".")));
      }
    }
    else if ( value && (typeof value === "object") ) {
      for ( const [k, v] of Object.entries(value) ) collect(v, [...path, k]);
    }
  }

  return (Object.keys(update).length || Object.keys(children).length) ? {update, children, fields} : null;
}

/** A copy of a data tree with `from` pointed at `to`; `found` collects the paths (as arrays) of each use. */
function rewriteTree(value, from, to, found, path = []) {
  if ( typeof value === "string" ) {
    const replaced = replaceInString(value, from, to);
    if ( replaced === null ) return value;
    found.push(path);
    return replaced;
  }
  if ( Array.isArray(value) ) return value.map((v, i) => rewriteTree(v, from, to, found, [...path, i]));
  if ( value && (typeof value === "object") ) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteTree(v, from, to, found, [...path, k])]));
  }
  return value;
}

/** How many places a plan changes, embedded documents included. */
export function countUses(plan) {
  return plan ? plan.fields.length : 0;
}
