import {test} from "node:test";
import assert from "node:assert/strict";
import {carve, carveOutline, chunkRock, holeMask, inRock, newCarve, readCarve, revertCarve, rockChunks, rockDigest, sceneCells, withOpenings} from "../scripts/carve-model.mjs";
import {cellKey, rectCells} from "../scripts/paint-model.mjs";
import {tileCells, tileData} from "../scripts/stamp-model.mjs";

test("readCarve and newCarve", () => {
  assert.equal(readCarve(undefined), null);
  assert.deepEqual(newCarve(), {rock: {src: null, repeat: 4}, blocks: true, open: {}});
  assert.deepEqual(readCarve({rock: {src: "r.webp", repeat: 0}, blocks: false, open: {"1,2": 1, "x": 1}}),
    {rock: {src: "r.webp", repeat: 1}, blocks: false, open: {"1,2": 1}});
});

test("carve opens and fills, revert restores", () => {
  const start = newCarve();
  const {state, changes} = carve(start, rectCells({col: 0, row: 0}, {col: 1, row: 1}), true);
  assert.equal(Object.keys(state.open).length, 4);
  assert.equal(changes.length, 4);
  const filled = carve(state, [{col: 0, row: 0}, {col: 5, row: 5}], false);
  assert.deepEqual(filled.changes, [{key: "0,0", before: true, after: false}]);
  assert.deepEqual(revertCarve(filled.state, filled.changes), state);
  assert.deepEqual(revertCarve(state, changes), start);
  assert.deepEqual(start.open, {}, "the input stays as it was");
});

test("sceneCells and rockChunks", () => {
  // a 30x20-cell scene at 100 px, padded by 5 cells
  const range = sceneCells({x: 500, y: 500, width: 3000, height: 2000}, 100);
  assert.deepEqual(range, {col0: 5, row0: 5, col1: 34, row1: 24});
  assert.deepEqual(rockChunks(range), ["0,0", "1,0", "2,0", "0,1", "1,1", "2,1"]);
});

test("holeMask: one bit per cell of the chunk, order and duplicates do not matter", () => {
  assert.equal(holeMask([]), "0".repeat(64), "16x16 bits as hex");
  assert.equal(holeMask([{col: 0, row: 0}]).slice(0, 2), "01");
  assert.equal(holeMask([{col: 3, row: 0}]).slice(0, 2), "08");
  assert.equal(holeMask([{col: 0, row: 1}]).slice(0, 6), "000001", "row 1 starts at bit 16");
  assert.equal(holeMask([{col: 1, row: 2}, {col: 4, row: 0}]), holeMask([{col: 4, row: 0}, {col: 1, row: 2}, {col: 1, row: 2}]));
  assert.equal(holeMask([{col: 16, row: 0}, {col: -1, row: 0}]), holeMask([]), "cells outside the chunk are not its business");
  assert.notEqual(holeMask([{col: 2, row: 3}]), holeMask([{col: 3, row: 2}]));
});

test("rockDigest: what a baked rock image is made of", () => {
  const range = {col0: 0, row0: 0, col1: 31, row1: 15};
  const chunk = {cx: 0, cy: 0};
  const plain = newCarve({src: "rock.webp", repeat: 4});
  const base = rockDigest(plain, chunk, range);
  assert.equal(rockDigest(plain, chunk, range), base, "the same state gives the same digest");
  assert.notEqual(rockDigest(carve(plain, [{col: 2, row: 2}], true).state, chunk, range), base, "a carved cell shows");
  assert.notEqual(rockDigest({...plain, rock: {src: "other.webp", repeat: 4}}, chunk, range), base, "the texture shows");
  assert.notEqual(rockDigest({...plain, rock: {src: "rock.webp", repeat: 8}}, chunk, range), base, "the scale shows");
  assert.equal(rockDigest({...plain, blocks: false}, chunk, range), base, "walls are not pixels");
  assert.notEqual(rockDigest(plain, chunk, {...range, col1: 10}), base, "the rock rectangle shows: a scene edge inside the chunk");
  // a way stamped through the rock reaches the image, not only the walls
  const opened = withOpenings(plain, ["4,4", "5,4"]);
  assert.notEqual(rockDigest(opened, chunk, range), base);
  assert.equal(rockDigest(opened, chunk, range), rockDigest(carve(plain, [{col: 4, row: 4}, {col: 5, row: 4}], true).state, chunk, range),
    "a stamped cell and a carved cell bake the same image");
  // nothing to bake where the scene has no rock
  assert.equal(rockDigest(plain, {cx: 3, cy: 3}, range), null);
  const all = carve(plain, Array.from({length: 16}, (_, row) => Array.from({length: 16}, (_, col) => ({col, row}))).flat(), true).state;
  assert.equal(rockDigest(all, chunk, range), null, "a chunk carved away completely has no image");
});

