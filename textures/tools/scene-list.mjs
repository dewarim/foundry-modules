// Reading the scene list - no POV-Ray, no ImageMagick, no Foundry: test/scenes.test.mjs covers it.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {webColors} from "./web-colors.mjs";

/**
 * How a scene gets its tile to wrap.
 *
 *   construction - every part of the scene is periodic to begin with, so the render already tiles.
 *                  Keeps all the detail, but the recipe has to be built for it.
 *   blend        - the scene is rendered a little wider than one period and the overlap is
 *                  cross-faded onto the opposite edge. Any pattern at all can be used, including
 *                  POV's non-periodic ones (crackle, marble, agate), at the price of a band down
 *                  one edge where two unrelated pieces of texture are mixed. Invisible on broken,
 *                  grainy material; a visible ghost on anything with long straight structure.
 */
export const SEAMLESS_MODES = ["construction", "blend"];

export const toolsDir = path.dirname(fileURLToPath(import.meta.url));
export const scenesDir = path.join(toolsDir, "scenes");
export const hatchesDir = path.join(toolsDir, "hatches");
export const generatedDir = path.join(toolsDir, "generated");
export const webColorLib = path.join(toolsDir, "web-colors.mjs");

/** The scenes, each with the asset path from its "// out:" header. */
export function readScenes(dir = scenesDir) {
  return fs.readdirSync(dir).filter(f => f.endsWith(".pov")).sort().map(file => {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    const out = source.match(/^\s*\/\/\s*out:\s*(\S+)\s*$/m)?.[1];
    if ( !out ) throw new Error(`${file}: no "// out: <path>" header`);
    const variants = Number(source.match(/^\s*\/\/\s*variants:\s*(\d+)\s*$/m)?.[1] ?? 1);
    const seamless = source.match(/^\s*\/\/\s*seamless:\s*(\w+)\s*$/m)?.[1] ?? "construction";
    if ( !SEAMLESS_MODES.includes(seamless) ) throw new Error(`${file}: unknown seamless mode ${seamless}`);
    return {kind: "pov", name: file.replace(/\.pov$/, ""), file: path.join(dir, file), out, variants, seamless, source};
  });
}

/**
 * The hatch generators: drawn rather than rendered, so each is a module that returns SVG. They tile
 * by construction (see hatch-lib.mjs), which is why they declare `construction` like a POV scene
 * that is periodic to begin with.
 */
export async function readHatches(dir = hatchesDir) {
  if ( !fs.existsSync(dir) ) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".mjs")).sort();
  return Promise.all(files.map(async file => {
    const loaded = await import(pathToFileURL(path.join(dir, file)).href);
    if ( !loaded.out ) throw new Error(`${file}: no exported "out"`);
    if ( typeof loaded.build !== "function" ) throw new Error(`${file}: no exported build()`);
    return {
      kind: "hatch", name: file.replace(/\.mjs$/, ""), file: path.join(dir, file),
      out: loaded.out, variants: loaded.variants ?? 1, seamless: "construction", build: loaded.build
    };
  }));
}

/**
 * The generated textures: a recipe naming a model, a prompt and one seed per variant.
 *
 * These are for materials that are easier to describe than to build - water with real caustics,
 * moss, worn plaster. A recipe is not a guarantee of the same pixels back; it records what was run,
 * so an asset can be traced, argued with and regenerated, and so the library is not a folder of
 * images nobody can account for. `blend`, because a diffusion model has no period: the wrap is
 * cross-faded on afterwards.
 */
export function readGenerated(dir = generatedDir) {
  if ( !fs.existsSync(dir) ) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().map(file => {
    const recipe = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    for ( const field of ["out", "prompt", "seeds"] ) {
      if ( !recipe[field] ) throw new Error(`${file}: no "${field}"`);
    }
    if ( !Array.isArray(recipe.seeds) || !recipe.seeds.length ) throw new Error(`${file}: "seeds" is not a list of seeds`);
    return {
      kind: "flux", name: file.replace(/\.json$/, ""), file: path.join(dir, file),
      out: recipe.out, variants: recipe.seeds.length, seamless: "blend", recipe
    };
  });
}

