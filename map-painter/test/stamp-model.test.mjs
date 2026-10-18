import {test} from "node:test";
import assert from "node:assert/strict";
import {cellAt, cellsBetween, centeredOrigin, freeForStamp, isImage, remember, resize, rotate, stampSize, tileData, tileOutline} from "../scripts/stamp-model.mjs";

test("isImage", () => {
  assert.ok(isImage("icons/environment/wilderness/tree-oak.webp"));
  assert.ok(isImage("assets/props/Rock%201.PNG?x=1"));
  assert.ok(!isImage("assets/props/torch.webm"));
  assert.ok(!isImage("assets/props/readme"));
});

test("cellAt and cellsBetween", () => {
  assert.deepEqual(cellAt({x: 250, y: 99}, 100), {col: 2, row: 0});
  assert.deepEqual(cellAt({x: -1, y: 0}, 100), {col: -1, row: 0});
  assert.deepEqual(cellsBetween({col: 0, row: 0}, {col: 3, row: 0}).map(c => c.col), [0, 1, 2, 3]);
  assert.deepEqual(cellsBetween({col: 2, row: 2}, {col: 2, row: 2}), [{col: 2, row: 2}]);
  const diag = cellsBetween({col: 0, row: 0}, {col: 3, row: 2});
  assert.deepEqual(diag[0], {col: 0, row: 0});
  assert.deepEqual(diag.at(-1), {col: 3, row: 2});
  // no gaps: every step moves at most one cell in each direction
  for ( let i = 1; i < diag.length; i++ ) {
    assert.ok(Math.abs(diag[i].col - diag[i - 1].col) <= 1 && Math.abs(diag[i].row - diag[i - 1].row) <= 1);
  }
  assert.deepEqual(cellsBetween({col: 0, row: 3}, {col: 0, row: 0}).map(c => c.row), [3, 2, 1, 0]);
});

test("tileData and centeredOrigin", () => {
  assert.deepEqual(tileData({src: "a.webp", cells: 2, rotation: -90, flip: true}, {x: 100.4, y: 200}, 100), {
    // x/y is the anchor (the center): top-left corner + half the size
    texture: {src: "a.webp", scaleX: -1, scaleY: 1, anchorX: 0.5, anchorY: 0.5}, x: 200, y: 300, width: 200, height: 200, rotation: 270
  });
  // odd grid size: whatever the rotation, the turned tile covers exactly its cell (as Foundry draws it:
  // turned around the anchor, which sits at x/y)
  for ( const rotation of [0, 90, 180, 270] ) {
    const t = tileData({src: "a.webp", cells: 1, rotation, flip: false}, {x: 150, y: 75}, 75);
    const [ax, ay] = [t.texture.anchorX * t.width, t.texture.anchorY * t.height];
    const rad = rotation * Math.PI / 180;
    const corners = [[0, 0], [75, 0], [0, 75], [75, 75]].map(([cx, cy]) => [
      t.x + (Math.cos(rad) * (cx - ax)) - (Math.sin(rad) * (cy - ay)),
      t.y + (Math.sin(rad) * (cx - ax)) + (Math.cos(rad) * (cy - ay))
    ]);
    const min = i => Math.round(Math.min(...corners.map(c => c[i])) * 1000) / 1000;
    assert.deepEqual([min(0), min(1)], [150, 75], `rotation ${rotation}`);
  }
  assert.deepEqual(centeredOrigin({x: 150, y: 150}, 1, 100), {x: 100, y: 100});
});

test("stampSize and tileData: an image that is not square keeps its proportions", () => {
  assert.deepEqual(stampSize(225, 1024 / 547), {width: 225, height: 120});
  assert.deepEqual(stampSize(150, 0.5), {width: 75, height: 150});
  assert.deepEqual(stampSize(100, 0), {width: 100, height: 100});
  // a 3-cell banquet table on a 75 px grid: centered on its block, whatever the rotation
  for ( const rotation of [0, 90, 180, 270] ) {
    const t = tileData({src: "t.webp", cells: 3, rotation, flip: false, aspect: 1024 / 547}, {x: 150, y: 75}, 75);
    assert.deepEqual([t.width, t.height], [225, 120]);
    const [ax, ay] = [t.texture.anchorX * t.width, t.texture.anchorY * t.height];
    const rad = rotation * Math.PI / 180;
    const corners = [[0, 0], [225, 0], [0, 120], [225, 120]].map(([cx, cy]) => [
      t.x + (Math.cos(rad) * (cx - ax)) - (Math.sin(rad) * (cy - ay)),
      t.y + (Math.sin(rad) * (cx - ax)) + (Math.cos(rad) * (cy - ay))
    ]);
    const center = [0, 1].map(i => (Math.min(...corners.map(c => c[i])) + Math.max(...corners.map(c => c[i]))) / 2);
    assert.ok(Math.abs(center[0] - 262.5) <= 0.5 && Math.abs(center[1] - 187.5) <= 0.5, `rotation ${rotation}: ${center}`);
  }
});

test("freeForStamp: blocks of a stroke do not overlap", () => {
  const placed = [{col: 0, row: 0}];
  assert.ok(freeForStamp(placed, {col: 1, row: 0}, 1));
  assert.ok(!freeForStamp(placed, {col: 1, row: 0}, 2));
  assert.ok(freeForStamp(placed, {col: 2, row: 1}, 2));
  assert.ok(freeForStamp([], {col: 5, row: 5}, 3));
});

test("resize, rotate, remember", () => {
  assert.equal(resize(1, -1), 1);
  assert.equal(resize(10, 1), 10);
  assert.equal(resize(2, 1), 3);
  assert.equal(rotate(0, -1), 270);
  assert.equal(rotate(270, 1), 0);
  assert.deepEqual(remember(["b", "a", "c"], "a", 3), ["a", "b", "c"]);
  assert.deepEqual(remember(undefined, "x"), ["x"]);
  assert.equal(remember(Array.from({length: 20}, (_, i) => `i${i}`), "new").length, 12);
});

test("tileOutline: the rectangle, turned around the anchor", () => {
  // a 2x1-cell tile centered at (150, 50)
  assert.deepEqual(tileOutline({x: 150, y: 50, width: 200, height: 100}),
    [[50, 0, 250, 0], [250, 0, 250, 100], [250, 100, 50, 100], [50, 100, 50, 0]]);
  // turned by 90: 1 wide, 2 high around the same center
  const turned = tileOutline({x: 150, y: 50, width: 200, height: 100, rotation: 90});
  const xs = turned.flatMap(w => [w[0], w[2]]), ys = turned.flatMap(w => [w[1], w[3]]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [100, 200, -50, 150]);
});
