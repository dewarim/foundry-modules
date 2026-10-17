import {test} from "node:test";
import assert from "node:assert/strict";
import {basename, cleanFolderName, copyNames, crumbs, extensionOf, fileKind, join, parent, planCopy, select, uniqueName}
  from "../scripts/paths.mjs";

const KINDS = {image: ["png", "webp", "jpg"], video: ["webm", "mp4"], audio: ["ogg", "mp3"]};

test("basename, parent, join", () => {
  assert.equal(basename("assets/upload/hall%20way.jpg"), "hall way.jpg");
  assert.equal(basename("assets/upload/"), "upload");
  assert.equal(parent("assets/upload/x.png"), "assets/upload");
  assert.equal(parent("assets"), "");
  assert.equal(join("modules/m/", "/assets", "", "x.png"), "modules/m/assets/x.png");
});

test("crumbs", () => {
  assert.deepEqual(crumbs("modules/my%20mod/assets", "Data"), [
    {name: "Data", path: ""}, {name: "modules", path: "modules"},
    {name: "my mod", path: "modules/my%20mod"}, {name: "assets", path: "modules/my%20mod/assets"}
  ]);
  assert.deepEqual(crumbs("", "Data"), [{name: "Data", path: ""}]);
});

test("extensionOf and fileKind", () => {
  assert.equal(extensionOf("a/b/Map.PNG"), "png");
  assert.equal(fileKind("a/map.webp", KINDS), "image");
  assert.equal(fileKind("a/intro.MP4", KINDS), "video");
  assert.equal(fileKind("a/rain.ogg", KINDS), "audio");
  assert.equal(fileKind("a/notes.txt", KINDS), "other");
});

test("uniqueName and planCopy never reuse a name", () => {
  assert.equal(uniqueName("map.png", new Set(["map.png", "map-1.png"])), "map-2.png");
  assert.deepEqual(planCopy(["a/map.png", "b/map.png", "c/token.webp"], "modules/m/assets", ["token.webp"]), [
    {from: "a/map.png", name: "map.png", to: "modules/m/assets/map.png", wanted: "map.png"},
    {from: "b/map.png", name: "map-1.png", to: "modules/m/assets/map-1.png", wanted: "map.png"},
    {from: "c/token.webp", name: "token-1.webp", to: "modules/m/assets/token-1.webp", wanted: "token.webp"}
  ]);
});

test("select: click, ctrl toggle, shift range", () => {
  const order = ["a", "b", "c", "d"];
  let s = select(order, new Set(), null, "b");
  assert.deepEqual([...s.selected], ["b"]);
  s = select(order, s.selected, s.anchor, "d", {shift: true});
  assert.deepEqual([...s.selected], ["b", "c", "d"]);
  s = select(order, s.selected, s.anchor, "c", {ctrl: true});
  assert.deepEqual([...s.selected], ["b", "d"]);
  s = select(order, s.selected, s.anchor, "a", {shift: true, ctrl: true});
  assert.deepEqual([...s.selected].sort(), ["a", "b", "c", "d"]);
});

test("cleanFolderName", () => {
  assert.equal(cleanFolderName("  maps/old "), "maps-old");
  assert.equal(cleanFolderName(".."), "");
  assert.equal(cleanFolderName("Höhle"), "Höhle");
});

test("copyNames: keep the extension, number several, refuse nonsense", () => {
  const uuid = "c0ecc5df-05b2-4216-bbb2-de165eb1848e.jpg";
  assert.deepEqual(copyNames("goblin-chief", [uuid]), ["goblin-chief.jpg"]);
  assert.deepEqual(copyNames("goblin-chief.png", [uuid]), ["goblin-chief.png"]);
  assert.deepEqual(copyNames("cave-{n}", ["a.webp", "b.webp"]), ["cave-1.webp", "cave-2.webp"]);
  assert.deepEqual(copyNames("cave", ["a.webp", "b.png"]), ["cave-1.webp", "cave-2.png"]);
  assert.deepEqual(copyNames("maps/old", ["a.webp"]), ["maps-old.webp"]);
  assert.deepEqual(copyNames("  ", ["a.webp"]), ["a.webp"]);
  assert.deepEqual(copyNames("..", ["a.webp"]), ["a.webp"]);
});

test("planCopy with wanted names reports a taken name", () => {
  const plan = planCopy(["assets/upload/x.jpg"], "assets/upload", ["x.jpg", "chief.jpg"], ["chief.jpg"]);
  assert.deepEqual(plan, [{from: "assets/upload/x.jpg", name: "chief-1.jpg", to: "assets/upload/chief-1.jpg", wanted: "chief.jpg"}]);
});
