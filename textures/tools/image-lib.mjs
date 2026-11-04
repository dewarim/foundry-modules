// ImageMagick for the texture tools: running it, measuring a seam, cross-fading a wrap, and
// getting raw pixels in and out. Imported by render.mjs, seam.mjs and flatten.mjs. Everything here
// needs the binaries, so it carries no tests of its own - the maths that can be tested on its own
// lives in hatch-lib.mjs and flatten-lib.mjs, which are pure.
import {execFileSync, spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {toLinear, toSrgb} from "./flatten-lib.mjs";

/** Is this binary on the PATH? The name is an argument, so nothing is interpolated into a shell. */
function onPath(cmd) {
  try {
    execFileSync("/bin/sh", ["-c", 'command -v "$1"', "sh", cmd], {stdio: "pipe"});
    return true;
  } catch {
    return false;
  }
}

/** ImageMagick 7 puts its tools behind `magick`; 6 has them as their own commands. */
function imageMagick() {
  const which = onPath;
  if ( which("magick") ) return {
    run: (tool, tArgs, opts) => execFileSync("magick", [tool, ...tArgs], opts),
    capture: (tool, tArgs) => spawnSync("magick", [tool, ...tArgs], {encoding: "utf8"})
  };
  if ( which("convert") && which("compare") ) return {
    run: (tool, tArgs, opts) => execFileSync(tool, tArgs, opts),
    capture: (tool, tArgs) => spawnSync(tool, tArgs, {encoding: "utf8"})
  };
  throw new Error("ImageMagick not found: install `imagemagick` (needs convert and compare)");
}
const magick = imageMagick();
export const im = magick.run;

/**
 * The RMSE between two images, as a fraction of full scale.
 *
 * `compare` writes the metric to stderr whether it succeeds or fails, and exits non-zero whenever
 * the images differ at all - so both streams have to be read, and a non-zero exit is not an error.
 * An earlier version read stdout only: identical images exited 0 with an empty stdout, the number
 * came back NaN, every comparison against it was false, and the tile was reported as tiling. A
 * measurement that cannot be parsed is a failed measurement and has to say so, never a pass.
 */
export function rmse(a, b) {
  const result = magick.capture("compare", ["-metric", "RMSE", a, b, "null:"]);
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const value = Number(text.match(/\(([\d.e+-]+)\)/)?.[1] ?? NaN);
  if ( !Number.isFinite(value) ) throw new Error(`could not read a difference from compare: ${JSON.stringify(text)}`);
  return value;
}

/**
 * How visible the tile's seam is, as {x, y} pairs of {seam, typical, ratio}.
 *
 * `seam` is the RMSE between the wrap-around pair of edge lines - the last column against the first.
 * `typical` is the RMSE between the whole image and itself rolled by one pixel, which is the average
 * difference between neighbouring lines over the entire image. Comparing the two asks the right
 * question: does the wrap look like an ordinary pair of neighbours, or like a cut?
 *
 * The global roll matters. An earlier version used the single adjacent pair next to the edge as the
 * yardstick, and on a quiet texture that pair can be almost identical - a near-zero denominator that
 * turns a harmless difference into a ratio of 20. `seam` is also reported on its own, so a tile with
 * a tiny absolute difference passes however large the ratio looks.
 */
export function seamMeasure(png, tmp) {
  const [w, h] = im("identify", ["-format", "%w %h", png], {encoding: "utf8"}).trim().split(" ").map(Number);
  const slice = (geometry, name) => {
    const out = path.join(tmp, name);
    im("convert", [png, "-crop", geometry, "+repage", out]);
    return out;
  };
  const rolled = (offset, name) => {
    const out = path.join(tmp, name);
    im("convert", [png, "-roll", offset, out]);
    return out;
  };
  const axis = (seam, typical) => ({seam, typical, ratio: (typical > 0) ? seam / typical : (seam > 0 ? Infinity : 1)});
  return {
    x: axis(rmse(slice(`1x${h}+${w - 1}+0`, "cl.png"), slice(`1x${h}+0+0`, "c0.png")), rmse(png, rolled("+1+0", "rx.png"))),
    y: axis(rmse(slice(`${w}x1+0+${h - 1}`, "rl.png"), slice(`${w}x1+0+0`, "r0.png")), rmse(png, rolled("+0+1", "ry.png")))
  };
}

/**
 * Cross-fade the overlap of a wider-than-one-period render onto the opposite edge, so the result
 * wraps. Column x of the output, for x below the overlap k, is F(x + size) fading into F(x): the
 * first output column is the content that continues past the last one, so the two meet. Then the
 * same down the other axis.
 */
export function crossFadeWrap(png, size, k, tmp) {
  const file = name => path.join(tmp, name);
  const pass = (input, output) => {
    const h = Number(im("identify", ["-format", "%h", input], {encoding: "utf8"}).trim());
    im("convert", [input, "-crop", `${size}x${h}+0+0`, "+repage", file("cf-base.png")]);
    im("convert", [input, "-crop", `${k}x${h}+${size}+0`, "+repage", file("cf-tail.png")]);
    // opaque where the tail has to take over (the very edge), transparent where the base wins
    im("convert", ["-size", `1x${k}`, "gradient:black-white", "-rotate", "90",
      "-resize", `${k}x${h}!`, "-alpha", "off", file("cf-mask.png")]);
    im("convert", [file("cf-tail.png"), file("cf-mask.png"), "-alpha", "off",
      "-compose", "CopyOpacity", "-composite", file("cf-tail-a.png")]);
    im("convert", [file("cf-base.png"), file("cf-tail-a.png"), "-geometry", "+0+0", "-composite", output]);
  };
  pass(png, file("cf-x.png"));
  im("convert", [file("cf-x.png"), "-rotate", "90", file("cf-xr.png")]);
  pass(file("cf-xr.png"), file("cf-yr.png"));
  im("convert", [file("cf-yr.png"), "-rotate", "-90", png]);
}

// A wrap-around edge fails when it differs from an ordinary neighbour pair by more than this ratio,
// unless the difference is small in absolute terms anyway (a quiet texture has little to differ by).
export const SEAM_LIMIT = 2.0;
export const SEAM_FLOOR = 0.012;  // RMSE as a fraction of full scale: below this, nothing is visible

/** Whether one axis of a measurement counts as a seam. An unreadable measurement is never a pass. */
export function isSeam(axis) {
  return !Number.isFinite(axis.ratio) || ((axis.ratio > SEAM_LIMIT) && (axis.seam > SEAM_FLOOR));
}

/** A one-line verdict for a measurement, for printing. */
export function seamVerdict({x, y}) {
  const bad = isSeam(x) || isSeam(y);
  return {
    bad,
    text: `seam ${(100*Math.max(x.seam, y.seam)).toFixed(1).padStart(5)}%  x ${x.ratio.toFixed(2)} y ${y.ratio.toFixed(2)}`
      + `  ${bad ? "SEAM - does not tile" : "tiles"}`
  };
}

/**
 * Rasterise an SVG at an explicit size, with librsvg.
 *
 * Deliberately not ImageMagick. Its built-in SVG renderer silently discards `stroke-opacity` - on
 * the rock-wall hatch tile, the file with its three layer opacities and the same file with the
 * attribute stripped out render to zero differing pixels - and it leaves the outermost pixel of the
 * viewport unpainted. Nor does installing librsvg help by itself: ImageMagick never consults its
 * own `svg => rsvg-convert` delegate, and `convert tile.svg` is byte-identical to
 * `convert MSVG:tile.svg` either way. So call rsvg-convert directly.
 *
 * And refuse rather than fall back, because the fallback's output is plausible and wrong: solid ink
 * where a faint layer was asked for is not something the seam check or the eye would flag.
 */
export function renderSvg(svg, png, size) {
  if ( !onPath("rsvg-convert") ) {
    throw new Error("rsvg-convert not found: install `librsvg2-bin` (Debian) or your librsvg tools package.\n"
      + "  Not optional, and ImageMagick is not a fallback: its own SVG renderer discards\n"
      + "  stroke-opacity and leaves the viewport's outermost pixel unpainted, so the drawn tiles\n"
      + "  would come out looking fine and being wrong.");
  }
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", png, svg],
    {stdio: ["ignore", "ignore", "pipe"]});
}

