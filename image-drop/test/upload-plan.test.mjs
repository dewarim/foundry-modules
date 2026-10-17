import {test} from "node:test";
import assert from "node:assert/strict";
import {
  baseNames, extensionOf, folderChain, isImageFile, normalizeFolder, planUploads, sanitizeFileName, uniqueFileName
} from "../scripts/upload-plan.mjs";

const IMAGES = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

test("extensionOf", () => {
  assert.equal(extensionOf("Map.PNG"), "png");
  assert.equal(extensionOf("archive.tar.gz"), "gz");
  assert.equal(extensionOf(".hidden"), "");
  assert.equal(extensionOf("noext"), "");
});

test("isImageFile goes by extension", () => {
  assert.ok(isImageFile({name: "a.webp"}, IMAGES));
  assert.ok(!isImageFile({name: "notes.txt"}, IMAGES));
  assert.ok(!isImageFile({name: "png"}, IMAGES));
});

test("sanitizeFileName", () => {
  assert.equal(sanitizeFileName("Drachenhöhle Karte (2).PNG"), "Drachenhohle-Karte-2.png");
  assert.equal(sanitizeFileName("  ..weird//name..jpg"), "weird-name.jpg");
  assert.equal(sanitizeFileName("???.png"), "image.png");
  assert.equal(sanitizeFileName("token_01.webp"), "token_01.webp");
});

test("uniqueFileName counts up", () => {
  assert.equal(uniqueFileName("map.png", new Set()), "map.png");
  assert.equal(uniqueFileName("map.png", new Set(["map.png"])), "map-1.png");
  assert.equal(uniqueFileName("map.png", new Set(["map.png", "map-1.png"])), "map-2.png");
});

test("normalizeFolder", () => {
  assert.equal(normalizeFolder("/worlds/dnd5/uploads/"), "worlds/dnd5/uploads");
  assert.equal(normalizeFolder("assets\\\\maps/./x"), "assets/maps/x");
  assert.equal(normalizeFolder(""), "");
  assert.throws(() => normalizeFolder("worlds/../../etc"));
});

test("folderChain", () => {
  assert.deepEqual(folderChain("a/b/c"), ["a", "a/b", "a/b/c"]);
  assert.deepEqual(folderChain(""), []);
});

test("planUploads skips non-images and dedupes within one drop", () => {
  const files = [{name: "Map.png"}, {name: "readme.txt"}, {name: "map.png"}, {name: "token.webp"}];
  const {uploads, skipped} = planUploads(files, {imageExtensions: IMAGES, existing: ["token.webp"]});
  assert.deepEqual(uploads.map(u => u.name), ["Map.png", "map.png", "token-1.webp"]);
  assert.deepEqual(skipped.map(f => f.name), ["readme.txt"]);
});

test("baseNames decodes browse paths", () => {
  assert.deepEqual(baseNames(["worlds/dnd5/uploads/my%20map.png", "x/y.jpg"]), ["my map.png", "y.jpg"]);
});
