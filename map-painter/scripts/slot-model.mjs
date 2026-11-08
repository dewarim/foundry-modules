// What a cell can hold: **one floor-or-wall slot, and any number of props above it** (Ingo's rule, ROADMAP
// step 5). The pure half of it - no Foundry globals, test/slot-model.test.mjs.
//
// The rule exists to make "nothing the painter makes is invisible" true by construction instead of being a
// warning bolted on afterwards:
//   - nothing opaque ends up over a floor, because a floor stroke takes the slot and whatever floor or wall
//     was in it goes;
//   - a sight-blocking tile cannot end up buried, because a wall sits in the slot and only props may lie
//     above it - and a prop carries an alpha channel by definition (a rug, a pile of rocks, a chest), so
//     what is under it is meant to show through.
//
// Which means the painter has to know what each of its tiles *is*: every tile it makes carries `flags.kind`.
// A tile without one - made before the flag, or made by somebody else - counts as a prop and is therefore
// never deleted by a stroke. That is also the whole of the migration: there is no way to tell an old
// stamped floor from an old chest, so nothing is guessed.
//
// The mode says which slot a stroke takes; whether it blocks sight is a second, independent question,
// because a *prop* may block too (a pillar, a pile of rocks). A wall always blocks - that is what makes it
// a wall - and a floor never does.
import {cellKey} from "./paint-model.mjs";
import {tileCells} from "./stamp-model.mjs";

/** The three things a stroke can mean. Written on every tile the painter makes. */
export const KIND = {FLOOR: "floor", WALL: "wall", PROP: "prop"};

/** The kinds that take the one slot, and so replace each other and themselves. */
export const SLOT_KINDS = [KIND.FLOOR, KIND.WALL];

/**
 * The sort bands, which follow the slot rather than the tool that made the tile: the painted floor at the
 * bottom, the material just above it (it covers the floor until a stroke opens it), a stamped floor or wall
 * above that (it *is* the floor of its cells), and the props above everything - Foundry's own tiles start at
 * 0 and grow, so a prop placed later is over a prop placed earlier, which is what props are for.
 */
export const PAINT_SORT = -100000;
export const ROCK_SORT = -99999;
export const SLOT_SORT = -99998;

/** Whether a stroke of this kind takes the cell's one slot (and therefore replaces what is in it). */
export function takesSlot(kind) {
  return SLOT_KINDS.includes(kind);
}

/**
 * The sort a tile of this kind gets - null for a prop, which keeps Foundry's own default from the Tiles
 * palette, so props stay where the GM's own tiles are and keep their own order.
 */
export function sortFor(kind) {
  return takesSlot(kind) ? SLOT_SORT : null;
}

/**
 * What a tile is, from the painter's own flags: anything but a floor or a wall is a prop.
 * @param {object} [flags]  the tile's flags *of this module* (tile.flags["dewarim-map-painter"])
 * @returns {"floor"|"wall"|"prop"}
 */
export function kindOf(flags) {
  const kind = flags?.kind;
  return SLOT_KINDS.includes(kind) ? kind : KIND.PROP;
}

/**
 * Whether a stroke of this kind blocks sight: a wall always does, a floor never, a prop when the GM said so
 * for this stroke.
 * @param {"floor"|"wall"|"prop"} kind
 * @param {boolean} [blocks]  the *Blocks sight* setting, which only a prop is asked about
 */
export function blocksFor(kind, blocks = false) {
  if ( kind === KIND.WALL ) return true;
  if ( kind === KIND.FLOOR ) return false;
  return !!blocks;
}

/**
 * The tiles a floor-or-wall stroke takes the slot from: the painter's own floors and walls that reach into
 * any of the stroke's cells. Props are left alone, and so is everything without a `kind`.
 *
 * A tile that reaches into the stroke goes *whole*, even where the stroke covers one of its nine cells:
 * Foundry cannot cut a tile in half, so the choice is between deleting it and leaving the stroke invisible
 * under it - and leaving it invisible is the bug this rule is here to end. It is one tile and one undo step.
 *
 * @param {{id: string, kind?: string, x: number, y: number, width: number, height: number,
 *   rotation?: number, texture?: {anchorX?: number, anchorY?: number}}[]} tiles  with `kind` as kindOf says
 * @param {{col: number, row: number}[]} cells  the stroke's cells
 * @param {number} gridSize
 * @returns {string[]}  ids, in the order the tiles came in
 */
export function replacedTiles(tiles, cells, gridSize) {
  const wanted = new Set(cells.map(cellKey));
  if ( !wanted.size ) return [];
  return tiles.filter(t => takesSlot(t.kind) && tileCells(t, gridSize).some(c => wanted.has(cellKey(c))))
    .map(t => t.id);
}
