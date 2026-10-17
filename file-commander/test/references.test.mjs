import {test} from "node:test";
import assert from "node:assert/strict";
import {countUses, pathVariants, planUpdate, replaceInString} from "../scripts/references.mjs";

test("pathVariants", () => {
  assert.deepEqual(pathVariants("assets/a%20b.png"), ["assets/a%20b.png", "assets/a b.png"]);
  assert.deepEqual(pathVariants("assets/a b.png"), ["assets/a b.png", "assets/a%20b.png"]);
  assert.deepEqual(pathVariants("assets/x.png"), ["assets/x.png"]);
});

test("replaceInString: whole value, HTML, forms kept", () => {
  assert.equal(replaceInString("assets/x.png", "assets/x.png", "art/y.png"), "art/y.png");
  assert.equal(replaceInString("assets/x.png.bak", "assets/x.png", "art/y.png"), null);
  assert.equal(replaceInString("other/assets/x.png", "assets/x.png", "art/y.png"), null);
  assert.equal(replaceInString('<p><img src="assets/x.png"> and <a href="assets/x.png#top">x</a></p>', "assets/x.png", "art/y.png"),
    '<p><img src="art/y.png"> and <a href="art/y.png#top">x</a></p>');
  assert.equal(replaceInString('<div style="background: url(assets/x.png)">', "assets/x.png", "art/y.png"),
    '<div style="background: url(art/y.png)">');
  // finding uses: the path replaced by itself still counts
  assert.equal(replaceInString('<img src="assets/x.png">', "assets/x.png", "assets/x.png"), '<img src="assets/x.png">');
  // text mentioning the path outside an attribute stays
  assert.equal(replaceInString("<p>see assets/x.png</p>", "assets/x.png", "art/y.png"), null);
  // encoded and decoded forms
  assert.equal(replaceInString("assets/a b.png", "assets/a%20b.png", "art/c%20d.png"), "art/c d.png");
  assert.equal(replaceInString('<img src="assets/a%20b.png">', "assets/a b.png", "art/c d.png"), '<img src="art/c%20d.png">');
});

const SCENE = {
  Token: {documentName: "Token", embedded: {delta: {documentName: "ActorDelta", single: true, embedded: {items: {documentName: "Item", embedded: {}}}}}},
  Tile: {documentName: "Tile"},
  Level: {documentName: "Level"}
};
const embedded = {tokens: SCENE.Token, tiles: SCENE.Tile, levels: SCENE.Level};

test("planUpdate: fields, embedded collections, a token's delta", () => {
  const scene = {
    _id: "s1", name: "Cave", thumb: "worlds/w/thumb.webp",
    _stats: {compendiumSource: null, note: "assets/x.png"},
    levels: [{_id: "l1", name: "Ground", background: {src: "assets/x.png"}, foreground: {src: null}}],
    tiles: [{_id: "t1", texture: {src: "assets/other.png"}}, {_id: "t2", texture: {src: "assets/x.png"}}],
    tokens: [{_id: "k1", name: "Goblin", texture: {src: "tokens/g.png"},
      delta: {img: "assets/x.png", items: [{_id: "i1", name: "Torch", img: "assets/x.png"}]}}],
    flags: {mod: {gallery: ["a.png", "assets/x.png"]}}
  };
  const plan = planUpdate(scene, "assets/x.png", "art/y.png", embedded);
  assert.deepEqual(plan.update, {"flags.mod.gallery": ["a.png", "art/y.png"]});
  assert.deepEqual(plan.children.levels, {documentName: "Level", entries: [{_id: "l1", plan: {update: {"background.src": "art/y.png"}, children: {}, fields: ["background.src"]}}]});
  assert.deepEqual(plan.children.tiles.entries.map(e => e._id), ["t2"]);
  const token = plan.children.tokens.entries[0].plan;
  assert.deepEqual(token.update, {"delta.img": "art/y.png"});
  assert.deepEqual(token.children["delta.items"].entries[0], {_id: "i1", plan: {update: {img: "art/y.png"}, children: {}, fields: ["img"]}});
  assert.deepEqual(plan.fields, [
    "levels[Ground].background.src", "tiles[t2].texture.src", "tokens[Goblin].delta.img",
    "tokens[Goblin].delta.items[Torch].img", "flags.mod.gallery.1"
  ]);
  assert.equal(countUses(plan), 5);
  assert.equal(planUpdate(scene, "assets/none.png", "art/y.png", embedded), null);
});

test("planUpdate: HTML in an actor's biography", () => {
  const actor = {_id: "a", img: "assets/x.png", system: {details: {biography: {value: '<img src="assets/x.png">'}}}};
  assert.deepEqual(planUpdate(actor, "assets/x.png", "art/y.png").update, {
    img: "art/y.png", "system.details.biography.value": '<img src="art/y.png">'
  });
});