/**
 * The flat colour swatches: one single-colour tile per named web colour, in two sets.
 *
 * Not textures at all, and that is what they are for - "the floor is water", "stamp dark brown for
 * earth", a room blocked out before anyone has decided what it is made of. `web-base` is the 16
 * HTML names, which is the whole palette most maps need; `web-extended` is the other 124, for when
 * `peru` or `darkslategray` is exactly the word for it.
 *
 * `construction`, trivially: every pixel is the same colour, so the last column equals the first
 * and the seam measurement has nothing to find. They are the only assets here whose wrap needs no
 * argument at all.
 */
export function readWebColors() {
  return webColors().map(color => ({
    kind: "color", name: color.name, file: webColorLib, out: color.out, variants: 1,
    seamless: "construction", color
  }));
}

/** Everything that produces an asset, drawn, rendered, generated and flat alike, sorted by name. */
export async function readAll() {
  return [...readScenes(), ...await readHatches(), ...readGenerated(), ...readWebColors()]
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Where one variant of a scene is written. A scene that renders more than one draw of its recipe
 * numbers them - floors/dirt becomes floors/dirt_1 .. floors/dirt_4 - so the palette shows them side
 * by side and a scene can gain variants later without renaming the ones already there.
 */
export function variantPath(scene, variant) {
  return (scene.variants > 1) ? `${scene.out}_${variant}` : scene.out;
}

/** Every asset a scene is responsible for. */
export function scenePaths(scene) {
  return Array.from({length: scene.variants}, (_, i) => variantPath(scene, i + 1));
}

/** The periodic fields from common.inc. Their period-1 property is what makes a tile seamless. */
export const PERIODIC_FIELDS = ["fField", "fField2", "fLow", "fWave", "fVein", "fVein2"];

/** Split an argument list on the commas that are not inside brackets. */
function splitArgs(text) {
  const out = [];
  let depth = 0;
  let current = "";
  for ( const ch of text ) {
    if ( (ch === ",") && (depth === 0) ) {
      out.push(current);
      current = "";
      continue;
    }
    if ( ch === "(" ) depth++;
    if ( ch === ")" ) depth--;
    current += ch;
  }
  out.push(current);
  return out;
}

/**
 * Every factor applied to a texture coordinate in a call to one of the periodic fields, as
 * {call, factor} - the factor being a number or the name of a declared constant.
 *
 * A field has period 1 in u and v. Scaling a coordinate by a whole number keeps that period, so
 * fLow(u*2, v*2) still tiles; scaling it by anything else destroys the period and the texture grows
 * a seam that nothing in the rendering will warn about. These are the factors that have to be whole.
 */
export function coordinateFactors(source) {
  const out = [];
  for ( const field of PERIODIC_FIELDS ) {
    for ( const m of source.matchAll(new RegExp(`\\b${field}\\s*\\(`, "g")) ) {
      let depth = 1;
      let i = m.index + m[0].length;
      const from = i;
      while ( (i < source.length) && (depth > 0) ) {
        if ( source[i] === "(" ) depth++;
        if ( source[i] === ")" ) depth--;
        i++;
      }
      const args = splitArgs(source.slice(from, i - 1)).slice(0, 2);  // only u and v are coordinates
      for ( const arg of args ) {
        for ( const f of arg.matchAll(/\*\s*([A-Za-z_]\w*|[\d.]+)/g) ) out.push({call: `${field}(${args.join(",").trim()})`, factor: f[1]});
      }
    }
  }
  return out;
}

/**
 * What a constant used as a coordinate factor resolves to, across every source that declares it, or
 * null where it is not a whole number. Handles one level of indirection (FREQ2 = FREQ*2).
 */
export function resolveFactor(name, sources) {
  if ( /^[\d.]+$/.test(name) ) return Number.isInteger(Number(name)) ? [Number(name)] : null;
  const values = [];
  for ( const source of sources ) {
    for ( const m of source.matchAll(new RegExp(`#declare\\s+${name}\\s*=\\s*([^;]+);`, "g")) ) {
      const expr = m[1].trim();
      if ( /^\d+$/.test(expr) ) {
        values.push(Number(expr));
        continue;
      }
      const chain = expr.match(/^([A-Za-z_]\w*)\s*\*\s*(\d+)$/);
      if ( chain ) {
        const inner = resolveFactor(chain[1], sources);
        if ( !inner ) return null;
        values.push(...inner.map(v => v*Number(chain[2])));
        continue;
      }
      return null;
    }
  }
  return values.length ? values : null;
}
