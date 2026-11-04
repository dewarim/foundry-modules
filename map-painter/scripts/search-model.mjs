// The palette's search: a filter that looks through everything below the current folder, not only
// the folder itself. Pure - the function that lists a folder is handed in, so there is no
// FilePicker and no Foundry here and `node --test` covers it (test/search-model.test.mjs).
//
// A palette of images is a tree, and the thing a GM is looking for is almost never in the folder
// they happen to be standing in: with the textures module open at its root, "water" should find
// `liquids/water-deep_1` and `hatch/water_2` and the `water` swatch, three folders apart. Filtering
// one listing could not, so typing a name that was definitely there returned nothing.
//
// What costs something is that each folder is one request to the server. Hence the two caps below
// and the counts in the result: the search says how far it got, instead of quietly stopping.

/** How many folders one search will open, and how many images it will collect, before it stops. */
export const MAX_FOLDERS = 400;
export const MAX_RESULTS = 600;

/** `%20` and friends back to spaces, so what is typed matches what is shown. */
export function decode(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** A path as it reads below the folder the search started in: `assets/x/y.webp` -> `x/y.webp`. */
export function relative(path, root) {
  const from = decode(String(root ?? ""));
  const full = decode(String(path));
  const base = (!from || from.endsWith("/")) ? from : `${from}/`;
  return full.startsWith(base) ? full.slice(base.length) : full;
}

/**
 * A path with its extension taken off, which is the part worth searching.
 *
 * Not a nicety: every asset in the textures module is a `.webp`, so matching the whole path made
 * "web" - a real thing to type, there are two web colour folders - return all 148 of them plus
 * every rendered texture. An extension is never what someone means in a palette filter.
 */
export const withoutExtension = path => path.replace(/\.[^./]+$/, "");

/** The folder part of a relative path, or "" for something in the folder itself. */
export function folderOf(relativePath) {
  const cut = relativePath.lastIndexOf("/");
  return (cut > 0) ? relativePath.slice(0, cut) : "";
}

/** What was typed, as lowercase words. Several words are allowed, and all of them have to hit. */
export const terms = needle => decode(String(needle ?? "")).toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Does this path match?
 *
 * Case-insensitive on both sides, and matched against the *whole* path below the search root
 * rather than the file name alone - so `web red` finds `web-extended/red.webp`, and `hatch` lists
 * what is in the hatch folder without having to walk into it. Order does not matter; every word
 * has to appear somewhere. The extension is not part of it (see withoutExtension).
 */
export function matches(relativePath, searchTerms) {
  const haystack = relativePath.toLowerCase();
  return searchTerms.every(term => haystack.includes(term));
}

const byPath = root => (a, b) => relative(a, root).localeCompare(relative(b, root));

/**
 * Everything under `root` whose path matches `needle`.
 *
 * Breadth first, so that the shallow matches - the ones most likely to be meant - are found before
 * a cap can stop the search. A folder that cannot be read is skipped rather than fatal: one
 * unreadable corner of a tree should not lose the matches everywhere else, and the caller is told
 * which ones were skipped.
 *
 * @param {object} options
 * @param {(path: string) => Promise<{dirs: string[], files: string[]}>} options.browse  one folder
 * @param {string} options.root     where the search starts
 * @param {string} options.needle   what was typed
 * @param {(path: string) => boolean} [options.isImage]  which files are worth collecting
 * @param {number} [options.maxFolders]
 * @param {number} [options.maxResults]
 * @returns {Promise<{files: string[], dirs: string[], folders: number, truncated: boolean,
 *   deep: boolean, failed: string[]}>}  `truncated`: there were more images than maxResults.
 *   `deep`: folders were left unopened. `folders`: how many were opened.
 */
export async function searchTree({browse, root, needle, isImage, maxFolders = MAX_FOLDERS, maxResults = MAX_RESULTS}) {
  const searchTerms = terms(needle);
  const files = [];
  const dirs = [];
  const failed = [];
  const queue = [root];
  let folders = 0;
  let truncated = false;
  if ( !searchTerms.length ) return {files, dirs, folders, truncated, deep: false, failed};
  while ( queue.length && (folders < maxFolders) && !truncated ) {
    const here = queue.shift();
    folders++;
    let listing;
    try {
      listing = await browse(here);
    } catch {
      failed.push(here);
      continue;
    }
    for ( const dir of (listing?.dirs ?? []) ) {
      queue.push(dir);
      if ( matches(relative(dir, root), searchTerms) ) dirs.push(dir);
    }
    for ( const file of (listing?.files ?? []) ) {
      if ( isImage && !isImage(file) ) continue;
      if ( !matches(withoutExtension(relative(file, root)), searchTerms) ) continue;
      files.push(file);
      if ( files.length >= maxResults ) {
        truncated = true;
        break;
      }
    }
  }
  return {
    files: files.sort(byPath(root)), dirs: dirs.sort(byPath(root)),
    folders, truncated, deep: queue.length > 0, failed
  };
}
