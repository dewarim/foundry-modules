import {test} from "node:test";
import assert from "node:assert/strict";
import {KIND, PAINT_SORT, ROCK_SORT, SLOT_SORT, blocksFor, kindOf, replacedTiles, sortFor, takesSlot}
  from "../scripts/slot-model.mjs";

const SIZE = 100;
/** A tile of `cells` cells square with its top-left corner at a cell, anchored in the middle (as a stamp is). */
function tile(id, kind, col, row, cells = 1) {
  const px = cells * SIZE;
  return {id, kind, x: (col * SIZE) + (px / 2), y: (row * SIZE) + (px / 2), width: px, height: px,
    rotation: 0, texture: {anchorX: 0.5, anchorY: 0.5}};
}

test("a tile without a kind is a prop: an old tile is never deleted by a stroke", () => {
  assert.equal(kindOf(undefined), KIND.PROP);
  assert.equal(kindOf({}), KIND.PROP);
  assert.equal(kindOf({opens: true}), KIND.PROP, "the flags of a stamped way, from before the kind flag");
  assert.equal(kindOf({kind: "floor"}), KIND.FLOOR);
  assert.equal(kindOf({kind: "wall"}), KIND.WALL);
  assert.equal(kindOf({kind: "nonsense"}), KIND.PROP, "an unknown kind is not given the slot");
});

test("the slot is the floor's and the wall's; a prop lies above it", () => {
  assert.equal(takesSlot(KIND.FLOOR), true);
  assert.equal(takesSlot(KIND.WALL), true);
  assert.equal(takesSlot(KIND.PROP), false);
});

test("the sort bands follow the slot, and a prop keeps Foundry's own default", () => {
  assert.ok(PAINT_SORT < ROCK_SORT, "the material covers the painted floor until a stroke opens it");
  assert.ok(ROCK_SORT < SLOT_SORT, "a stamped floor *is* the floor there, so it shows over the material");
  assert.ok(SLOT_SORT < 0, "and below every tile the GM places by hand");
  assert.equal(sortFor(KIND.FLOOR), SLOT_SORT);
  assert.equal(sortFor(KIND.WALL), SLOT_SORT);
  assert.equal(sortFor(KIND.PROP), null);
});

test("a wall always blocks, a floor never, a prop when the stroke says so", () => {
  assert.equal(blocksFor(KIND.WALL, false), true, "a wall that lets sight through is not a wall");
  assert.equal(blocksFor(KIND.FLOOR, true), false);
  assert.equal(blocksFor(KIND.PROP, true), true, "a pillar, a pile of rocks");
  assert.equal(blocksFor(KIND.PROP, false), false);
  assert.equal(blocksFor(KIND.PROP), false);
});

test("a floor stroke takes the slot from the floors and walls it covers, and leaves the props", () => {
  const tiles = [
    tile("floor", KIND.FLOOR, 2, 3),
    tile("wall", KIND.WALL, 3, 3),
    tile("chest", KIND.PROP, 2, 3),
    tile("old", undefined, 2, 3),
    tile("elsewhere", KIND.FLOOR, 9, 9)
  ];
  const ids = replacedTiles(tiles, [{col: 2, row: 3}, {col: 3, row: 3}], SIZE);
  assert.deepEqual(ids, ["floor", "wall"]);
});

test("a tile the stroke only touches goes whole: a tile cannot be cut in half", () => {
  const tiles = [tile("big", KIND.FLOOR, 0, 0, 3)];
  assert.deepEqual(replacedTiles(tiles, [{col: 1, row: 1}], SIZE), ["big"], "one of its nine cells is enough");
  assert.deepEqual(replacedTiles(tiles, [{col: 3, row: 3}], SIZE), [], "the cell beyond it is not its");
});

test("a stroke with no cells replaces nothing", () => {
  assert.deepEqual(replacedTiles([tile("floor", KIND.FLOOR, 1, 1)], [], SIZE), []);
});

test("a turned tile is replaced where it really lies", () => {
  // A 1x3 strip of cells, anchored in the middle of its block and turned a quarter turn: it covers the
  // cells to the left and right of its center, not the ones above and below.
  const turned = {id: "strip", kind: KIND.FLOOR, x: 150, y: 150, width: SIZE, height: 3 * SIZE,
    rotation: 90, texture: {anchorX: 0.5, anchorY: 0.5}};
  assert.deepEqual(replacedTiles([turned], [{col: 0, row: 1}], SIZE), ["strip"]);
  assert.deepEqual(replacedTiles([turned], [{col: 1, row: 0}], SIZE), [], "where it would lie unturned");
});
