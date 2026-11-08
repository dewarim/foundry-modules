import {test} from "node:test";
import assert from "node:assert/strict";
import {floorStroke} from "../scripts/floor-model.mjs";
import {carve, newCarve} from "../scripts/carve-model.mjs";
import {paint, readState} from "../scripts/paint-model.mjs";

const TEX = {src: "floor.webp", repeat: 4, blocks: false};
const CELLS = [{col: 1, row: 1}, {col: 2, row: 1}];
const empty = () => ({paint: readState(null), carve: null});
const filled = () => ({paint: readState(null), carve: newCarve()});

test("a floor stroke on a filled world opens the rock and paints in one go", () => {
  const out = floorStroke(filled(), CELLS, {texture: TEX});
  assert.deepEqual(Object.keys(out.carve.state.open), ["1,1", "2,1"]);
  assert.deepEqual(Object.keys(out.paint.state.cells), ["1,1", "2,1"]);
  assert.deepEqual(out.paint.state.textures, [{src: TEX.src, repeat: TEX.repeat}], "blocks: false is not stored");
  assert.equal(out.paint.changes.length, 2);
  assert.equal(out.carve.changes.length, 2);
});

test("without a texture it only opens the rock, so the floor below shows", () => {
  const out = floorStroke(filled(), CELLS, {texture: null});
  assert.equal(out.paint, null, "nothing to write, bake or undo on the paint side");
  assert.deepEqual(Object.keys(out.carve.state.open), ["1,1", "2,1"]);
});

test("a stroke always opens the material it paints into", () => {
  // Painting a floor under material that stays closed was a setting once (*Open the world*, off). It is
  // the one case the slot rule is about - a floor painted blind, which may never be seen - so it is gone,
  // and an option that no longer exists cannot be asked for by accident either.
  const out = floorStroke(filled(), CELLS, {texture: TEX, openRock: false});
  assert.deepEqual(Object.keys(out.carve.state.open), ["1,1", "2,1"], "the stray option changes nothing");
  assert.deepEqual(Object.keys(out.paint.state.cells), ["1,1", "2,1"]);
});

test("on a world that is not filled, a stroke is plain paint", () => {
  const out = floorStroke(empty(), CELLS, {texture: TEX});
  assert.equal(out.carve, null, "there is no rock to open");
  assert.deepEqual(Object.keys(out.paint.state.cells), ["1,1", "2,1"]);
});

test("erasing makes the cells solid again and leaves the floor painted under the rock", () => {
  const start = {paint: paint(readState(null), CELLS, TEX).state, carve: carve(newCarve(), CELLS, true).state};
  const out = floorStroke(start, CELLS, {erase: true});
  assert.equal(out.paint, null, "the floor stays, so opening those cells again shows it");
  assert.deepEqual(out.carve.state.open, {});
  assert.equal(out.carve.changes.length, 2);
});

test("erasing with no rock on the scene erases the floor itself", () => {
  const start = {paint: paint(readState(null), CELLS, TEX).state, carve: null};
  const out = floorStroke(start, CELLS, {erase: true});
  assert.equal(out.carve, null);
  assert.deepEqual(out.paint.state.cells, {}, "nothing else 'solid' could mean here");
});

test("a stroke that changes nothing writes nothing", () => {
  const already = {paint: paint(readState(null), CELLS, TEX).state, carve: carve(newCarve(), CELLS, true).state};
  const out = floorStroke(already, CELLS, {texture: TEX});
  assert.deepEqual(out, {paint: null, carve: null});
});
