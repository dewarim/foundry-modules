#!/usr/bin/env node
// Render the POV-Ray scenes in tools/scenes/ into assets/, and measure whether each result tiles.
//
//   node modules/dewarim-textures/tools/render.mjs [--only <scene>] [--size 1024] [--quality 88]
//                                                  [--keep-png] [--no-check] [--list]
//
// Each scene names its own target in a header comment: "// out: walls/block-wall-grey" becomes
// assets/walls/block-wall-grey.webp. Needs POV-Ray and ImageMagick on the PATH.
//
// --only takes a scene, a hatch, a recipe, a set of flat colours (`--only web-base`) or one
// colour by name (`--only cornflowerblue`).
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readAll, variantPath} from "./scene-list.mjs";
import {im, renderSvg, readPlanes, writePlanes, seamMeasure, seamVerdict, crossFadeWrap} from "./image-lib.mjs";
import {flattenPlanes, defaultSigma} from "./flatten-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const module_ = path.resolve(here, "..");
const scenesDir = path.join(here, "scenes");
const assetsDir = path.join(module_, "assets");

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const has = name => {
  const i = args.indexOf(name);
  return (i >= 0) && !!args.splice(i, 1);
};
const keepPng = has("--keep-png");
const noCheck = has("--no-check");
const list = has("--list");
const only = flag("--only");
const size = Number(flag("--size") ?? 1024);
const quality = Number(flag("--quality") ?? 88);

// How much wider than one period a `blend` scene is rendered, as a fraction. The overlap is what
// gets cross-faded onto the far edge, so it is also the width of the band where the texture is a
// mix of two unrelated pieces: too little and the join is abrupt, too much and the tile loses face.
const OVERLAP = 0.14;


// A drawn tile is rasterised at this multiple and scaled back down. Measured against a 4096px
// render of the same tile: 2x lands 0.0029 RMSE away where 1x is 0.0145, five times closer, and
// both rasterise in 13ms - the cost is in the path count, which the scale does not change. So it
// stays, even though librsvg antialiases properly and the original reason for it has gone.
const SUPERSAMPLE = 2;

// How large a flat swatch is written. Nothing about a constant image needs pixels, so this is only
// about being a usable thumbnail in the palette and surviving whatever scale the brush asks for -
// and it scales exactly, since every pixel is the same colour. 64px of flat colour is 44 bytes as
// lossless webp, so the whole of web-extended is about 5 kB.
const SWATCH_SIZE = 64;

/** Draw a hatch scene to PNG. See renderSvg() for why this does not go through ImageMagick. */
function draw(scene, variant, tmp) {
  const svg = path.join(tmp, `${scene.name}-${variant}.svg`);
  const big = path.join(tmp, `${scene.name}-${variant}-super.png`);
  const png = path.join(tmp, `${scene.name}-${variant}.png`);
  fs.writeFileSync(svg, scene.build({size: size*SUPERSAMPLE, variant}), "utf8");
  renderSvg(svg, big, size*SUPERSAMPLE);
  im("convert", [big, "-resize", `${size}x${size}!`, "-strip", png]);
  return png;
}

/**
 * Build one variant of a generated texture: run the model, take the lighting out, wrap it, resize.
 *
 * Needs the FLUX venv and the card, so a plain `render.mjs` skips these - only `--only <name>`
 * builds one. The order is not interchangeable. Flattening comes first, because the gradient runs
 * across the whole frame and has to go while the whole frame is still there; the cross-fade comes
 * second, because it is what makes the tile wrap; the resize comes last and has to use
 * `-virtual-pixel tile`, since an edge-clamped resample reads past the border and puts a seam back
 * into a tile that had none (1.34 against 1.08 on the x ratio, measured).
 */
