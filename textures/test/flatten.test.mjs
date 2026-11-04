import assert from "node:assert/strict";
import test from "node:test";
import {
  toLinear, toSrgb, luminance, mean, deviation, boxSizes, wrapBlur, flattenPlanes,
  illuminationVariation, defaultSigma, measureSigma
} from "../tools/flatten-lib.mjs";

const W = 64;
const H = 48;

/** A deterministic generator, so a failure is reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const field = fn => {
  const plane = new Float64Array(W*H);
  for ( let y = 0; y < H; y++ ) for ( let x = 0; x < W; x++ ) plane[(y*W) + x] = fn(x, y);
  return plane;
};

/** Move a plane by (dx, dy), wrapping - the operation a periodic blur has to commute with. */
const shift = (plane, dx, dy) => field((x, y) =>
  plane[((((y - dy) % H) + H) % H)*W + ((((x - dx) % W) + W) % W)]);

test("the sRGB transfer function round-trips, and matches its anchor points", () => {
  // 1e-6 and not closer: the standard's two break points, 0.04045 and 0.0031308, are rounded
  // independently, so the forward and the inverse branch disagree by about 3e-8 at the kink.
  for ( const value of [0, 0.002, 0.04045, 0.2, 0.5, 0.9, 1] ) {
    assert.ok(Math.abs(toSrgb(toLinear(value)) - value) < 1e-6, `${value} did not survive the round trip`);
  }
  assert.equal(toLinear(0), 0);
  assert.equal(toSrgb(0), 0);
  assert.ok(Math.abs(toLinear(1) - 1) < 1e-12);
  assert.ok(Math.abs(toLinear(0.5) - 0.21404) < 1e-4, "mid sRGB is about 21% of full light");
  // out of range is clamped rather than producing NaN from a fractional power of a negative
  assert.equal(toSrgb(-0.5), 0);
  assert.ok(Math.abs(toSrgb(2) - 1) < 1e-12);
});

test("the box widths are odd, and their variances add up to the sigma asked for", () => {
  for ( const sigma of [1, 2.5, 7, 26, 51.2, 93, 200] ) {
    const boxes = boxSizes(sigma);
    assert.equal(boxes.length, 3);
    for ( const box of boxes ) assert.equal(box % 2, 1, `box width ${box} is not odd, so it has no centre`);
    const variance = boxes.reduce((sum, box) => sum + (((box*box) - 1) / 12), 0);
    assert.ok(Math.abs(Math.sqrt(variance) - sigma) < Math.max(0.35, sigma*0.02),
      `boxes ${boxes} give sigma ${Math.sqrt(variance).toFixed(2)}, wanted ${sigma}`);
  }
});

test("the blur wraps: it commutes with a shift, which an edge-handling blur does not", () => {
  const rand = rng(7);
  const plane = field(() => rand());
  const sigma = 4;
  const blurredThenShifted = shift(wrapBlur(plane, W, H, sigma), 17, -9);
  const shiftedThenBlurred = wrapBlur(shift(plane, 17, -9), W, H, sigma);
  for ( let i = 0; i < plane.length; i++ ) {
    assert.ok(Math.abs(blurredThenShifted[i] - shiftedThenBlurred[i]) < 1e-12,
      `the blur treats pixel ${i} differently depending on where the border is`);
  }
});

test("the blur keeps the mean, and leaves a constant alone", () => {
  const rand = rng(11);
  const plane = field(() => rand());
  const blurred = wrapBlur(plane, W, H, 6);
  assert.ok(Math.abs(mean(blurred) - mean(plane)) < 1e-12, "a box average cannot change the mean");
  const flat = field(() => 0.42);
  for ( const value of wrapBlur(flat, W, H, 9) ) assert.ok(Math.abs(value - 0.42) < 1e-12);
});

test("a whole-frequency sine comes out as the same sine, only weaker", () => {
  // The periodic blur of sin(2*pi*f*x/W) is a multiple of itself: same phase, smaller amplitude.
  const plane = field(x => Math.sin(2*Math.PI*3*x / W));
  const blurred = wrapBlur(plane, W, H, 5);
  const gain = blurred[(0*W) + 5] / plane[(0*W) + 5];
  assert.ok((gain > 0) && (gain < 1), `the blur should damp the sine, not invert it (gain ${gain})`);
  for ( let i = 0; i < plane.length; i++ ) {
    assert.ok(Math.abs(blurred[i] - (gain*plane[i])) < 1e-9, `pixel ${i} picked up a phase shift`);
  }
});

