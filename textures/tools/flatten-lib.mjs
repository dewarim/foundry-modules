// Taking the lighting out of a texture without taking the texture with it. Pure: arrays in, arrays
// out, no files and no ImageMagick. test/flatten.test.mjs covers it.
//
// A diffusion model draws a lit scene, not a material: one part of the frame ends up brighter than
// another. That survives a perfectly seamless wrap and shows up as broad banding the moment the
// tile repeats - the very thing the POV-Ray scenes get for nothing from an orthographic camera and
// parallel lights. seam.mjs cannot catch it, because there is no discontinuity at the edge to
// catch: the trouble is in the middle.
//
// So: estimate the illumination as a heavily blurred luminance, and divide it out.
//
// Three details decide whether this works.
//
// The blur has to wrap. A blur with ordinary edge handling sees darkness past the border and dims
// the rim, putting in exactly the gradient being removed. Every box pass below indexes modulo the
// image, so the estimate is periodic - the right boundary for a tile. (The Python original did the
// same thing by multiplying in the Fourier domain; three wrapped box passes are a near-Gaussian,
// which is all a low-pass illumination estimate needs, and they cost the same at any radius
// instead of growing with it.)
//
// The radius has to sit between the two scales: larger than the features, smaller than the
// gradient. Too small and the blur still contains the stones, so dividing by it removes the stones
// - an early attempt at sigma 70 over all three channels in gamma space took the measured contrast
// from 0.131 to 0.032 and the colour with it. Too large and the estimate collapses towards the
// global mean and nothing is corrected: at sigma 171 on a 1024px tile the illumination variation
// only fell from 39% to 18%. A twentieth of the image is about right, and `--sigma` is there
// because the feature size is what really decides it.
//
// Only the luminance is divided out, so hue and saturation survive.

const SRGB_A = 0.055;

/** sRGB -> linear light, for one sample in 0 .. 1. */
export function toLinear(value) {
  return (value <= 0.04045) ? (value / 12.92) : (((value + SRGB_A) / (1 + SRGB_A))**2.4);
}

/** Linear light -> sRGB, for one sample in 0 .. 1. Out of range is clamped. */
export function toSrgb(value) {
  const v = Math.min(1, Math.max(0, value));
  return (v <= 0.0031308) ? (v*12.92) : (((1 + SRGB_A)*(v**(1 / 2.4))) - SRGB_A);
}

/** Rec. 709 luminance of a linear-light RGB plane triple, as one plane. */
export function luminance({r, g, b}) {
  const out = new Float64Array(r.length);
  for ( let i = 0; i < r.length; i++ ) out[i] = (0.2126*r[i]) + (0.7152*g[i]) + (0.0722*b[i]);
  return out;
}

export const mean = plane => plane.reduce((sum, value) => sum + value, 0) / plane.length;

export function deviation(plane) {
  const mu = mean(plane);
  let sum = 0;
  for ( const value of plane ) sum += (value - mu)**2;
  return Math.sqrt(sum / plane.length);
}

/**
 * The odd box widths whose repeated average comes closest to a Gaussian of this sigma.
 *
 * A box of width w has variance (w*w - 1)/12, and the variances of successive averages add, so n
 * boxes want a total of n*(w*w - 1)/12 = sigma*sigma. That rarely lands on an odd whole number, so
 * the count is split between the two nearest odd widths (Kovesi, "Fast Almost-Gaussian Filtering").
 */
export function boxSizes(sigma, passes = 3) {
  const ideal = Math.sqrt(((12*sigma*sigma) / passes) + 1);
  let lower = Math.floor(ideal);
  if ( (lower % 2) === 0 ) lower--;
  lower = Math.max(1, lower);
  const upper = lower + 2;
  const split = Math.round(((12*sigma*sigma) - (passes*lower*lower) - (4*passes*lower) - (3*passes))
    / ((-4*lower) - 4));
  return Array.from({length: passes}, (_, i) => ((i < split) ? lower : upper));
}

