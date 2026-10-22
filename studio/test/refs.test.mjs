import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyPacks, findReferences} from "../scripts/refs.mjs";

const A = "a".repeat(16);
const B = "b".repeat(16);
const C = "c".repeat(16);

test("scene: id-only fields and UUIDs in notes text", () => {
  const scene = {
    journal: A, playlist: null,
    tokens: [{actorId: B}, {actorId: null}],
    notes: [{entryId: C, text: ""}],
    regions: [{behaviors: [{system: {destination: `Scene.${A}.Region.${B}`}}]}]
  };
  const {world} = findReferences("Scene", scene);
  assert.deepEqual(world.sort(), [`Actor.${B}`, `JournalEntry.${A}`, `JournalEntry.${C}`, `Scene.${A}`].sort());
});

test("journal HTML: @UUID links, world and compendium", () => {
  const journal = {pages: [{text: {content:
    `<p>Find @UUID[Item.${A}]{the key} and @UUID[Compendium.dnd5e.monsters.Actor.${B}]{a goblin}`
    + ` and @UUID[Compendium.acme-adventures.spells.Item.${C}]</p>`}}]};
  const {world, packs} = findReferences("JournalEntry", journal);
  assert.deepEqual(world, [`Item.${A}`]);
  assert.deepEqual(packs.sort(), ["acme-adventures.spells", "dnd5e.monsters"]);
});

test("provenance is not a dependency", () => {
  const actor = {
    _stats: {compendiumSource: `Compendium.dnd5e.monsters.Actor.${A}`},
    flags: {core: {sourceId: `Compendium.dnd5e.monsters.Actor.${A}`}},
    items: [{_stats: {compendiumSource: `Compendium.dnd5e.items.Item.${B}`}, system: {}}]
  };
  assert.deepEqual(findReferences("Actor", actor), {world: [], packs: []});
});

test("the token a character last moved is not a dependency", () => {
  const actor = {flags: {dnd5e: {lastMovedToken: `Scene.${A}.Token.${B}`}}};
  assert.deepEqual(findReferences("Actor", actor), {world: [], packs: []});
});

test("embedded uuids inside a compendium uuid are not counted twice", () => {
  const {world, packs} = findReferences("Item", {system: {link: `Compendium.x.y.Actor.${A}`}});
  assert.deepEqual(world, []);
  assert.deepEqual(packs, ["x.y"]);
});

test("classifyPacks", () => {
  const r = classifyPacks(["dnd5e.monsters", "mine.adventure", "acme-adventures.spells",
    "acme-adventures.classes"], {moduleId: "mine", systemId: "dnd5e"});
  assert.deepEqual(r.system, ["dnd5e.monsters"]);
  assert.deepEqual(r.own, ["mine.adventure"]);
  assert.deepEqual([...r.modules], [["acme-adventures", ["acme-adventures.classes", "acme-adventures.spells"]]]);
});

test("findReferences: actors and items of encounter drafts on a scene", () => {
  const refs = findReferences("Scene", {flags: {"dewarim-studio": {encounters: [{
    mobs: [{uuid: "Actor.aaaaaaaaaaaaaaaa"}], loot: [{uuid: "Compendium.dnd5e.items.Item.bbbbbbbbbbbbbbbb"}]
  }]}}});
  assert.deepEqual(refs.world, ["Actor.aaaaaaaaaaaaaaaa"]);
  assert.deepEqual(refs.packs, ["dnd5e.items"]);
});
