#!/usr/bin/env node
// Does this image tile? Measures any image, not just the ones this module renders - so a texture
// from somewhere else, or one a diffusion model produced, can be held to the same standard.
//
//   node modules/dewarim-textures/tools/seam.mjs <image> [<image> ...] [--fix] [--force]
//                                                 [--overlap 0.14]
//
// With --fix it cross-fades the wrap onto the image and writes <name>-tiled.png beside it, then
// measures again. Exits non-zero if anything still shows a seam.
//
// --fix only acts on an image the measurement calls bad; --force makes it act anyway. That is not
// redundant. The verdict passes anything whose absolute difference is under SEAM_FLOOR, on the
// argument that nothing so small is visible - true for a difference spread over a texture, false
// for one that lines up into a straight edge. A generated water tile measured 0.6%, passed, and
// still drew a visible grid at every tile join, because the eye finds lines rather than magnitudes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {im, seamMeasure, seamVerdict, crossFadeWrap} from "./image-lib.mjs";

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const has = name => {
  const i = args.indexOf(name);
  return (i >= 0) && !!args.splice(i, 1);
};
const force = has("--force");
const fix = has("--fix") || force;
const overlap = Number(flag("--overlap") ?? 0.14);
const images = args;
if ( !images.length ) {
  console.error("usage: seam.mjs <image> [<image> ...] [--fix] [--force] [--overlap 0.14]");
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dewarim-seam-"));
let failed = 0;
try {
  for ( const image of images ) {
    const working = path.join(tmp, "in.png");
    im("convert", [image, working]);
    let verdict = seamVerdict(seamMeasure(working, tmp));
    let note = "";
    if ( fix && (verdict.bad || force) ) {
      // Cross-fading costs a band of the image, so the kept part is what is left of one period.
      const [w] = im("identify", ["-format", "%w %h", working], {encoding: "utf8"}).trim().split(" ").map(Number);
      const k = Math.round(w*overlap / (1 + overlap));
      crossFadeWrap(working, w - k, k, tmp);
      const fixed = `${image.replace(/\.[^.]+$/, "")}-tiled.png`;
      im("convert", [working, fixed]);
      verdict = seamVerdict(seamMeasure(working, tmp));
      note = ` -> ${path.basename(fixed)} (${w - k}px)`;
    }
    if ( verdict.bad ) failed++;
    console.log(`${path.basename(image).padEnd(34)} ${verdict.text}${note}`);
  }
} finally {
  fs.rmSync(tmp, {recursive: true, force: true});
}
process.exit(failed ? 1 : 0);
