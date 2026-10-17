// The pure half of the image drop: which files to take, what to call them, where they go.
// No Foundry globals in here, so `node --test` can cover it (test/upload-plan.test.mjs).

/**
 * The extension of a file name, lower case and without the dot ("" when there is none).
 * @param {string} name
 * @returns {string}
 */
export function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Whether a dropped file is an image Foundry accepts. The extension decides, as it does for the server's
 * upload check; the MIME type is not reliable across operating systems.
 * @param {{name: string}} file
 * @param {string[]} imageExtensions  Object.keys(CONST.IMAGE_FILE_EXTENSIONS)
 * @returns {boolean}
 */
export function isImageFile(file, imageExtensions) {
  return imageExtensions.includes(extensionOf(file.name));
}

/**
 * A file name that is safe in a URL path: diacritics stripped, anything outside [a-z0-9._-] turned into
 * a hyphen, runs of hyphens collapsed. The extension is kept and lower-cased.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFileName(name) {
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  const clean = stem.normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const base = clean || "image";
  return ext ? `${base}.${ext}` : base;
}

/**
 * The first name not yet taken: "map.png", then "map-1.png", "map-2.png" ...
 * The upload endpoint overwrites an existing file without asking, so the module never relies on it.
 * @param {string} name     An already sanitized file name
 * @param {Set<string>} taken  Names present in the target folder (and names claimed earlier in this drop)
 * @returns {string}
 */
export function uniqueFileName(name, taken) {
  if ( !taken.has(name) ) return name;
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  for ( let i = 1; ; i++ ) {
    const candidate = ext ? `${stem}-${i}.${ext}` : `${stem}-${i}`;
    if ( !taken.has(candidate) ) return candidate;
  }
}

/**
 * Normalize a configured folder: forward slashes, no leading/trailing slash, no empty or "." segments.
 * Rejects ".." so a setting cannot point outside the data directory.
 * @param {string} folder
 * @returns {string}
 */
export function normalizeFolder(folder) {
  const segments = folder.replace(/\\/g, "/").split("/").filter(s => s && (s !== "."));
  if ( segments.includes("..") ) throw new Error(`Folder must not contain "..": ${folder}`);
  return segments.join("/");
}

/**
 * Every prefix of a folder path, shortest first: "a/b/c" -> ["a", "a/b", "a/b/c"].
 * Foundry's createDirectory is not recursive, so the folder is created one level at a time.
 * @param {string} folder  A normalized folder
 * @returns {string[]}
 */
export function folderChain(folder) {
  const segments = folder ? folder.split("/") : [];
  return segments.map((_, i) => segments.slice(0, i + 1).join("/"));
}

/**
 * The plan for one drop: the image files with the names they will be stored under, and the files skipped.
 * @param {{name: string}[]} files
 * @param {{imageExtensions: string[], existing: Iterable<string>}} options
 * @returns {{uploads: {file: object, name: string}[], skipped: {name: string}[]}}
 */
export function planUploads(files, {imageExtensions, existing}) {
  const taken = new Set(existing);
  const uploads = [];
  const skipped = [];
  for ( const file of files ) {
    if ( !isImageFile(file, imageExtensions) ) {
      skipped.push(file);
      continue;
    }
    const name = uniqueFileName(sanitizeFileName(file.name), taken);
    taken.add(name);
    uploads.push({file, name});
  }
  return {uploads, skipped};
}

/**
 * The bare file names in a FilePicker.browse result, whose `files` are URL-encoded paths.
 * @param {string[]} paths
 * @returns {string[]}
 */
export function baseNames(paths) {
  return paths.map(p => {
    const last = p.split("/").pop() ?? "";
    try { return decodeURIComponent(last); }
    catch { return last; }
  });
}