test("a radius wider than the image collapses to the global mean", () => {
  const rand = rng(13);
  const plane = field(() => rand());
  const blurred = wrapBlur(plane, W, H, 500);
  for ( const value of blurred ) assert.ok(Math.abs(value - mean(plane)) < 1e-12);
});

test("flattening takes out a gradient that wraps, and leaves the material behind", () => {
  // a flat "material": fine noise with no large-scale structure, lit by a smooth periodic field
  const rand = rng(17);
  const material = field(() => 0.3 + (rand()*0.2));
  const light = field((x, y) => 0.7 + (0.3*Math.sin(2*Math.PI*x / W)*Math.sin(2*Math.PI*y / H)));
  const lit = {r: new Float64Array(W*H), g: new Float64Array(W*H), b: new Float64Array(W*H)};
  for ( let i = 0; i < material.length; i++ ) {
    lit.r[i] = material[i]*light[i];
    lit.g[i] = material[i]*light[i]*0.8;
    lit.b[i] = material[i]*light[i]*0.6;
  }
  const yard = measureSigma(W, H);
  const before = illuminationVariation(lit, W, H, yard);
  const flat = flattenPlanes(lit, W, H, {sigma: defaultSigma(W, H)});
  const after = illuminationVariation(flat, W, H, yard);
  assert.ok(before > 15, `the test input is not actually lit unevenly (${before.toFixed(1)}%)`);
  assert.ok(after < 5, `lighting only went from ${before.toFixed(1)}% to ${after.toFixed(1)}%`);
  // the material survives: its own contrast is kept, and the colour ratios are untouched
  const contrast = planes => deviation(luminance(planes)) / mean(luminance(planes));
  assert.ok(Math.abs(contrast(flat) - (deviation(material) / mean(material))) < 0.02,
    "dividing by the illumination took the material's own contrast with it");
  for ( let i = 0; i < 50; i++ ) {
    assert.ok(Math.abs((flat.g[i] / flat.r[i]) - 0.8) < 1e-12, "the hue moved");
    assert.ok(Math.abs((flat.b[i] / flat.r[i]) - 0.6) < 1e-12);
  }
});

test("a flat input is left as it is, once the radius clears the features", () => {
  const rand = rng(19);
  const plane = field(() => 0.3 + (rand()*0.2));   // noise one pixel across, no large-scale structure
  const planes = {r: plane, g: Float64Array.from(plane), b: Float64Array.from(plane)};
  for ( let i = 0; i < plane.length; i++ ) {
    const flat = flattenPlanes(planes, W, H, {sigma: 10});
    assert.ok(Math.abs(flat.r[i] - plane[i]) < 0.01, `pixel ${i} moved by ${flat.r[i] - plane[i]}`);
  }
  // The other half of that sentence: at a radius near the feature size the estimate still contains
  // the features, so dividing by it eats them. This is the trap the tool's --sigma exists for.
  const tooSmall = flattenPlanes(planes, W, H, {sigma: 1});
  const moved = Math.max(...Array.from(plane, (value, i) => Math.abs(tooSmall.r[i] - value)));
  assert.ok(moved > 0.03, `a radius of 1px should flatten the noise itself, but moved only ${moved}`);
});

test("strength 0 changes nothing at all", () => {
  const rand = rng(23);
  const plane = field((x, y) => (0.3 + (rand()*0.2))*(0.7 + (0.3*Math.sin(2*Math.PI*x / W))));
  const planes = {r: plane, g: Float64Array.from(plane), b: Float64Array.from(plane)};
  const none = flattenPlanes(planes, W, H, {sigma: defaultSigma(W, H), strength: 0});
  for ( let i = 0; i < plane.length; i++ ) assert.equal(none.r[i], plane[i]);
});

test("the gain is bounded, so a dark corner is not amplified into noise", () => {
  // half the tile is nearly black: without the clip its gain would run away
  const planes = {};
  for ( const channel of ["r", "g", "b"] ) {
    planes[channel] = field(x => ((x < (W / 2)) ? 0.5 : 0.0005));
  }
  const flat = flattenPlanes(planes, W, H, {sigma: 4, clip: 3});
  for ( let i = 0; i < planes.r.length; i++ ) {
    const gain = flat.r[i] / planes.r[i];
    assert.ok((gain <= (3 + 1e-9)) && (gain >= ((1 / 3) - 1e-9)), `gain ${gain} is outside the clip`);
  }
});

test("the radii are a fraction of the shorter side, and the yardstick is the wider of the two", () => {
  assert.equal(defaultSigma(1024, 1024), 51.2);
  assert.equal(defaultSigma(2048, 1024), 51.2);
  assert.ok(measureSigma(1024, 1024) > defaultSigma(1024, 1024),
    "the report has to measure coarser than the correction, or it measures its own work");
});
