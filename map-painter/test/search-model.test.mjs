import assert from "node:assert/strict";
import test from "node:test";
import {folderOf, matches, relative, searchTree, terms, withoutExtension} from "../scripts/search-model.mjs";
import {isImage} from "../scripts/stamp-model.mjs";

/** A stand-in for FilePicker.browse over a fixed tree. Counts how often each folder was opened. */
function fakeTree(tree, {unreadable = []} = {}) {
  const opened = [];
  const browse = async path => {
    opened.push(path);
    if ( unreadable.includes(path) ) throw new Error(`EACCES: ${path}`);
    const node = tree[path];
    if ( !node ) throw new Error(`no such folder: ${path}`);
    return {dirs: node.dirs ?? [], files: node.files ?? []};
  };
  return {browse, opened};
}

const TEXTURES = {
  "assets": {dirs: ["assets/hatch", "assets/liquids", "assets/web-base"], files: ["assets/readme.txt"]},
  "assets/hatch": {dirs: [], files: ["assets/hatch/water_1.webp", "assets/hatch/rock-wall_1.webp"]},
  "assets/liquids": {dirs: ["assets/liquids/old"], files: ["assets/liquids/water-deep_1.webp", "assets/liquids/lava_1.webp"]},
  "assets/liquids/old": {dirs: [], files: ["assets/liquids/old/Water%20Study.png"]},
  "assets/web-base": {dirs: [], files: ["assets/web-base/aqua.webp", "assets/web-base/red.webp"]}
};

test("a search reaches every folder below the one it starts in", async () => {
  const {browse, opened} = fakeTree(TEXTURES);
  const found = await searchTree({browse, root: "assets", needle: "water", isImage});
  assert.deepEqual(found.files, [
    "assets/hatch/water_1.webp",
    "assets/liquids/old/Water%20Study.png",
    "assets/liquids/water-deep_1.webp"
  ]);
  assert.equal(found.folders, 5, "every folder of the tree should have been opened");
  assert.equal(opened[0], "assets", "the search starts where the palette is standing");
  assert.equal(found.deep, false);
  assert.equal(found.truncated, false);
});

test("case does not matter, on either side, and nor does %20", async () => {
  const {browse} = fakeTree(TEXTURES);
  for ( const needle of ["WATER", "water", "WaTeR"] ) {
    const found = await searchTree({browse, root: "assets", needle, isImage});
    assert.equal(found.files.length, 3, needle);
    // "Water%20Study.png" is matched as "water study", which is what the palette shows.
    assert.ok(found.files.includes("assets/liquids/old/Water%20Study.png"), needle);
  }
  const spaced = await searchTree({browse, root: "assets", needle: "water study", isImage});
  assert.deepEqual(spaced.files, ["assets/liquids/old/Water%20Study.png"]);
});

test("the whole path matches, not just the file name", async () => {
  const {browse} = fakeTree(TEXTURES);
  // The folder's name is a way to ask for its contents without walking into it ...
  const folder = await searchTree({browse, root: "assets", needle: "web", isImage});
  assert.deepEqual(folder.files, ["assets/web-base/aqua.webp", "assets/web-base/red.webp"]);
  assert.deepEqual(folder.dirs, ["assets/web-base"]);
  // ... and several words narrow it, in any order.
  const both = await searchTree({browse, root: "assets", needle: "red base", isImage});
  assert.deepEqual(both.files, ["assets/web-base/red.webp"]);
});

test("the extension is not searched, or every webp would match \"web\"", async () => {
  // This is how the whole-path match was found to be too eager: ".webp" contains "web", so the
  // first version of it answered "web" with all 148 colour swatches *and* every rendered texture.
  const {browse} = fakeTree(TEXTURES);
  const found = await searchTree({browse, root: "assets", needle: "web", isImage});
  assert.ok(!found.files.includes("assets/hatch/water_1.webp"));
  assert.ok(!found.files.includes("assets/liquids/lava_1.webp"));
  assert.equal(withoutExtension("web-base/red.webp"), "web-base/red");
  assert.equal(withoutExtension("no-extension"), "no-extension");
  assert.equal(withoutExtension("dotted.folder/file.png"), "dotted.folder/file");
});

