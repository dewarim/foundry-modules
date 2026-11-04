import assert from "node:assert/strict";
import test from "node:test";
import {rng, periodicField, spacing, segmentStep, hatchStrokes, svgDocument} from "../tools/hatch-lib.mjs";

const SIZE = 1024;

test("the field repeats exactly over the tile", () => {
  const field = periodicField(rng(42), {terms: 6, maxFreq: 5});
  for ( const [u, v] of [[0.1, 0.3], [0.77, 0.02], [0.5, 0.5], [0.99, 0.64]] ) {
    assert.ok(Math.abs(field(u, v) - field(u + 1, v)) < 1e-9, `not periodic in u at ${u},${v}`);
    assert.ok(Math.abs(field(u, v) - field(u, v + 1)) < 1e-9, `not periodic in v at ${u},${v}`);
    assert.ok(Math.abs(field(u, v) - field(u + 3, v - 2)) < 1e-9, `not periodic over several tiles at ${u},${v}`);
  }
});

test("the field stays inside -1 .. 1", () => {
  const field = periodicField(rng(7));
  for ( let i = 0; i < 400; i++ ) {
    const value = field(i/400, ((i*37) % 400)/400);
    assert.ok((value >= -1.0001) && (value <= 1.0001), `field returned ${value}`);
  }
});

// Shifting the tile by its own width slides a (p, q) family sideways by q*size/L, and by its
// height by p*size/L. The family only maps onto itself when both are whole multiples of the
// spacing - that is the whole reason the spacing is not free to choose.
test("the spacing makes a line family survive a shift of one tile", () => {
  for ( const [p, q, m] of [[1, 1, 16], [2, 1, 11], [8, 1, 3], [-1, 2, 11], [3, -2, 7]] ) {
    const length = Math.hypot(p, q);
    const s = spacing(p, q, m, SIZE);
    for ( const shift of [Math.abs(q)*SIZE/length, Math.abs(p)*SIZE/length] ) {
      const inSpacings = shift / s;
      assert.ok(Math.abs(inSpacings - Math.round(inSpacings)) < 1e-9,
        `(${p},${q}) m=${m}: a shift of one tile moves the lines by ${inSpacings} spacings, not a whole number`);
    }
  }
});

// The same has to hold for the points a line is drawn through, or the two copies of one line get
// their vertices, weight changes and breaks in different places.
test("the segment step divides the spacing, so the sampling survives the shift too", () => {
  for ( const [p, q, m, want] of [[1, 1, 16, 14], [2, 1, 11, 13], [8, 1, 3, 15]] ) {
    const s = spacing(p, q, m, SIZE);
    const dt = segmentStep(s, want);
    assert.ok(dt <= want*1.5, `step ${dt} is far from the ${want} asked for`);
    const divisions = s / dt;
    assert.ok(Math.abs(divisions - Math.round(divisions)) < 1e-9, `step ${dt} does not divide spacing ${s}`);
    for ( const slide of [Math.abs(p)*m*s, Math.abs(q)*m*s] ) {
      const inSteps = slide / dt;
      assert.ok(Math.abs(inSteps - Math.round(inSteps)) < 1e-9,
        `(${p},${q}) m=${m}: a shift of one tile slides a line by ${inSteps} steps, not a whole number`);
    }
  }
});

test("strokes cover the tile and stay finite", () => {
  const rand = rng(3);
  const field = periodicField(rand);
  const strokes = hatchStrokes({
    size: SIZE, p: 2, q: 1, m: 11, waver: 3, step: 13, weight: 2, gap: 0.3,
    shape: field, ink: periodicField(rand)
  });
  assert.ok(strokes.length > 50, `only ${strokes.length} strokes`);
  for ( const stroke of strokes ) {
    assert.match(stroke.d, /^M-?[\d.]+,-?[\d.]+(L-?[\d.]+,-?[\d.]+)+$/, `bad path: ${stroke.d}`);
    assert.ok(Number.isFinite(stroke.width) && (stroke.width > 0), `bad width ${stroke.width}`);
  }
});

// ImageMagick's own SVG renderer leaves the outermost pixel of the viewport unpainted, which came
// out as a black line down one edge and a 39% seam on every drawn tile.
test("the paper overhangs the viewBox, so no edge pixel is left unpainted", () => {
  const svg = svgDocument({size: SIZE, paper: "#ffffff", layers: []});
  const rect = svg.match(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(rect, "no background rect");
  const [x, y, w, h] = rect.slice(1).map(Number);
  assert.ok(x < 0 && y < 0, `the paper starts at ${x},${y} - inside the box`);
  assert.ok((x + w) > SIZE && (y + h) > SIZE, "the paper does not reach past the far edge");
});