test("chunkRock: the chunk clipped to the scene, holes for open cells", () => {
  const range = {col0: 5, row0: 5, col1: 34, row1: 24};
  const s = carve(newCarve(), [{col: 6, row: 5}, {col: 20, row: 20}], true).state;
  assert.deepEqual(chunkRock(s, {cx: 0, cy: 0}, range), {rock: {col: 5, row: 5, width: 11, height: 11}, holes: [{col: 6, row: 5}]});
  assert.deepEqual(chunkRock(s, {cx: 2, cy: 1}, range).rock, {col: 0, row: 0, width: 3, height: 9});
  assert.deepEqual(chunkRock(s, {cx: 5, cy: 5}, range), {rock: null, holes: []});
  // a chunk carved out completely has no rock left
  const all = carve(newCarve(), rectCells({col: 32, row: 16}, {col: 34, row: 24}), true).state;
  assert.equal(chunkRock(all, {cx: 2, cy: 1}, range).rock, null);
});

test("carveOutline: walls around the open cells, none when the rock does not block", () => {
  const s = carve(newCarve(), rectCells({col: 0, row: 0}, {col: 2, row: 0}), true).state;
  assert.deepEqual(carveOutline(s, 10), [[0, 0, 0, 10], [0, 0, 30, 0], [0, 10, 30, 10], [30, 0, 30, 10]]);
  assert.deepEqual(carveOutline({...s, blocks: false}, 10), []);
});

test("withOpenings and inRock", () => {
  const state = carve(newCarve(), [{col: 1, row: 1}], true).state;
  const opened = withOpenings(state, ["4,4", "1,1"]);
  assert.deepEqual(opened.open, {"1,1": 1, "4,4": 1});
  assert.deepEqual(state.open, {"1,1": 1}, "the stored state stays as it was");
  assert.equal(withOpenings(state, []), state, "nothing opened: the same state");
  assert.equal(withOpenings(null, ["1,1"]), null, "no rock: nothing to open");
  const range = {col0: 0, row0: 0, col1: 4, row1: 2};
  assert.ok(inRock(range, {col: 0, row: 0}) && inRock(range, {col: 4, row: 2}));
  assert.ok(!inRock(range, {col: -1, row: 0}) && !inRock(range, {col: 0, row: 3}));
});

test("a way stamped through the rock is walled along its edge, not between two stamps", () => {
  const g = 100;
  const range = sceneCells({x: 0, y: 0, width: 500, height: 300}, g);
  const stamp = origin => tileCells(tileData({src: "floor.webp", cells: 1, rotation: 0, flip: false}, origin, g), g);
  // two one-cell stamps side by side on all rock
  const keys = [...stamp({x: 100, y: 100}), ...stamp({x: 200, y: 100})].filter(c => inRock(range, c)).map(cellKey);
  const walls = carveOutline(withOpenings(newCarve(), keys), g);
  assert.deepEqual(walls.map(w => w.join(",")).sort(), [
    "100,100,100,200",   // left of the way
    "100,100,300,100",   // along the top, both cells in one run
    "100,200,300,200",   // along the bottom
    "300,100,300,200"    // the far end
  ], "the shared edge in the middle carries no wall");

  // the same holds where a stamp meets a cell the brush carved
  const carved = carve(newCarve(), [{col: 1, row: 1}], true).state;
  const mixed = carveOutline(withOpenings(carved, stamp({x: 200, y: 100}).map(cellKey)), g);
  assert.deepEqual(mixed, walls);

  // and without walls on the rock there are none here either
  assert.deepEqual(carveOutline(withOpenings({...newCarve(), blocks: false}, keys), g), []);
});