/** The pixel size of an image. */
export function imageSize(file) {
  const [width, height] = im("identify", ["-format", "%w %h", file], {encoding: "utf8"}).trim().split(" ").map(Number);
  if ( !(width > 0) || !(height > 0) ) throw new Error(`could not read the size of ${file}`);
  return {width, height};
}

/**
 * An image as three linear-light planes, by way of a raw 16-bit dump.
 *
 * Arithmetic cannot be done in ImageMagick here: this is a Q16 build without HDRI, so every
 * intermediate is clamped to 0 .. 1 and a division by a dark illumination estimate would simply
 * saturate. Raw pixels out, maths in JavaScript, raw pixels back in.
 */
export function readPlanes(file, tmp) {
  const {width, height} = imageSize(file);
  const raw = path.join(tmp, "planes-in.raw");
  im("convert", [file, "-alpha", "remove", "-alpha", "off", "-depth", "16", "-endian", "LSB", `rgb:${raw}`]);
  const bytes = fs.readFileSync(raw);
  const expected = width*height*3*2;
  if ( bytes.length !== expected ) throw new Error(`${file}: expected ${expected} raw bytes, got ${bytes.length}`);
  const samples = new Uint16Array(bytes.buffer, bytes.byteOffset, width*height*3);
  // one table for all of it: 65536 entries against three million pow() calls
  const linear = Float64Array.from({length: 65536}, (_, i) => toLinear(i / 65535));
  const planes = {r: new Float64Array(width*height), g: new Float64Array(width*height), b: new Float64Array(width*height)};
  for ( let i = 0; i < (width*height); i++ ) {
    planes.r[i] = linear[samples[(i*3)]];
    planes.g[i] = linear[samples[(i*3) + 1]];
    planes.b[i] = linear[samples[(i*3) + 2]];
  }
  return {width, height, planes};
}

/** Three linear-light planes back to an 8-bit sRGB image. */
export function writePlanes(planes, width, height, file, tmp) {
  const raw = path.join(tmp, "planes-out.raw");
  const samples = new Uint16Array(width*height*3);
  for ( let i = 0; i < (width*height); i++ ) {
    samples[(i*3)] = Math.round(toSrgb(planes.r[i])*65535);
    samples[(i*3) + 1] = Math.round(toSrgb(planes.g[i])*65535);
    samples[(i*3) + 2] = Math.round(toSrgb(planes.b[i])*65535);
  }
  fs.writeFileSync(raw, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  im("convert", ["-size", `${width}x${height}`, "-depth", "16", "-endian", "LSB", `rgb:${raw}`,
    "-depth", "8", `png24:${file}`]);
}