function generate(scene, variant, tmp) {
  const {recipe} = scene;
  const python = process.env.FLUX_PYTHON
    ?? path.join(os.homedir(), "venvs", "flux-textures", "bin", "python");
  if ( !fs.existsSync(python) ) {
    throw new Error(`no FLUX python at ${python} - set FLUX_PYTHON, or see the README for the venv`);
  }
  const raw = path.join(tmp, `${scene.name}-${variant}.png`);
  execFileSync(python, [
    path.join(here, "flux", "generate.py"),
    "--prompt", recipe.prompt, "--out", raw, "--count", "1",
    "--size", String(recipe.size ?? 1024), "--steps", String(recipe.steps ?? 4),
    "--precision", recipe.precision ?? "nf4", "--seed", String(recipe.seeds[variant - 1])
  ], {stdio: ["ignore", "ignore", "pipe"]});

  const {width, height, planes} = readPlanes(raw, tmp);
  writePlanes(flattenPlanes(planes, width, height, {sigma: defaultSigma(width, height)}),
    width, height, raw, tmp);

  const overlap = recipe.overlap ?? OVERLAP;
  const k = Math.round(width*overlap / (1 + overlap));
  crossFadeWrap(raw, width - k, k, tmp);

  const png = path.join(tmp, `${scene.name}-${variant}-final.png`);
  im("convert", [raw, "-virtual-pixel", "tile", "-filter", "Lanczos",
    "-distort", "Resize", `${recipe.finalSize ?? size}x${recipe.finalSize ?? size}!`,
    "+repage", "-strip", png]);
  return png;
}

/**
 * Write the flat colour swatches, and read every one of them back.
 *
 * **Lossless, and this is not a preference.** A swatch's whole content is one RGB value, so a
 * lossy encoder that moves it has destroyed the only thing in the file: at quality 88, #1a6ec8
 * came back as (28,109,200) - a file named after a standard colour, holding a different one.
 * Lossless is also *smaller* here, 44 bytes against 88, because a constant image is what a
 * lossless predictor does best. So every swatch is written lossless and then read back with
 * `identify`, one call for the whole set, and the build reports how many came back exact.
 *
 * @param {object[]} entries  the colour entries from the scene list
 * @returns {{bytes: number, exact: number, wrong: string[]}}
 */
