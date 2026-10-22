// Which files a document uses and where they go in the content module - the pure half of the asset copy.
// Works on plain data, so `node --test` covers it (test/assets.test.mjs).
// dewarim-file-commander references.mjs repoints the same kinds of paths in the world itself.
import {walkStrings} from "./refs.mjs";

// Served from Foundry's own public directory, present on every installation.
const CORE_PREFIXES = ["icons/", "ui/", "sounds/", "cards/", "fonts/", "assets/core/"];

const HTML_REFERENCE = /(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g;

/**
 * Whether a string is a path to a file with one of the extensions (query string and fragment ignored).
 * @param {string} value
 * @param {Set<string>} extensions  lower case, without dot
 */
export function isFilePath(value, extensions) {
  if ( (value.length > 500) || /[\n<>"]/.test(value) ) return false;
  const clean = value.replace(/[?#].*$/, "");
  const dot = clean.lastIndexOf(".");
  if ( (dot < 0) || clean.endsWith("/") ) return false;
  return extensions.has(clean.slice(dot + 1).toLowerCase());
}

/**
 * Every file path in a data tree: plain path values and src/href/url() references inside HTML.
 * @param {object} data
 * @param {Set<string>} extensions
 * @returns {Set<string>}  the paths exactly as written
 */
export function findAssetPaths(data, extensions) {
  const found = new Set();
  walkStrings(data, s => {
    if ( isFilePath(s, extensions) ) found.add(s);
    else if ( s.includes("<") || s.includes("url(") ) {
      for ( const [, attr, url] of s.matchAll(HTML_REFERENCE) ) {
        const ref = attr ?? url;
        if ( isFilePath(ref, extensions) ) found.add(ref);
      }
    }
  });
  return found;
}

/**
 * What a path means for the content module.
 * - remote: http(s), data: or blob: - left alone
 * - core:   part of Foundry itself
 * - system: inside the game system (`packageId`)
 * - own:    already inside the content module
 * - module: inside another module (`packageId`) - a dependency
 * - copy:   user data (uploads, world folders, ...) - copied into the module
 * @param {string} path
 * @param {{moduleId: string}} context
 * @returns {{kind: string, packageId?: string}}
 */
export function classifyAsset(path, {moduleId}) {
  if ( /^(https?:|data:|blob:)/i.test(path) ) return {kind: "remote"};
  const p = path.replace(/^\/+/, "");
  if ( CORE_PREFIXES.some(prefix => p.startsWith(prefix)) ) return {kind: "core"};
  const [root, packageId] = p.split("/");
  if ( root === "systems" ) return {kind: "system", packageId};
  if ( root === "modules" ) return packageId === moduleId ? {kind: "own"} : {kind: "module", packageId};
  return {kind: "copy"};
}

/**
 * The unencoded path a copied file gets inside the content module. Deterministic, so a rebuild maps a
 * file to the same place: `assets/upload/x.png` -> `modules/<id>/assets/upload/x.png`,
 * `worlds/<w>/a/x.png` -> `modules/<id>/assets/world/a/x.png`, anything else keeps its full path below
 * `modules/<id>/assets/`.
 * @param {string} path
 * @param {string} moduleId
 * @returns {string}
 */
export function assetTarget(path, moduleId) {
  const p = path.replace(/^\/+/, "").replace(/[?#].*$/, "")
    .split("/").map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  let rest;
  if ( p[0] === "assets" ) rest = p.slice(1);
  else if ( p[0] === "worlds" ) rest = ["world", ...p.slice(2)];
  else rest = p;
  return ["modules", moduleId, "assets", ...rest].join("/");
}

/**
 * Replace paths in a data tree: whole-string matches and occurrences inside HTML/CSS strings.
 * Returns a new tree; the input is untouched.
 * @param {*} data
 * @param {Map<string, string>} mapping  old path -> new path
 * @returns {*}
 */
export function rewriteAssets(data, mapping) {
  if ( !mapping.size ) return structuredClone(data);
  const keys = [...mapping.keys()].sort((a, b) => b.length - a.length);
  const rewrite = value => {
    if ( typeof value === "string" ) {
      if ( mapping.has(value) ) return mapping.get(value);
      if ( !value.includes("<") && !value.includes("url(") ) return value;
      let out = value;
      for ( const key of keys ) {
        if ( !out.includes(key) ) continue;
        out = out.replace(new RegExp(`(["'(]\\s*)${escapeRegExp(key)}(\\s*["')])`, "g"),
          (_, pre, post) => `${pre}${mapping.get(key)}${post}`);
      }
      return out;
    }
    if ( Array.isArray(value) ) return value.map(rewrite);
    if ( value && (typeof value === "object") ) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "_stats" ? structuredClone(v) : rewrite(v)]));
    }
    return value;
  };
  return rewrite(data);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every prefix of a folder path, shortest first: "a/b/c" -> ["a", "a/b", "a/b/c"].
 * (Same as dewarim-image-drop's; modules cannot import each other's files.)
 * @param {string} folder
 * @returns {string[]}
 */
export function folderChain(folder) {
  const segments = folder ? folder.split("/") : [];
  return segments.map((_, i) => segments.slice(0, i + 1).join("/"));
}
