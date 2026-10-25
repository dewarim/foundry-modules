// Drop image files from the desktop anywhere on the Foundry window; they are uploaded into a configured
// folder of the user data directory. Generic: no system-specific code.
import {baseNames, folderChain, normalizeFolder, planUploads} from "./upload-plan.mjs";
import {isDocumentDragData} from "./drag-source.mjs";
import {registerChangelog} from "./shared/changelog.mjs";

const MODULE_ID = "dewarim-image-drop";

// After an install or update, GMs see what changed (CHANGELOG.md)
registerChangelog(MODULE_ID);

const SOURCE = "data";

// Places that already handle a file drop themselves; the module stays out of their way.
//  - ProseMirror editors upload a dropped image and embed it (common/prosemirror/image-plugin.mjs)
//  - the FilePicker uploads into the folder it is showing
//  - a native <input type="file">
//  - anything marked [data-accepts-files] (e.g. dewarim-file-commander's panes, which upload where dropped)
const OWN_DROP_TARGETS = ".ProseMirror, prose-mirror, #file-picker, input[type=file], [data-accepts-files]";

let overlay;
let dragDepth = 0;
// A drag that began inside the window is Foundry's own - an actor onto the canvas, an item onto a sheet.
// It can carry files all the same: a drag starting on an image (a directory entry's portrait) hands the
// browser that image as a file, so "Files" in dataTransfer.types is no proof the drag came from outside.
let internalDrag = false;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "folder", {
    name: "DEWARIM_IMAGE_DROP.Settings.Folder.Name",
    hint: "DEWARIM_IMAGE_DROP.Settings.Folder.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "assets/upload"
  });
  game.settings.register(MODULE_ID, "enabled", {
    name: "DEWARIM_IMAGE_DROP.Settings.Enabled.Name",
    hint: "DEWARIM_IMAGE_DROP.Settings.Enabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {uploadImages, targetFolder};
  // Capture phase on window: runs before the canvas, the sheets and core's document-level drop blocker.
  // dragstart/dragend tell an in-window drag from a file dropped in from outside.
  window.addEventListener("dragstart", onDragStart, true);
  window.addEventListener("dragend", onDragEnd, true);
  // A drag whose source element was re-rendered away reports no dragend; the next click clears the flag.
  window.addEventListener("pointerdown", onDragEnd, true);
  window.addEventListener("dragenter", onDragEnter, true);
  window.addEventListener("dragover", onDragOver, true);
  window.addEventListener("dragleave", onDragLeave, true);
  window.addEventListener("drop", onDrop, true);
});

/** The configured upload folder, normalized. */
function targetFolder() {
  return normalizeFolder(game.settings.get(MODULE_ID, "folder"));
}

/** Whether this drag is one the module should take: files from outside, an active user who may upload. */
function isOurs(event) {
  if ( internalDrag ) return false;
  if ( !game.settings.get(MODULE_ID, "enabled") ) return false;
  if ( !event.dataTransfer?.types.includes("Files") ) return false;
  return !event.target.closest?.(OWN_DROP_TARGETS);
}

/** A drag starting in the window belongs to Foundry, whatever the browser put into its dataTransfer. */
function onDragStart() {
  internalDrag = true;
}

/** End of that drag - dragend is also reported when it was dropped outside the window. */
function onDragEnd() {
  internalDrag = false;
}

function onDragEnter(event) {
  if ( internalDrag ) return;
  if ( !event.dataTransfer?.types.includes("Files") ) return;
  dragDepth++;
  updateOverlay(event);
}

