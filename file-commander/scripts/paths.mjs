// The pure half of the file commander: paths, file kinds, names that do not collide, selections.
// No Foundry globals, so `node --test` covers it (test/paths.test.mjs).

/** Decode one URL-encoded path segment, leaving malformed ones as they are. */
function decode(segment) {
  try { return decodeURIComponent(segment); }
  catch { return segment; }
}

/** "a/b/c.png" -> "c.png" (decoded) */
export function basename(path) {
  return decode(String(path).replace(/\/+$/, "").split("/").pop() ?? "");
}

/** "a/b/c.png" -> "a/b"; "a" -> "" */
export function parent(path) {
  const parts = String(path).replace(/\/+$/, "").split("/");
  parts.pop();
  return parts.join("/");
}

/** Join path parts with single slashes, dropping empty ones. */
export function join(...parts) {
  return parts.flatMap(p => String(p ?? "").split("/")).filter(Boolean).join("/");
}

/** Breadcrumb entries for a folder: [{name, path}], starting at the root. */
export function crumbs(path, rootName) {
  const segments = String(path ?? "").split("/").filter(Boolean);
  return [{name: rootName, path: ""}, ...segments.map((s, i) => ({name: decode(s), path: segments.slice(0, i + 1).join("/")}))];
}

/** Extension, lower case, without dot ("" when none). */
export function extensionOf(name) {
  const base = basename(name);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * What kind of file a path is, by extension.
 * @param {string} path
 * @param {{image: string[], video: string[], audio: string[]}} kinds  extension lists (CONST.*_FILE_EXTENSIONS keys)
 * @returns {"image"|"video"|"audio"|"other"}
 */
export function fileKind(path, kinds) {
  const ext = extensionOf(path);
  for ( const kind of ["image", "video", "audio"] ) if ( kinds[kind]?.includes(ext) ) return kind;
  return "other";
}

/**
 * The first free name: "map.png", "map-1.png", "map-2.png" ... (the server overwrites media files
 * without asking, so a copy must never reuse a taken name).
 * @param {string} name
 * @param {Set<string>} taken
 */
export function uniqueName(name, taken) {
  if ( !taken.has(name) ) return name;
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  for ( let i = 1; ; i++ ) {
    const candidate = ext ? `${stem}-${i}.${ext}` : `${stem}-${i}`;
    if ( !taken.has(candidate) ) return candidate;
  }
}

/**
 * Which file goes where in a copy, without collisions in the target folder.
 * @param {string[]} paths     source file paths
 * @param {string} target      target folder
 * @param {Iterable<string>} existing  names already in the target folder
 * @param {string[]} [names]   wanted names (rename by copying); default: the sources' own names
 * @returns {{from: string, name: string, to: string, wanted: string}[]}  name differs from wanted when taken
 */
export function planCopy(paths, target, existing, names) {
  const taken = new Set(existing);
  return paths.map((from, i) => {
    const wanted = names?.[i] ?? basename(from);
    const name = uniqueName(wanted, taken);
    taken.add(name);
    return {from, name, to: join(target, name), wanted};
  });
}

/**
 * New names for "copy as": what the user typed, applied to one or several files.
 * - The extension is kept: "goblin-chief" for "a1b2.webp" gives "goblin-chief.webp"; a typed extension
 *   that differs is kept too (the user means it), a missing one is added.
 * - {n} numbers the files; several files without {n} get "-1", "-2" ... appended.
 * - Slashes cannot name a file and become hyphens; an empty result falls back to the original name.
 * @param {string} input
 * @param {string[]} originals  file names (not paths)
 * @returns {string[]}
 */
export function copyNames(input, originals) {
  const typed = String(input ?? "").trim().replace(/[\\/]+/g, "-");
  const numbered = typed.includes("{n}") || (originals.length < 2) ? typed : `${typed}-{n}`;
  return originals.map((original, i) => {
    let name = numbered.replaceAll("{n}", String(i + 1)).trim();
    if ( !name || /^\.+$/.test(name) ) return original;
    const ext = extensionOf(original);
    if ( ext && !extensionOf(name) ) name = `${name}.${ext}`;
    return name;
  });
}

/**
 * Commander-style selection: plain click selects one, ctrl/meta toggles, shift selects a range from the
 * anchor. Returns the new selection and anchor.
 * @param {string[]} order     all selectable paths in display order
 * @param {Set<string>} selected
 * @param {string|null} anchor
 * @param {string} clicked
 * @param {{ctrl?: boolean, shift?: boolean}} keys
 * @returns {{selected: Set<string>, anchor: string}}
 */
export function select(order, selected, anchor, clicked, {ctrl = false, shift = false} = {}) {
  if ( shift && anchor && order.includes(anchor) ) {
    const [a, b] = [order.indexOf(anchor), order.indexOf(clicked)].sort((x, y) => x - y);
    const range = order.slice(a, b + 1);
    return {selected: new Set(ctrl ? [...selected, ...range] : range), anchor};
  }
  if ( ctrl ) {
    const next = new Set(selected);
    if ( next.has(clicked) ) next.delete(clicked);
    else next.add(clicked);
    return {selected: next, anchor: clicked};
  }
  return {selected: new Set([clicked]), anchor: clicked};
}

/** A folder name a user typed: no slashes, no dot-only names, trimmed. Empty string when unusable. */
export function cleanFolderName(name) {
  const s = String(name ?? "").trim().replace(/[\\/]+/g, "-");
  return /^\.+$/.test(s) ? "" : s;
}
