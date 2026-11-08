// The slot rule where it meets the scene: which of the painter's tiles a floor-or-wall stroke takes the
// cell's one slot from, and saying so afterwards. The rule itself is pure (slot-model.mjs).
//
// Both tools ask the same question and answer it differently only in how the deletion is undone: the brush
// has its own undo stack and puts the tiles back itself (isUndo, keepId), while a stamp stroke is Foundry's
// own tile history - there the deletion goes in first, so that Ctrl+Z takes the new tiles back and a second
// one brings the replaced ones again.
import {kindOf, replacedTiles} from "./slot-model.mjs";

const MODULE_ID = "dewarim-map-painter";

/**
 * The painter's own floors and walls reaching into any of these cells, as full tile data - so whoever
 * deletes them can also put them back.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} cells
 * @returns {object[]}  tile data, `_id` included
 */
export function replacedIn(scene, cells) {
  const placements = scene.tiles.map(t => ({id: t.id, kind: kindOf(t.flags?.[MODULE_ID]),
    x: t.x, y: t.y, width: t.width, height: t.height, rotation: t.rotation,
    texture: {anchorX: t.texture.anchorX, anchorY: t.texture.anchorY}}));
  const ids = new Set(replacedTiles(placements, cells, scene.grid.size));
  return scene.tiles.filter(t => ids.has(t.id)).map(t => t.toObject());
}

/** What a stroke replaced, in words: a deletion nobody asked for by name is not left to be noticed. */
export function announceReplaced(count) {
  if ( !count ) return;
  // One tile is one tile: Foundry's i18n has no plural rule, so the two sentences are two keys
  ui.notifications.info(count === 1
    ? game.i18n.localize("DEWARIM_MAP.SlotReplacedOne")
    : game.i18n.format("DEWARIM_MAP.SlotReplaced", {count}));
}
