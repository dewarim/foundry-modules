#!/usr/bin/env node
// Take the lighting out of a texture, without taking the texture with it.
//
//   node modules/dewarim-textures/tools/flatten.mjs <image> [<image> ...]
//                [--out file] [--suffix -flat] [--sigma 51] [--strength 1] [--no-report]
//
// A tile can wrap perfectly and still be unusable: a diffusion model draws a lit scene, not a
// material, so one part of the frame is brighter than the other and the repeat shows broad bands.
// seam.mjs cannot see it - the trouble is in the middle, not at the edge. The maths and the
// reasoning are in flatten-lib.mjs; this is the file handling around it.
//
// The Node port of tools/flux/flatten.py, so a tile from anywhere can be flattened with nothing
// but ImageMagick on the PATH - no venv, no numpy.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {im, readPlanes, writePlanes} from "./image-lib.mjs";
import {flattenPlanes, illuminationVariation, defaultSigma, measureSigma} from "./flatten-lib.mjs";

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const has = name => {
  const i = args.indexOf(name);
  return (i >= 0) && !!args.splice(i, 1);
};
const out = flag("--out");
const suffix = flag("--suffix") ?? "-flat";
const sigmaArg = flag("--sigma");
const strength = Number(flag("--strength") ?? 1);
const report = !has("--no-report");
const images = args;
if ( !images.length ) {
  console.error("usage: flatten.mjs <image> [<image> ...] [--out file] [--suffix -flat]"
    + " [--sigma <px>] [--strength 1] [--no-report]");
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dewarim-flatten-"));
try {
  for ( const image of images ) {
    const {width, height, planes} = readPlanes(image, tmp);
    const sigma = sigmaArg ? Number(sigmaArg) : defaultSigma(width, height);
    const flat = flattenPlanes(planes, width, height, {sigma, strength});
    const target = ((out && (images.length === 1))
      ? out
      : `${image.replace(/\.[^.]+$/, "")}${suffix}.png`);
    const png = path.join(tmp, "flat.png");
    writePlanes(flat, width, height, png, tmp);
    im("convert", [png, target]);
    let note = "";
    if ( report ) {
      // A fixed yardstick, so the before and the after are the same measurement
      const yard = measureSigma(width, height);
      const before = illuminationVariation(planes, width, height, yard);
      const after = illuminationVariation(flat, width, height, yard);
      note = `  lighting ${before.toFixed(1)}% -> ${after.toFixed(1)}%`;
    }
    console.log(`${path.basename(target).padEnd(34)} sigma ${Math.round(sigma)}${note}`);
  }
} finally {
  fs.rmSync(tmp, {recursive: true, force: true});
}