function buildColors(entries) {
  let bytes = 0;
  for ( const {out, color} of entries ) {
    const target = path.join(assetsDir, `${out}.webp`);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    im("convert", ["-size", `${SWATCH_SIZE}x${SWATCH_SIZE}`, `xc:${color.hex}`,
      "-define", "webp:lossless=true", "-strip", target]);
    bytes += fs.statSync(target).size;
  }
  const files = entries.map(e => path.join(assetsDir, `${e.out}.webp`));
  const read = new Map();
  const listing = im("identify", ["-format", "%d/%f %[pixel:p{0,0}]\n", ...files], {encoding: "utf8"});
  for ( const line of listing.trim().split("\n") ) {
    const m = line.match(/(\S+)\s+srgb\((\d+),(\d+),(\d+)\)\s*$/);
    if ( m ) read.set(m[1], [Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  const wrong = [];
  for ( const {out, color} of entries ) {
    const got = read.get(path.join(assetsDir, `${out}.webp`));
    if ( !got ) wrong.push(`${color.set}/${color.name}: could not be read back`);
    else if ( got.some((v, i) => v !== color.rgb[i]) ) {
      wrong.push(`${color.set}/${color.name}: asked for ${color.rgb.join(",")}, got ${got.join(",")}`);
    }
  }
  return {bytes, exact: entries.length - wrong.length, wrong};
}

function render(scene, variant, tmp) {
  // POV-Ray 3.7 without a povray.conf may only write inside the current directory, and resolves
  // #include against the current directory and the library paths - so render from the temp
  // directory and point +L at tools/, where common.inc lives.
  const out = variantPath(scene, variant);
  if ( scene.kind === "hatch" ) {
    const drawn = draw(scene, variant, tmp);
    const target = path.join(assetsDir, `${out}.webp`);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    im("convert", [drawn, "-quality", String(quality), "-define", "webp:method=6", target]);
    if ( keepPng ) fs.copyFileSync(drawn, path.join(assetsDir, `${out}.png`));
    return {target, png: drawn, out};
  }
  if ( scene.kind === "flux" ) {
    const made = generate(scene, variant, tmp);
    const target = path.join(assetsDir, `${out}.webp`);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    im("convert", [made, "-quality", String(quality), "-define", "webp:method=6", target]);
    if ( keepPng ) fs.copyFileSync(made, path.join(assetsDir, `${out}.png`));
    return {target, png: made, out};
  }
  const png = path.join(tmp, `${scene.name}-${variant}.png`);
  const blend = (scene.seamless === "blend");
  const k = blend ? Math.round(size*OVERLAP) : 0;
  execFileSync("povray", [
    `+I${scene.file}`, `+O${scene.name}-${variant}.png`, `+L${here}`, `+L${scenesDir}`,
    `+W${size + k}`, `+H${size + k}`,
    `Declare=Variant=${variant}`, `Declare=Overlap=${blend ? OVERLAP : 0}`,
    "+A0.2", "+AM2", "+R3", "+FN", "-D"
  ], {cwd: tmp, stdio: ["ignore", "ignore", "pipe"]});
  if ( blend ) crossFadeWrap(png, size, k, tmp);
  const target = path.join(assetsDir, `${out}.webp`);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  im("convert", [png, "-quality", String(quality), "-define", "webp:method=6", target]);
  if ( keepPng ) fs.copyFileSync(png, path.join(assetsDir, `${out}.png`));
  return {target, png, out};
}

// A set of flat colours is a legitimate thing to name, and it is named by its folder:
// `--only web-base` is the 16, `--only web-extended` the 124, `--only cornflowerblue` just that
// one. `--only colors` takes both sets, since they are one idea in two folders.
const named = s => (s.name === only) || (s.out === only)
  || ((s.kind === "color") && ((only === "colors") || (s.color.set === only)));
const all = await readAll();
const scenes = all.filter(s => !only || named(s));
if ( !scenes.length ) {
  console.error(only ? `no scene matches ${only}` : "no scenes found");
  process.exit(2);
}
if ( list ) {
  for ( const s of scenes.filter(s => s.kind !== "color") ) console.log(`${s.name.padEnd(18)} ${s.kind.padEnd(6)} ${s.seamless.padEnd(13)} -> assets/${s.out}.webp${s.variants > 1 ? ` (${s.variants} variants: _1 .. _${s.variants})` : ""}${s.kind === "flux" ? "  (only on request)" : ""}`);
  // One line per set rather than 140 near-identical ones.
  const colors = scenes.filter(s => s.kind === "color");
  for ( const set of [...new Set(colors.map(s => s.color.set))].sort() ) {
    const members = colors.filter(s => s.color.set === set);
    console.log(`${set.padEnd(18)} ${"color".padEnd(6)} ${"construction".padEnd(13)} -> assets/${set}/<name>.webp`
      + `  (${members.length} named colours: ${members.slice(0, 3).map(s => s.name).join(", ")} ...)`);
  }
  process.exit(0);
}

// A generated texture costs the venv, the card and half a minute per variant, and does not come
// back the same twice, so rebuilding one is a decision rather than a step in a build. Name it.
const building = scenes.filter(s => only || (s.kind !== "flux"));
for ( const skipped of scenes.filter(s => !building.includes(s)) ) {
  console.log(`${`assets/${skipped.out}.webp`.padEnd(38)} ${"generated".padStart(9)}  left alone - build it with --only ${skipped.name}`);
}

const colorEntries = building.filter(s => s.kind === "color");
const toRender = building.filter(s => s.kind !== "color");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dewarim-textures-"));
let failed = 0;
try {
  for ( const scene of toRender ) {
    for ( let variant = 1; variant <= scene.variants; variant++ ) {
      const started = Date.now();
      const {target, png, out} = render(scene, variant, tmp);
      const bytes = fs.statSync(target).size;
      let note = "";
      if ( !noCheck ) {
        const verdict = seamVerdict(seamMeasure(png, tmp));
        if ( verdict.bad ) failed++;
        note = verdict.text;
      }
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${`assets/${out}.webp`.padEnd(38)} ${String(Math.round(bytes / 1024)).padStart(5)} kB ${secs.padStart(6)}s  ${note}`);
    }
  }
} finally {
  fs.rmSync(tmp, {recursive: true, force: true});
}

// The swatches, one line per set: 140 lines would bury everything above, and there is nothing to
// say per swatch that the read-back does not say for all of them at once.
for ( const set of [...new Set(colorEntries.map(s => s.color.set))].sort() ) {
  const entries = colorEntries.filter(s => s.color.set === set);
  const started = Date.now();
  const {bytes, exact, wrong} = buildColors(entries);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const note = `${exact}/${entries.length} exact, flat so nothing to seam`;
  console.log(`${`assets/${set}/ (${entries.length} colours)`.padEnd(38)} ${String(Math.round(bytes / 1024)).padStart(5)} kB ${secs.padStart(6)}s  ${note}`);
  for ( const line of wrong ) console.error(`  ${line}`);
  if ( wrong.length ) failed++;
}

process.exit(failed ? 1 : 0);
