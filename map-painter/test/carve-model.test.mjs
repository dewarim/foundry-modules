import {test} from "node:test";
import assert from "node:assert/strict";
import {carve, carveOutline, carvedChunks, chunkRock, newCarve, readCarve, revertCarve, rockChunks, sceneCells} from "../scripts/carve-model.mjs";
import {rectCells} from "../scripts/paint-model.mjs";

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

test("sceneCells, rockChunks, carvedChunks", () => {
  // a 30x20-cell scene at 100 px, padded by 5 cells
  const range = sceneCells({x: 500, y: 500, width: 3000, height: 2000}, 100);
  assert.deepEqual(range, {col0: 5, row0: 5, col1: 34, row1: 24});
  assert.deepEqual(rockChunks(range), ["0,0", "1,0", "2,0", "0,1", "1,1", "2,1"]);
  assert.deepEqual(carvedChunks([{key: "15,3"}, {key: "16,3"}, {key: "3,3"}]).sort(), ["0,0", "1,0"]);
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
