// Build: turn a project's world documents into the Adventure in its content module's compendium.
//   1. collect the project's documents and everything they depend on (adding those to the project)
//   2. copy files from user data into modules/<id>/assets/ and rewrite the paths - in the export only
//   3. create or update the Adventure, under the stable id from the content module's manifest
// Runs entirely in the browser, so it works on a hosted Foundry as well.
import {assetTarget, classifyAsset, findAssetPaths, folderChain, rewriteAssets} from "./assets.mjs";
import {COLLECTION_OF, MODULE_ID, assign, members} from "./project.mjs";
import {CONTENT_TYPES, classifyPacks, findReferences} from "./refs.mjs";

/**
 * @typedef {object} BuildReport
 * @property {Record<string, number>} counts      documents per collection in the Adventure
 * @property {string[]} added                     names of documents pulled in as dependencies
 * @property {string[]} missing                   references to world documents that do not exist
 * @property {Map<string, string[]>} modules      other modules the content refers to (packs or files)
 * @property {string[]} systemPacks               compendiums of the game system referred to
 * @property {{from: string, to: string}[]} copied
 * @property {{path: string, error: string}[]} failedAssets
 * @property {boolean} created                    true when the Adventure did not exist before
 */

/**
 * @param {Module} project
 * @param {{onProgress?: (label: string, pct: number) => void}} [options]
 * @returns {Promise<BuildReport>}
 */
export async function buildProject(project, {onProgress = () => {}} = {}) {
  const config = project.flags[MODULE_ID];
  const pack = game.packs.get(`${project.id}.${config.pack}`);
  if ( !pack ) throw new Error(_loc("DEWARIM_STUDIO.Build.NoPack", {module: project.title}));
  if ( pack.documentName !== "Adventure" ) throw new Error(`${pack.collection} is not an Adventure pack`);

  onProgress(_loc("DEWARIM_STUDIO.Build.Collecting"), 0.05);
  const {docs, added, missing, packs} = await collect(project);
  if ( added.length ) await assign(added, project);

  // Serialize as the core Adventure exporter does, minus the studio's own flags
  const content = Object.fromEntries(Object.values(COLLECTION_OF).map(c => [c, []]));
  for ( const doc of docs ) content[COLLECTION_OF[doc.documentName]].push(serialize(doc));
  content.folders = collectFolders(docs).map(serialize);

  // Files
  onProgress(_loc("DEWARIM_STUDIO.Build.Assets"), 0.2);
  const extensions = new Set(Object.keys(CONST.UPLOADABLE_FILE_EXTENSIONS)
    .filter(e => !(e in CONST.TEXT_FILE_EXTENSIONS)));
  const paths = new Set(Object.values(content).flatMap(list => list.flatMap(d => [...findAssetPaths(d, extensions)])));
  const modules = new Map();
  const toCopy = [];
  for ( const path of paths ) {
    const {kind, packageId} = classifyAsset(path, {moduleId: project.id});
    if ( kind === "copy" ) toCopy.push(path);
    else if ( kind === "module" ) addTo(modules, packageId, path);
  }
  const {mapping, copied, failedAssets} = await copyAssets(toCopy, project.id,
    pct => onProgress(_loc("DEWARIM_STUDIO.Build.Assets"), 0.2 + (0.7 * pct)));
  for ( const [name, list] of Object.entries(content) ) content[name] = list.map(d => rewriteAssets(d, mapping));

  const packRefs = classifyPacks(packs, {moduleId: project.id, systemId: game.system.id});
  for ( const [pkg, list] of packRefs.modules ) list.forEach(p => addTo(modules, pkg, p));

  // The Adventure
  onProgress(_loc("DEWARIM_STUDIO.Build.Writing"), 0.95);
  const data = {
    _id: config.adventureId,
    name: project.title,
    img: config.img ? rewriteAssets(config.img, mapping) : null,
    caption: config.caption ?? "",
    description: project.description ?? "",
    ...content
  };
  if ( pack.locked ) await pack.configure({locked: false});
  const Adventure = getDocumentClass("Adventure");
  const exists = pack.index.has(data._id);
  if ( exists ) await Adventure.updateDocuments([data], {pack: pack.collection, diff: false, recursive: false});
  else await Adventure.create(data, {pack: pack.collection, keepId: true});

  onProgress(_loc("DEWARIM_STUDIO.Build.Done"), 1);
  return {
    counts: Object.fromEntries(Object.entries(content).map(([k, v]) => [k, v.length]).filter(([, n]) => n)),
    added: added.map(d => `${d.documentName}: ${d.name}`),
    missing,
    modules,
    systemPacks: packRefs.system,
    copied,
    failedAssets,
    created: !exists
  };
}

