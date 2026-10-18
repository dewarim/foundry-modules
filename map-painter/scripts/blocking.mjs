// "Blocks view": images marked in the palette become walls. A stamped tile of such an image carries the flag
// `blocks` and owns four walls along its outline (flag `tile`), kept in step by hooks - moved, resized,
// turned, deleted and undone with the tile. Painted cells of a blocking texture get walls along the outline
// of all blocking cells (flag `paint`), recomputed after each stroke; carved cells get walls along the edges
// of the carved area when the rock blocks view (flag `carve`). Walls are Foundry's normal walls:
// they block sight, light, sound and movement. Their changes stay out of Foundry's wall history (isUndo):
// they follow the tile or the paint, and are undone with it.
import {carveOutline, readCarve} from "./carve-model.mjs";
import {blockingOutline, diffWalls, readState} from "./paint-model.mjs";
import {tileOutline} from "./stamp-model.mjs";

const MODULE_ID = "dewarim-map-painter";
/** Options for wall changes: out of Foundry's wall history. A fresh object per call - Foundry writes the
 *  operation into it, and two calls sharing one would create each other's walls. */
const quiet = () => ({isUndo: true});

/** Wall changes run one after another: a tile's create and update hooks can fire close together. */
let chain = Promise.resolve();
function queued(task) {
  chain = chain.then(task).catch(err => console.error(`${MODULE_ID} | walls`, err));
  return chain;
}

/** Whether an image is marked as blocking view (world setting "blocking": a list of image paths). */
export function isBlocking(src) {
  return !!src && (game.settings.get(MODULE_ID, "blocking") ?? []).includes(src);
}

/** Mark or unmark an image. */
export async function setBlocking(src, blocks) {
  const list = new Set(game.settings.get(MODULE_ID, "blocking") ?? []);
  if ( blocks ) list.add(src);
  else list.delete(src);
  await game.settings.set(MODULE_ID, "blocking", [...list]);
}

/* -------------------------------------------- */
/*  Walls of a tile                             */
/* -------------------------------------------- */

function wallData(c, flags, levels) {
  const data = {c, flags: {[MODULE_ID]: flags}};
  if ( levels?.size || levels?.length ) data.levels = [...levels];
  return data;
}

/** The walls a blocking tile owns. */
function tileWalls(scene, tileId) {
  return scene.walls.filter(w => w.getFlag(MODULE_ID, "tile") === tileId);
}

/** Rebuild the walls of one tile: none when it does not block (any more). */
export function syncTileWalls(tile) {
  return queued(() => rebuildTileWalls(tile));
}

async function rebuildTileWalls(tile) {
  const scene = tile.parent;
  const old = tileWalls(scene, tile.id).map(w => w.id);
  if ( old.length ) await scene.deleteEmbeddedDocuments("Wall", old, quiet());
  if ( !tile.getFlag(MODULE_ID, "blocks") ) return;
  const walls = tileOutline({x: tile.x, y: tile.y, width: tile.width, height: tile.height, rotation: tile.rotation,
    texture: {anchorX: tile.texture.anchorX, anchorY: tile.texture.anchorY}})
    .filter(([x1, y1, x2, y2]) => (x1 !== x2) || (y1 !== y2))
    .map(c => wallData(c, {tile: tile.id}, tile.levels));
  await scene.createEmbeddedDocuments("Wall", walls, quiet());
}

/** A tile is gone: so are its walls. */
export function removeTileWalls(scene, tileId) {
  return queued(async () => {
    const ids = tileWalls(scene, tileId).map(w => w.id);
    if ( ids.length ) await scene.deleteEmbeddedDocuments("Wall", ids, quiet());
  });
}

/** Fields of a tile whose change moves its walls. */
export function movesWalls(changed) {
  return ["x", "y", "width", "height", "rotation"].some(k => k in changed)
    || ("texture" in changed && ["anchorX", "anchorY"].some(k => k in (changed.texture ?? {})))
    || foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.blocks`)
    || foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.-=blocks`);
}

/* -------------------------------------------- */
/*  Walls of the painted cells                  */
/* -------------------------------------------- */

/** Make the scene's paint walls the outline of its blocking cells: only what differs is changed. */
export function syncPaintWalls(scene, state) {
  return queued(() => rebuildPaintWalls(scene, state));
}

/** Walls along the carved edges (flag `carve`); state null: none (the rock layer is gone). */
export function syncCarveWalls(scene, state) {
  return queued(() => rebuildCarveWalls(scene, state));
}

async function rebuildCarveWalls(scene, state) {
  const existing = scene.walls.filter(w => w.getFlag(MODULE_ID, "carve")).map(w => ({id: w.id, c: w.c}));
  const {create, remove} = diffWalls(existing, state ? carveOutline(state, scene.grid.size) : []);
  if ( remove.length ) await scene.deleteEmbeddedDocuments("Wall", remove, quiet());
  if ( create.length ) await scene.createEmbeddedDocuments("Wall", create.map(c => wallData(c, {carve: true})), quiet());
}

async function rebuildPaintWalls(scene, state) {
  const existing = scene.walls.filter(w => w.getFlag(MODULE_ID, "paint")).map(w => ({id: w.id, c: w.c}));
  const {create, remove} = diffWalls(existing, blockingOutline(state, scene.grid.size));
  if ( remove.length ) await scene.deleteEmbeddedDocuments("Wall", remove, quiet());
  if ( create.length ) await scene.createEmbeddedDocuments("Wall", create.map(c => wallData(c, {paint: true})), quiet());
}

/**
 * Rebuild every wall the painter owns on a scene from its blocking tiles and painted cells; walls whose tile
 * is gone are removed. For repairs - normally the hooks and strokes keep them in step.
 * @param {Scene} [scene]  default: the viewed scene
 */
export function rebuildWalls(scene = canvas.scene) {
  return queued(async () => {
    const orphans = scene.walls.filter(w => {
      const tileId = w.getFlag(MODULE_ID, "tile");
      return tileId && !scene.tiles.get(tileId)?.getFlag(MODULE_ID, "blocks");
    }).map(w => w.id);
    if ( orphans.length ) await scene.deleteEmbeddedDocuments("Wall", orphans, quiet());
    for ( const tile of scene.tiles.filter(t => t.getFlag(MODULE_ID, "blocks")) ) await rebuildTileWalls(tile);
    await rebuildPaintWalls(scene, readState(scene.getFlag(MODULE_ID, "paint")));
    await rebuildCarveWalls(scene, readCarve(scene.getFlag(MODULE_ID, "carve")));
  });
}