const wrapIndex = (i, n) => ((i % n) + n) % n;

/** One box average across the rows, indexed modulo the width. */
function boxRows(src, dst, width, height, box) {
  const radius = (box - 1) / 2;
  const scale = 1 / box;
  for ( let y = 0; y < height; y++ ) {
    const row = y*width;
    let sum = 0;
    for ( let i = -radius; i <= radius; i++ ) sum += src[row + wrapIndex(i, width)];
    for ( let x = 0; x < width; x++ ) {
      dst[row + x] = sum*scale;
      sum += src[row + wrapIndex(x + radius + 1, width)] - src[row + wrapIndex(x - radius, width)];
    }
  }
}

/** The same down the columns. */
function boxColumns(src, dst, width, height, box) {
  const radius = (box - 1) / 2;
  const scale = 1 / box;
  for ( let x = 0; x < width; x++ ) {
    let sum = 0;
    for ( let i = -radius; i <= radius; i++ ) sum += src[(wrapIndex(i, height)*width) + x];
    for ( let y = 0; y < height; y++ ) {
      dst[(y*width) + x] = sum*scale;
      sum += src[(wrapIndex(y + radius + 1, height)*width) + x] - src[(wrapIndex(y - radius, height)*width) + x];
    }
  }
}

/**
 * A near-Gaussian blur with periodic edges: repeated box averages that index modulo the image.
 *
 * A box wider than the image would count the same pixels more than once, and the answer in that
 * limit is the global mean anyway, so that case is returned directly.
 */
export function wrapBlur(plane, width, height, sigma, passes = 3) {
  if ( !(sigma > 0) ) return Float64Array.from(plane);
  const boxes = boxSizes(sigma, passes);
  if ( boxes.at(-1) >= Math.min(width, height) ) return new Float64Array(plane.length).fill(mean(plane));
  let src = Float64Array.from(plane);
  let dst = new Float64Array(plane.length);
  for ( const box of boxes ) {
    boxRows(src, dst, width, height, box);
    [src, dst] = [dst, src];
    boxColumns(src, dst, width, height, box);
    [src, dst] = [dst, src];
  }
  return src;
}

/**
 * How much the lighting alone varies, as a percentage of its mean. Under about 5% is flat.
 * Measured at a fixed sigma, so a before and an after are comparable.
 */
export function illuminationVariation(planes, width, height, sigma) {
  const illumination = wrapBlur(luminance(planes), width, height, sigma);
  return 100*deviation(illumination) / mean(illumination);
}

/**
 * Divide the blurred luminance out of linear-light planes. `clip` bounds the gain either way, so a
 * nearly black corner cannot be amplified into noise; `strength` below 1 keeps some of the
 * gradient.
 */
export function flattenPlanes(planes, width, height, {sigma, strength = 1, clip = 3} = {}) {
  const illumination = wrapBlur(luminance(planes), width, height, sigma);
  const level = mean(illumination);
  const floor = Math.max(level*1e-3, 1e-6);
  const out = {};
  for ( const channel of ["r", "g", "b"] ) out[channel] = new Float64Array(planes[channel].length);
  for ( let i = 0; i < illumination.length; i++ ) {
    let gain = level / Math.max(illumination[i], floor);
    gain = Math.min(clip, Math.max(1 / clip, gain));
    if ( strength !== 1 ) gain = 1 + ((gain - 1)*strength);
    out.r[i] = planes.r[i]*gain;
    out.g[i] = planes.g[i]*gain;
    out.b[i] = planes.b[i]*gain;
  }
  return out;
}

/** The default illumination radius: a twentieth of the shorter side. */
export const defaultSigma = (width, height) => Math.min(width, height) / 20;

/** The radius the report measures at - a fixed yardstick, independent of the correction. */
export const measureSigma = (width, height) => Math.min(width, height) / 11;