test("a search from a subfolder sees only that subfolder", async () => {
  const {browse, opened} = fakeTree(TEXTURES);
  const found = await searchTree({browse, root: "assets/liquids", needle: "water", isImage});
  assert.deepEqual(found.files, ["assets/liquids/old/Water%20Study.png", "assets/liquids/water-deep_1.webp"]);
  assert.ok(!opened.includes("assets/hatch"), "it should not have climbed out of liquids");
});

test("what is not an image is not a result", async () => {
  const {browse} = fakeTree(TEXTURES);
  const found = await searchTree({browse, root: "assets", needle: "readme", isImage});
  assert.deepEqual(found.files, []);
  const unfiltered = await searchTree({browse, root: "assets", needle: "readme"});
  assert.deepEqual(unfiltered.files, ["assets/readme.txt"]);
});

test("an empty filter searches for nothing rather than for everything", async () => {
  const {browse, opened} = fakeTree(TEXTURES);
  for ( const needle of ["", "   ", undefined] ) {
    const found = await searchTree({browse, root: "assets", needle, isImage});
    assert.deepEqual(found.files, []);
    assert.equal(found.folders, 0);
  }
  assert.deepEqual(opened, [], "an empty filter should not cost a single request");
});

test("a folder that cannot be read loses that folder and nothing else", async () => {
  const {browse} = fakeTree(TEXTURES, {unreadable: ["assets/liquids"]});
  const found = await searchTree({browse, root: "assets", needle: "water", isImage});
  assert.deepEqual(found.files, ["assets/hatch/water_1.webp"]);
  assert.deepEqual(found.failed, ["assets/liquids"]);
  // Its children are unreachable, so they are not counted as opened either.
  assert.equal(found.folders, 4);
});

test("the caps stop the search and say so", async () => {
  // A tree one folder deeper than the cap allows, with more images than the cap allows.
  const wide = {root: {dirs: [], files: []}};
  for ( let i = 0; i < 10; i++ ) {
    wide.root.dirs.push(`root/f${i}`);
    wide[`root/f${i}`] = {dirs: [], files: Array.from({length: 5}, (_, j) => `root/f${i}/water-${j}.webp`)};
  }
  const {browse} = fakeTree(wide);
  const folderCapped = await searchTree({browse, root: "root", needle: "water", isImage, maxFolders: 4});
  assert.equal(folderCapped.folders, 4);
  assert.equal(folderCapped.deep, true, "folders were left unopened");
  assert.equal(folderCapped.files.length, 15, "three folders of five");

  const resultCapped = await searchTree({browse, root: "root", needle: "water", isImage, maxResults: 7});
  assert.equal(resultCapped.truncated, true);
  assert.equal(resultCapped.files.length, 7);
  assert.ok(resultCapped.folders < 11, "it should stop opening folders once it has enough");
});

test("the small pieces behave", () => {
  assert.deepEqual(terms(" Dark  Red "), ["dark", "red"]);
  assert.deepEqual(terms(""), []);
  assert.equal(relative("assets/web-base/red.webp", "assets"), "web-base/red.webp");
  assert.equal(relative("assets/red.webp", "assets/"), "red.webp");
  assert.equal(relative("icons/x.webp", "assets"), "icons/x.webp", "a path outside the root stays whole");
  assert.equal(relative("assets/Water%20Study.png", "assets"), "Water Study.png");
  assert.equal(folderOf("web-base/red.webp"), "web-base");
  assert.equal(folderOf("red.webp"), "");
  assert.equal(matches("web-base/red.webp", ["red"]), true);
  assert.equal(matches("web-base/red.webp", ["red", "base"]), true);
  assert.equal(matches("web-base/red.webp", ["red", "blue"]), false);
  assert.equal(matches("anything", []), true, "no terms is not a filter");
});
