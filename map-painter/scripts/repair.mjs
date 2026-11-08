// Repairs the GM asks for. Nothing in here ever runs by itself: a stroke does not delete a tile behind the
// GM's back, and `redundantTiles` is deliberately shy - it only names tiles whose removal cannot change
// what the map looks like or what it does (stamp-model.mjs).
import {rebuildWalls} from "./blocking.mjs";
import {redundantTiles} from "./stamp-model.mjs";

const MODULE_ID = "dewarim-map-painter";

/**
 * Delete the tiles another tile makes pointless - the same place, the same image, the same look, one above
 * the other - after saying how many, and how many more are covered but not decidable from the documents.
 * The painter's own baked layers are left out: they are derived from the scene's flags, and the bake keeps
 * them in step. The deletion is a normal one, so Ctrl+Z brings the tiles back.
 * @param {Scene} [scene]  default: the viewed scene
 * @returns {Promise<{removed: number, overlapping: number}|null>}  null: the GM said no
 */
export async function cleanupTiles(scene = canvas.scene) {
  if ( !scene ) return ui.notifications.warn("DEWARIM_MAP.NoScene", {localize: true});
  // The painter's two baked layers are left out by their flags rather than by their sort band: they are
  // derived from the scene's flags and the bake keeps them in step. Everything else is fair game, the
  // stamped floors and walls in their own band included - two of those in one cell is the same waste.
  const baked = t => t.getFlag(MODULE_ID, "chunk") || t.getFlag(MODULE_ID, "rock");
  const tiles = scene.tiles.filter(t => !baked(t)).map(t => ({...t.toObject(), id: t.id}));
  const {remove, overlapping} = redundantTiles(tiles, MODULE_ID);
  if ( !remove.length ) {
    ui.notifications.info(game.i18n.format("DEWARIM_MAP.CleanupNone", {covered: overlapping.length}));
    return {removed: 0, overlapping: overlapping.length};
  }
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {title: "DEWARIM_MAP.Cleanup"},
    content: `<p>${game.i18n.format("DEWARIM_MAP.CleanupConfirm", {count: remove.length, covered: overlapping.length})}</p>`,
    // Our own keys: confirm() labels its buttons COMMON.Yes/COMMON.No, and core's German is not installed
    // here, so a German dialog would end in two English buttons.
    yes: {label: "DEWARIM_MAP.Yes"}, no: {label: "DEWARIM_MAP.No"}
  });
  if ( !ok ) return null;
  await scene.deleteEmbeddedDocuments("Tile", remove);
  ui.notifications.info(game.i18n.format("DEWARIM_MAP.CleanupDone", {count: remove.length}));
  return {removed: remove.length, overlapping: overlapping.length};
}

/* -------------------------------------------- */
/*  Reset a scene                               */
/* -------------------------------------------- */

/**
 * The last reset, so it can be put back: one slot, in memory, for this session. Everything in it is
 * document data and two flag values - enough to recreate the scene's contents under their own ids.
 * @type {{sceneId: string, tiles: object[], walls: object[], paint: object|null, carve: object|null}|null}
 */
let undone = null;

/** Whether there is a reset of this scene to put back. */
export function canUndoReset(scene = canvas.scene) {
  return !!undone && (undone.sceneId === scene?.id);
}

/**
 * Empty a scene of everything on it - every tile, every wall, the floor and the material - so a test can
 * start from nothing. For testing, which is why it is this blunt: it does not try to tell the painter's
 * tiles from any others.
 *
 * Its own undo, because Foundry has none for a scene flag: the documents and both flag values go into one
 * slot that `undoReset` puts back under the same ids. The deletions therefore stay out of Foundry's own
 * history (isUndo), so Ctrl+Z cannot take half of it back.
 * @param {Scene} [scene]  default: the viewed scene
 * @returns {Promise<{tiles: number, walls: number}|null>}  null: the GM said no, or there was nothing
 */
export async function resetScene(scene = canvas.scene) {
  if ( !scene ) return ui.notifications.warn("DEWARIM_MAP.NoScene", {localize: true});
  const tiles = scene.tiles.map(t => t.toObject());
  // The painter's own walls are derived from the tiles and the two flags, so they are rebuilt on the way
  // back rather than remembered; only walls it did not make have to be kept in order to be put back.
  const ours = w => w.getFlag(MODULE_ID, "tile") || w.getFlag(MODULE_ID, "paint") || w.getFlag(MODULE_ID, "carve");
  const walls = scene.walls.filter(w => !ours(w)).map(w => w.toObject());
  const paint = scene.getFlag(MODULE_ID, "paint") ?? null;
  const carve = scene.getFlag(MODULE_ID, "carve") ?? null;
  const wallCount = scene.walls.size;
  if ( !tiles.length && !wallCount && !paint && !carve ) {
    ui.notifications.info("DEWARIM_MAP.ResetNothing", {localize: true});
    return null;
  }
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {title: "DEWARIM_MAP.Reset"},
    content: `<p>${game.i18n.format("DEWARIM_MAP.ResetConfirm", {tiles: tiles.length, walls: wallCount})}</p>`,
    yes: {label: "DEWARIM_MAP.Yes"}, no: {label: "DEWARIM_MAP.No", default: true}
  });
  if ( !ok ) return null;
  undone = {sceneId: scene.id, tiles, walls, paint, carve};
  // The flags go first: a deleted tile that opened the rock makes the painter re-bake the rock and wall
  // its edges (the deleteTile hook), and with the flag already gone there is nothing left for it to do.
  if ( paint ) await scene.unsetFlag(MODULE_ID, "paint");
  if ( carve ) await scene.unsetFlag(MODULE_ID, "carve");
  if ( wallCount ) await scene.deleteEmbeddedDocuments("Wall", scene.walls.map(w => w.id), {isUndo: true});
  if ( tiles.length ) await scene.deleteEmbeddedDocuments("Tile", tiles.map(t => t._id), {isUndo: true});
  ui.notifications.info(game.i18n.format("DEWARIM_MAP.ResetDone", {tiles: tiles.length, walls: wallCount}));
  return {tiles: tiles.length, walls: wallCount};
}

/** Put the last reset of this scene back: the documents under their own ids, both flags, then the walls. */
export async function undoReset(scene = canvas.scene) {
  if ( !canUndoReset(scene) ) return null;
  const {tiles, walls, paint, carve} = undone;
  undone = null;
  if ( paint ) await scene.setFlag(MODULE_ID, "paint", paint);
  if ( carve ) await scene.setFlag(MODULE_ID, "carve", carve);
  if ( tiles.length ) await scene.createEmbeddedDocuments("Tile", tiles, {keepId: true, isUndo: true});
  if ( walls.length ) await scene.createEmbeddedDocuments("Wall", walls, {keepId: true, isUndo: true});
  // Last: the walls the painter owns are made again from the tiles and the flags that are back now
  await rebuildWalls(scene);
  ui.notifications.info(game.i18n.format("DEWARIM_MAP.ResetUndone", {tiles: tiles.length}));
  return {tiles: tiles.length, walls: walls.length};
}
