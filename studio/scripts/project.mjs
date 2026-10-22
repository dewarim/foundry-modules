// Projects and membership. A project is an installed content module (manifest flag
// `dewarim-studio.content: true`). A world document belongs to it when it carries the flag
// `dewarim-studio.project = <module id>` or sits inside the project's folder in its sidebar - so dragging
// into the project folder is an assignment too. The build writes the flag onto everything it collects.
import {CONTENT_TYPES} from "./refs.mjs";

export const MODULE_ID = "dewarim-studio";

/** Collection name of each content type, as used by Adventure data and game.collections. */
export const COLLECTION_OF = {
  Actor: "actors", Cards: "cards", Item: "items", JournalEntry: "journal", Macro: "macros",
  Playlist: "playlists", RollTable: "tables", Scene: "scenes"
};

/** Every content module installed, active or not. */
export function projects() {
  return game.modules.filter(m => m.flags?.[MODULE_ID]?.content);
}

/** @returns {Module|undefined} */
export function getProject(id) {
  const module = game.modules.get(id);
  return module?.flags?.[MODULE_ID]?.content ? module : undefined;
}

/** The project new assignments go to (world setting), if it still exists. */
export function activeProject() {
  return getProject(game.settings.get(MODULE_ID, "activeProject"));
}

/** The project's top-level folder for a document type, or undefined. */
export function rootFolder(projectId, type) {
  return game.folders.find(f => (f.type === type) && (f.getFlag(MODULE_ID, "root") === projectId));
}

async function ensureRootFolder(project, type) {
  return rootFolder(project.id, type) ?? Folder.implementation.create({
    name: project.title,
    type,
    color: "#3a5f8a",
    flags: {[MODULE_ID]: {root: project.id}}
  });
}

/** The project a document belongs to, or undefined. */
export function projectOf(doc) {
  const flagged = doc.getFlag?.(MODULE_ID, "project");
  if ( flagged ) return flagged;
  const folders = doc.folder ? [doc.folder, ...doc.folder.ancestors] : [];
  return folders.map(f => f.getFlag(MODULE_ID, "root")).find(Boolean);
}

/** Every world document of the project, by content type. */
export function members(projectId) {
  const result = {};
  for ( const type of CONTENT_TYPES ) {
    result[type] = game.collections.get(type).filter(d => projectOf(d) === projectId);
  }
  return result;
}

/**
 * Put documents into a project: set the flag and, unless already inside the project's folder tree,
 * move them into its root folder. Documents of another project are moved over.
 * @param {ClientDocument[]} docs
 * @param {Module} project
 */
export async function assign(docs, project) {
  const byType = Map.groupBy(docs.filter(d => CONTENT_TYPES.includes(d.documentName)), d => d.documentName);
  for ( const [type, list] of byType ) {
    const root = await ensureRootFolder(project, type);
    const updates = list.map(doc => {
      const inTree = doc.folder && [doc.folder, ...doc.folder.ancestors].includes(root);
      const update = {_id: doc.id, [`flags.${MODULE_ID}.project`]: project.id};
      if ( !inTree ) update.folder = root.id;
      return update;
    });
    await getDocumentClass(type).updateDocuments(updates);
  }
}

/** Take documents out of their project: clear the flag and move them out of the project's folders. */
export async function unassign(docs) {
  const byType = Map.groupBy(docs.filter(d => CONTENT_TYPES.includes(d.documentName)), d => d.documentName);
  for ( const [type, list] of byType ) {
    const updates = list.map(doc => {
      const update = {_id: doc.id, [`flags.${MODULE_ID}.project`]: new foundry.data.operators.ForcedDeletion()};
      const inProjectFolder = doc.folder && [doc.folder, ...doc.folder.ancestors].some(f => f.getFlag(MODULE_ID, "root"));
      if ( inProjectFolder ) update.folder = null;
      return update;
    });
    await getDocumentClass(type).updateDocuments(updates);
  }
}

/**
 * Put a whole folder into a project: the folder moves under the project's root folder (keeping its
 * subfolders, which the Adventure carries), and every document inside gets the project flag.
 * Fails with Foundry's own error if the move would exceed CONST.FOLDER_MAX_DEPTH.
 * @param {Folder} folder
 * @param {Module} project
 */
export async function assignFolder(folder, project) {
  const root = await ensureRootFolder(project, folder.type);
  if ( (folder !== root) && ![folder, ...folder.ancestors].includes(root) ) await folder.update({folder: root.id});
  await assign(folderContents(folder), project);
}

/** All documents inside a folder and its subfolders. */
export function folderContents(folder) {
  return [folder, ...folder.getSubfolders(true)].flatMap(f => f.contents);
}