/**
 * The project's documents plus the closure of the world documents they refer to.
 * @returns {Promise<{docs: ClientDocument[], added: ClientDocument[], missing: string[], packs: Set<string>}>}
 */
async function collect(project) {
  const initial = Object.values(members(project.id)).flat();
  const seen = new Set(initial.map(d => d.uuid));
  const docs = [...initial];
  const added = [];
  const missing = new Set();
  const packs = new Set();
  for ( let i = 0; i < docs.length; i++ ) {
    const doc = docs[i];
    const refs = findReferences(doc.documentName, doc.toObject());
    refs.packs.forEach(p => packs.add(p));
    for ( const uuid of refs.world ) {
      if ( seen.has(uuid) ) continue;
      seen.add(uuid);
      const [type, id] = uuid.split(".");
      if ( !CONTENT_TYPES.includes(type) ) continue;
      const ref = game.collections.get(type).get(id);
      if ( !ref ) {
        missing.add(`${doc.name}: ${uuid}`);
        continue;
      }
      docs.push(ref);
      added.push(ref);
    }
  }
  return {docs, added, missing: [...missing], packs};
}

/** The folders of the collected documents and all their ancestors. */
function collectFolders(docs) {
  const folders = new Map();
  for ( const doc of docs ) {
    if ( !doc.folder ) continue;
    for ( const f of [doc.folder, ...doc.folder.ancestors] ) folders.set(f.id, f);
  }
  return [...folders.values()];
}

function serialize(doc) {
  const data = doc.toCompendium(null, {
    clearSort: false, clearFolder: false, clearFlags: false, clearSource: false,
    clearOwnership: true, clearState: true, keepId: true
  });
  doc.constructor._clearFieldsRecursively(data, ["_stats.duplicateSource", "_stats.exportSource"]);
  if ( data.flags?.[MODULE_ID] ) {
    // Project bookkeeping stays here; encounter drafts on a scene go along, to be placed in play
    const encounters = data.flags[MODULE_ID].encounters;
    delete data.flags[MODULE_ID];
    if ( encounters?.length ) data.flags[MODULE_ID] = {encounters};
  }
  return data;
}

/**
 * Copy files into the content module. A file whose copy already has the same size is not sent again.
 * @returns {Promise<{mapping: Map<string, string>, copied: {from: string, to: string}[],
 *   failedAssets: {path: string, error: string}[]}>}
 */
async function copyAssets(paths, moduleId, onProgress) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const mapping = new Map();
  const copied = [];
  const failedAssets = [];
  const readyFolders = new Set();
  let done = 0;
  for ( const path of paths ) {
    const target = assetTarget(path, moduleId);
    const folder = target.slice(0, target.lastIndexOf("/"));
    const name = target.slice(folder.length + 1);
    const clientPath = foundry.utils.encodeURL(target);
    try {
      const source = await fetch(foundry.utils.getRoute(path));
      if ( !source.ok ) throw new Error(`HTTP ${source.status}`);
      const existing = await fetch(foundry.utils.getRoute(clientPath), {method: "HEAD"});
      // A compressed (chunked) response has no length - then it is copied rather than guessed
      const length = source.headers.get("content-length");
      const sameSize = existing.ok && (length !== null) && (existing.headers.get("content-length") === length);
      if ( sameSize ) {
        await source.body?.cancel();
        mapping.set(path, clientPath);
      } else {
        await ensureFolder(FilePicker, folder, readyFolders);
        const blob = await source.blob();
        const response = await FilePicker.upload("data", folder, new File([blob], name, {type: blob.type}),
          {}, {notify: false});
        if ( !response?.path ) throw new Error("upload refused");
        mapping.set(path, response.path);
        copied.push({from: path, to: response.path});
      }
    } catch(err) {
      failedAssets.push({path, error: err.message});
    }
    onProgress(++done / paths.length);
  }
  return {mapping, copied, failedAssets};
}

async function ensureFolder(FilePicker, folder, ready) {
  for ( const path of folderChain(folder) ) {
    if ( ready.has(path) ) continue;
    try {
      await FilePicker.browse("data", path);
    } catch {
      await FilePicker.createDirectory("data", path);
    }
    ready.add(path);
  }
}

function addTo(map, key, value) {
  if ( !map.has(key) ) map.set(key, []);
  if ( !map.get(key).includes(value) ) map.get(key).push(value);
}
