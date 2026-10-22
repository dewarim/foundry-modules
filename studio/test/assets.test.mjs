import {test} from "node:test";
import assert from "node:assert/strict";
import {assetTarget, classifyAsset, findAssetPaths, folderChain, isFilePath, rewriteAssets} from "../scripts/assets.mjs";

const EXT = new Set(["png", "webp", "jpg", "mp3", "webm"]);
const MOD = "dewarim-dnd5e-crypt";

test("isFilePath", () => {
  assert.ok(isFilePath("assets/upload/map.png", EXT));
  assert.ok(isFilePath("assets/upload/map.webp?1234", EXT));
  assert.ok(!isFilePath("A goblin", EXT));
  assert.ok(!isFilePath("<img src=\"x.png\">", EXT));
  assert.ok(!isFilePath("notes.txt", EXT));
});

test("findAssetPaths: plain values and HTML references", () => {
  const scene = {
    background: {src: "assets/upload/crypt.webp"},
    tokens: [{texture: {src: "icons/svg/mystery-man.svg"}}, {texture: {src: "worlds/studio/tokens/g.png"}}],
    _stats: {thumb: "ignored.png"}
  };
  const journal = {pages: [{text: {content: `<p><img src="assets/upload/hall%20way.jpg"> <a href='x.mp3'>x</a></p>`}}]};
  assert.deepEqual([...findAssetPaths(scene, EXT)].sort(), ["assets/upload/crypt.webp", "worlds/studio/tokens/g.png"]);
  assert.deepEqual([...findAssetPaths(journal, EXT)].sort(), ["assets/upload/hall%20way.jpg", "x.mp3"]);
});

test("classifyAsset", () => {
  assert.equal(classifyAsset("https://x.org/a.png", {moduleId: MOD}).kind, "remote");
  assert.equal(classifyAsset("icons/svg/skull.svg", {moduleId: MOD}).kind, "core");
  assert.deepEqual(classifyAsset("systems/dnd5e/tokens/goblin.webp", {moduleId: MOD}), {kind: "system", packageId: "dnd5e"});
  assert.equal(classifyAsset(`modules/${MOD}/assets/a.png`, {moduleId: MOD}).kind, "own");
  assert.deepEqual(classifyAsset("modules/acme-adventures/a.webp", {moduleId: MOD}),
    {kind: "module", packageId: "acme-adventures"});
  assert.equal(classifyAsset("assets/upload/a.png", {moduleId: MOD}).kind, "copy");
  assert.equal(classifyAsset("/worlds/studio/a.png", {moduleId: MOD}).kind, "copy");
});

test("assetTarget is deterministic and decoded", () => {
  assert.equal(assetTarget("assets/upload/hall%20way.jpg", MOD), `modules/${MOD}/assets/upload/hall way.jpg`);
  assert.equal(assetTarget("worlds/studio-dnd5e/assets/scenes/x-thumb.webp", MOD),
    `modules/${MOD}/assets/world/assets/scenes/x-thumb.webp`);
  assert.equal(assetTarget("maps/a.png?v=2", MOD), `modules/${MOD}/assets/maps/a.png`);
});

test("rewriteAssets: whole values and inside HTML, input untouched", () => {
  const data = {
    img: "assets/upload/a.png",
    other: "assets/upload/a.png.bak",
    text: `<img src="assets/upload/a.png"><img src='assets/upload/b.png'><div style="background: url(assets/upload/a.png)">`,
    _stats: {x: "assets/upload/a.png"}
  };
  const mapping = new Map([["assets/upload/a.png", "modules/m/assets/upload/a.png"],
    ["assets/upload/b.png", "modules/m/assets/upload/b.png"]]);
  const out = rewriteAssets(data, mapping);
  assert.equal(out.img, "modules/m/assets/upload/a.png");
  assert.equal(out.other, "assets/upload/a.png.bak");
  assert.equal(out.text, `<img src="modules/m/assets/upload/a.png"><img src='modules/m/assets/upload/b.png'>`
    + `<div style="background: url(modules/m/assets/upload/a.png)">`);
  assert.equal(out._stats.x, "assets/upload/a.png");
  assert.equal(data.img, "assets/upload/a.png");
});

test("folderChain", () => {
  assert.deepEqual(folderChain("modules/m/assets"), ["modules", "modules/m", "modules/m/assets"]);
});
