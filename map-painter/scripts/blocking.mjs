// The walls the painter owns. Whether a stroke makes walls is a setting of the stroke - the *Wall* toggle
// in the palette, kept per mode by the tools - and it is written into what the stroke leaves behind, so the
// answer travels with the thing and not with the image's file path: a stamped tile carries the flag `blocks`
// and owns four walls along its outline (flag `tile`), kept in step by hooks - moved, resized, turned,
// deleted and undone with the tile; a painted texture entry carries `blocks` and its cells get walls along
// the outline of all blocking cells (flag `paint`), recomputed after each stroke. One image can therefore be
// a floor in one stroke and a wall in the next: that is two texture entries, and only the second one's cells
// are walled. Carved cells get walls along the edges of the carved area when the rock blocks view (flag
// `carve`). Walls are Foundry's normal walls:
// they block sight, light, sound and movement. Their changes stay out of Foundry's wall history (isUndo):
// they follow the tile or the paint, and are undone with it.
//
// A stamped tile can also count as carved (flag `opens`): the cells it covers join the rock's open cells,
// so the rock's walls close around a way stamped through it and two neighbouring stamps have no wall
// between them. The cells are open in every sense - the rock is cut out of the baked image there too
// (paint-tool.mjs), so what is under the stamp is the painted floor or the scene's background, not rock.
// They are not written into the scene's carve flag: the tiles are the record, which is why a stamp
// deleted, moved or undone needs nothing but a rebuild.
import {carveOutline, inRock, readCarve, sceneCells, withOpenings} from "./carve-model.mjs";
import {blockingOutline, cellKey, diffWalls, readState} from "./paint-model.mjs";
import {tileCells, tileOutline} from "./stamp-model.mjs";

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

/* -------------------------------------------- */
/*  Walls of a tile                             */
/* -------------------------------------------- */

function wallData(c, flags, levels) {
  const data = {c, flags: {[MODULE_ID]: flags}};
  if ( levels?.size || levels?.length ) data.levels = [...levels];
  return data;
}

/** A tile's placement, as the pure geometry functions want it. */
function placement(tile) {
  return {x: tile.x, y: tile.y, width: tile.width, height: tile.height, rotation: tile.rotation,
    texture: {anchorX: tile.texture.anchorX, anchorY: tile.texture.anchorY}};
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
  const walls = tileOutline(placement(tile))
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

/** Whether an update sets or removes one of our flags. Both land at the same path: v14 writes a
 *  deletion as an operator object there ({__$OPERATOR$__: "ForcedDeletion"}), not as the `-=blocks`
 *  key older cores used - and this module needs v14 (module.json). */
function touchesFlag(changed, flag) {
  return foundry.utils.hasProperty(changed, `flags.${MODULE_ID}.${flag}`);
}

const touchesBlocks = changed => touchesFlag(changed, "blocks");

/** Whether a tile's walls are the painter's business: it blocks view, or its flag was just set or
 *  removed (the walls it owned then have to go). Asked before any work, because rebuilding a tile's
 *  walls filters every wall in the scene - a cost foreign tiles (most tile updates on a busy scene,
 *  from a mass edit or another module) must not pay. */
export function ownsWalls(tile, changed) {
  return !!tile.getFlag(MODULE_ID, "blocks") || touchesBlocks(changed);
}

/** Fields of a tile whose change moves its walls - or the hole it keeps open in the rock. */
export function movesWalls(changed) {
  return ["x", "y", "width", "height", "rotation"].some(k => k in changed)
    || ("texture" in changed && ["anchorX", "anchorY"].some(k => k in (changed.texture ?? {})))
    || touchesBlocks(changed) || touchesFlag(changed, "opens");
}

/** Whether a tile opens the rock, or just stopped doing so (then the rock closes again). */
export function opensRock(tile, changed) {
  return !!tile.getFlag(MODULE_ID, "opens") || touchesFlag(changed, "opens");
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

/**
 * Cells the stamps have opened: every cell a tile with the `opens` flag covers, as far as the rock reaches.
 * A stamp in the padding around the scene opens nothing - there is no rock out there to cut.
 */
function stampOpenings(scene) {
  const range = sceneCells(scene.dimensions.sceneRect, scene.grid.size);
  const keys = [];
  for ( const tile of scene.tiles ) {
    if ( !tile.getFlag(MODULE_ID, "opens") ) continue;
    for ( const cell of tileCells(placement(tile), scene.grid.size) ) if ( inRock(range, cell) ) keys.push(cellKey(cell));
  }
  return keys;
}

/**
 * The rock as the walls and the bake see it: the cells the brush carved, plus the cells the stamps have
 * opened. State null (the rock layer is gone): null.
 */
export function openedCarve(scene, state) {
  return state ? withOpenings(state, stampOpenings(scene)) : null;
}

async function rebuildCarveWalls(scene, state) {
  const existing = scene.walls.filter(w => w.getFlag(MODULE_ID, "carve")).map(w => ({id: w.id, c: w.c}));
  const open = openedCarve(scene, state);
  const {create, remove} = diffWalls(existing, open ? carveOutline(open, scene.grid.size) : []);
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
