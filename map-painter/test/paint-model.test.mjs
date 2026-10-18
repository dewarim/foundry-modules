import {test} from "node:test";
import assert from "node:assert/strict";
import {blockingOutline, brushCells, chunkOf, chunkRects, compact, diffWalls, paint, readState, rectCells, revert, touchedChunks, wallKey} from "../scripts/paint-model.mjs";

const stone = {src: "stone.webp", repeat: 4};
const grass = {src: "grass.webp", repeat: 2};
const empty = () => readState(undefined);

test("brushCells and rectCells", () => {
  assert.deepEqual(brushCells({col: 5, row: 5}, 1), [{col: 5, row: 5}]);
  assert.deepEqual(brushCells({col: 5, row: 5}, 2).map(c => `${c.col},${c.row}`), ["5,5", "6,5", "5,6", "6,6"]);
  assert.equal(brushCells({col: 0, row: 0}, 3)[0].col, -1);
  assert.equal(rectCells({col: 2, row: 3}, {col: 0, row: 1}).length, 9);
});

test("paint: textures are entries, repainting the same is no change, erase removes", () => {
  let {state, changes} = paint(empty(), [{col: 0, row: 0}, {col: 1, row: 0}, {col: 1, row: 0}], stone);
  assert.deepEqual(state, {textures: [stone], cells: {"0,0": 0, "1,0": 0}});
  assert.equal(changes.length, 2);
  ({state, changes} = paint(state, [{col: 1, row: 0}], stone));
  assert.equal(changes.length, 0);
  ({state, changes} = paint(state, [{col: 1, row: 0}, {col: 2, row: 0}], grass));
  assert.deepEqual(state.textures, [stone, grass]);
  assert.deepEqual(changes[0], {key: "1,0", before: stone, after: grass});
  // the same image at another scale is another entry
  ({state} = paint(state, [{col: 3, row: 0}], {src: "stone.webp", repeat: 2}));
  assert.equal(state.textures.length, 3);
  // erasing the only grass cell drops the grass entry
  ({state} = paint(state, [{col: 1, row: 0}, {col: 2, row: 0}], null));
  assert.deepEqual(state.textures.map(t => `${t.src}@${t.repeat}`), ["stone.webp@4", "stone.webp@2"]);
  assert.deepEqual(state.cells, {"0,0": 0, "3,0": 1});
});

test("revert restores what was there", () => {
  const first = paint(empty(), rectCells({col: 0, row: 0}, {col: 2, row: 2}), stone).state;
  const {state, changes} = paint(first, rectCells({col: 1, row: 1}, {col: 3, row: 3}), grass);
  assert.deepEqual(revert(state, changes), first);
  const erased = paint(first, [{col: 0, row: 0}], null);
  assert.deepEqual(revert(erased.state, erased.changes), first);
});

test("readState repairs flag data", () => {
  assert.deepEqual(readState({textures: [stone, {nope: 1}], cells: {"0,0": 0, "1,1": 5, "x": 0, "2,2": 1.5}}),
    {textures: [stone], cells: {"0,0": 0}});
  assert.deepEqual(compact({textures: [stone, grass], cells: {"0,0": 1}}), {textures: [grass], cells: {"0,0": 0}});
});

test("chunks: which ones a stroke touches, rectangles inside one", () => {
  assert.deepEqual(chunkOf({col: -1, row: 16}), {cx: -1, cy: 1});
  const {state, changes} = paint(empty(), [{col: 15, row: 0}, {col: 16, row: 0}, {col: 3, row: 4}], stone);
  assert.deepEqual(touchedChunks(changes).sort(), ["0,0", "1,0"]);
  // an L of stone and a strip of grass: rows merge only where the runs are equal
  let s = paint(empty(), rectCells({col: 0, row: 0}, {col: 3, row: 1}), stone).state;
  s = paint(s, [{col: 0, row: 2}], stone).state;
  s = paint(s, rectCells({col: 5, row: 0}, {col: 5, row: 2}), grass).state;
  const rects = chunkRects(s, {cx: 0, cy: 0});
  assert.deepEqual(rects.get(0), [{col: 0, row: 0, width: 4, height: 2}, {col: 0, row: 2, width: 1, height: 1}]);
  assert.deepEqual(rects.get(1), [{col: 5, row: 0, width: 1, height: 3}]);
  assert.equal(chunkRects(state, {cx: 2, cy: 2}).size, 0);
  // the cells of the rectangles are exactly the painted cells
  const covered = [...rects.values()].flat().reduce((n, r) => n + (r.width * r.height), 0);
  assert.equal(covered, Object.keys(s.cells).length);
});

test("blocks: its own texture entry, kept by readState", () => {
  const wall = {src: "wall.webp", repeat: 2, blocks: true};
  let {state} = paint(empty(), [{col: 0, row: 0}], wall);
  ({state} = paint(state, [{col: 1, row: 0}], {src: "wall.webp", repeat: 2}));
  assert.deepEqual(state.textures, [wall, {src: "wall.webp", repeat: 2}]);
  assert.deepEqual(readState(state), state);
});

test("blockingOutline: merged runs around the blocking cells only", () => {
  // a 2x2 block of wall, a stone cell next to it (does not block)
  let s = paint(empty(), rectCells({col: 0, row: 0}, {col: 1, row: 1}), {src: "w", repeat: 1, blocks: true}).state;
  s = paint(s, [{col: 2, row: 0}], stone).state;
  assert.deepEqual(blockingOutline(s, 100), [
    [0, 0, 0, 200], [0, 0, 200, 0], [0, 200, 200, 200], [200, 0, 200, 200]
  ]);
  // an L: 3 cells
  const l = paint(empty(), [{col: 0, row: 0}, {col: 0, row: 1}, {col: 1, row: 1}], {src: "w", repeat: 1, blocks: true}).state;
  const walls = blockingOutline(l, 10);
  assert.equal(walls.length, 6);
  const length = walls.reduce((n, [x1, y1, x2, y2]) => n + Math.abs(x2 - x1) + Math.abs(y2 - y1), 0);
  assert.equal(length, 80);
  assert.deepEqual(blockingOutline(empty(), 100), []);
});

test("diffWalls: direction does not matter, duplicates go", () => {
  const existing = [{id: "a", c: [0, 0, 100, 0]}, {id: "b", c: [100, 0, 0, 0]}, {id: "c", c: [5, 5, 5, 50]}];
  assert.deepEqual(diffWalls(existing, [[0, 0, 100, 0], [0, 0, 0, 100]]), {create: [[0, 0, 0, 100]], remove: ["b", "c"]});
  assert.equal(wallKey([10, 0, 0, 0]), "0,0,10,0");
});
