import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {readScenes, readAll, readGenerated, scenePaths, coordinateFactors, resolveFactor, scenesDir} from "../tools/scene-list.mjs";

const module_ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenes = readScenes();
const everything = await readAll();

/** common.inc, every scene, and the recipe files the scenes include. */
function allSources() {
  const inc = dir => fs.readdirSync(dir).filter(f => f.endsWith(".inc"))
    .map(f => [f, fs.readFileSync(path.join(dir, f), "utf8")]);
  return [
    ...inc(path.join(module_, "tools")),
    ...inc(scenesDir),
    ...scenes.map(s => [s.name, s.source])
  ];
}

test("every scene names an output, and no two name the same one", () => {
  assert.ok(everything.length > 0, "nothing to render");
  const seen = new Map();
  for ( const scene of everything ) {
    assert.match(scene.out, /^[a-z0-9-]+\/[a-z0-9-]+$/, `${scene.name}: out is not <folder>/<name>`);
    assert.ok(Number.isInteger(scene.variants) && (scene.variants >= 1), `${scene.name}: variants is not a count`);
    for ( const out of scenePaths(scene) ) {
      assert.equal(seen.get(out), undefined, `${out} comes from both ${seen.get(out)} and ${scene.name}`);
      seen.set(out, scene.name);
    }
  }
});

test("every scene has been rendered into assets, every variant of it", () => {
  for ( const scene of everything ) {
    for ( const out of scenePaths(scene) ) {
      const file = path.join(module_, "assets", `${out}.webp`);
      assert.ok(fs.existsSync(file), `${scene.name}: assets/${out}.webp is missing (node tools/render.mjs)`);
    }
  }
});

test("assets has nothing in it that no scene produces", () => {
  const wanted = new Set(everything.flatMap(s => scenePaths(s).map(o => `${o}.webp`)));
  const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.relative(path.join(module_, "assets"), path.join(dir, e.name))]);
  for ( const file of walk(path.join(module_, "assets")) ) {
    assert.ok(wanted.has(file), `assets/${file} is left over - no scene renders it any more`);
  }
});

test("a periodic field is only ever given a coordinate scaled by a whole number", () => {
  const sources = allSources();
  const texts = sources.map(([, text]) => text);
  for ( const [name, text] of sources ) {
    for ( const {call, factor} of coordinateFactors(text) ) {
      const resolved = resolveFactor(factor, texts);
      assert.ok(resolved,
        `${name}: ${call} scales a coordinate by ${factor}, which is not a whole number - only whole numbers keep period 1, so this tile would grow a seam`);
      for ( const value of resolved ) {
        assert.ok(Number.isInteger(value) && (value >= 1),
          `${name}: ${call} scales a coordinate by ${factor} = ${value}`);
      }
    }
  }
});

test("a generated texture records a distinct seed for every variant", () => {
  for ( const scene of readGenerated() ) {
    const {seeds, prompt} = scene.recipe;
    assert.equal(seeds.length, scene.variants);
    assert.equal(new Set(seeds).size, seeds.length,
      `${scene.name}: a seed is repeated, so two variants would be the same picture`);
    for ( const seed of seeds ) assert.ok(Number.isInteger(seed) && (seed >= 0), `${scene.name}: ${seed} is not a seed`);
    assert.ok(prompt.length > 20, `${scene.name}: the prompt is the recipe, so it has to be the one that was used`);
    // Seamless by cross-fade, never by construction: a diffusion model has no period to build on.
    assert.equal(scene.seamless, "blend");
  }
});