function onDragOver(event) {
  if ( !isOurs(event) ) {
    hideOverlay();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = game.user.hasPermission("FILES_UPLOAD") ? "copy" : "none";
  updateOverlay(event);
}

function onDragLeave(event) {
  if ( internalDrag ) return;
  if ( !event.dataTransfer?.types.includes("Files") ) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if ( dragDepth === 0 ) hideOverlay();
}

async function onDrop(event) {
  dragDepth = 0;
  hideOverlay();
  // Only now, in the drop handler, may the drag's data be read: a second check for a drag of Foundry's
  // own that reached us anyway, e.g. from a second Foundry window, where no dragstart of ours fired.
  const ours = isOurs(event) && !isDocumentDragData(event.dataTransfer.getData("text/plain"))
    && (event.dataTransfer.files.length > 0);
  internalDrag = false;  // the drop ends the drag, and dragend does not always follow
  if ( !ours ) return;
  event.preventDefault();
  event.stopPropagation();
  if ( !game.user.hasPermission("FILES_UPLOAD") ) {
    ui.notifications.warn("DEWARIM_IMAGE_DROP.NoPermission", {localize: true});
    return;
  }
  await uploadImages([...event.dataTransfer.files]);
}

/**
 * Upload image files into the target folder, creating it if needed. Never overwrites: a name that is
 * taken gets a counter appended.
 * @param {File[]} files
 * @param {string} [folder]  Defaults to the configured folder
 * @returns {Promise<string[]>}  The paths of the stored files
 */
async function uploadImages(files, folder = targetFolder()) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  let existing;
  try {
    existing = await ensureFolder(FilePicker, folder);
  } catch(err) {
    ui.notifications.error(_loc("DEWARIM_IMAGE_DROP.FolderFailed", {folder, error: err.message}));
    console.error(MODULE_ID, err);
    return [];
  }

  const {uploads, skipped} = planUploads(files, {
    imageExtensions: Object.keys(CONST.IMAGE_FILE_EXTENSIONS),
    existing
  });
  if ( skipped.length ) {
    ui.notifications.warn(_loc("DEWARIM_IMAGE_DROP.Skipped", {names: skipped.map(f => f.name).join(", ")}));
  }

  const stored = [];
  for ( const {file, name} of uploads ) {
    // The server stores the upload under the File's own name, so a renamed copy is sent.
    const renamed = name === file.name ? file : new File([file], name, {type: file.type});
    const response = await FilePicker.upload(SOURCE, folder, renamed, {}, {notify: false});
    if ( response?.path ) stored.push(response.path);
    else ui.notifications.error(_loc("DEWARIM_IMAGE_DROP.UploadFailed", {name: file.name}));
  }

  if ( stored.length ) {
    ui.notifications.info(_loc("DEWARIM_IMAGE_DROP.Uploaded", {count: stored.length, folder}));
    console.log(`${MODULE_ID} | uploaded`, stored);
  }
  return stored;
}

/**
 * Create the folder level by level where missing and return the file names already in it.
 * @returns {Promise<string[]>}
 */
async function ensureFolder(FilePicker, folder) {
  for ( const path of folderChain(folder) ) {
    try {
      await FilePicker.browse(SOURCE, path);
    } catch {
      await FilePicker.createDirectory(SOURCE, path);
    }
  }
  const listing = await FilePicker.browse(SOURCE, folder);
  return baseNames(listing.files ?? []);
}

/* -------------------------------------------- */
/*  Drop hint overlay                           */
/* -------------------------------------------- */

function updateOverlay(event) {
  if ( !isOurs(event) ) return hideOverlay();
  overlay ??= createOverlay();
  const allowed = game.user.hasPermission("FILES_UPLOAD");
  overlay.classList.toggle("denied", !allowed);
  overlay.querySelector(".label").textContent = allowed
    ? _loc("DEWARIM_IMAGE_DROP.DropHint", {folder: targetFolder()})
    : _loc("DEWARIM_IMAGE_DROP.NoPermission");
  overlay.hidden = false;
}

function hideOverlay() {
  if ( overlay ) overlay.hidden = true;
}

function createOverlay() {
  const element = document.createElement("div");
  element.id = "dewarim-image-drop-overlay";
  element.hidden = true;
  element.innerHTML = `<div class="label"></div>`;
  document.body.append(element);
  return element;
}
