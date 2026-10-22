import {test} from "node:test";
import assert from "node:assert/strict";
import {clusterPositions, defaultPattern, draftChanged, encounterXp, expandName, freeStagingPositions, fromDraft, namesFor, parseHp, planLoot,
  stackItems, stagingPositions, toDraft, upsertDraft}
  from "../scripts/encounter-model.mjs";

test("expandName", () => {
  assert.equal(expandName("{name} {n}", {name: "Goblin", n: 3}), "Goblin 3");
  assert.equal(expandName("Guard #{n}", {name: "Goblin", n: 1}), "Guard #1");
  assert.equal(expandName("", {name: "Goblin", n: 1}), "Goblin");
  assert.equal(defaultPattern(1), "{name}");
  assert.equal(defaultPattern(4), "{name} {n}");
});

test("stagingPositions: bottom row, wrapping upwards", () => {
  const rect = {x: 300, y: 200, width: 400, height: 500};      // 4 cells wide at grid 100
  const one = {w: 1, h: 1};
  const pos = stagingPositions(rect, 100, [one, one, {w: 2, h: 2}, one]);
  assert.deepEqual(pos, [{x: 300, y: 600}, {x: 400, y: 600}, {x: 500, y: 500}, {x: 300, y: 400}]);
});

test("stagingPositions never leaves the scene at the top", () => {
  const pos = stagingPositions({x: 0, y: 0, width: 100, height: 100}, 100, [{w: 1, h: 1}, {w: 1, h: 1}]);
  assert.deepEqual(pos, [{x: 0, y: 0}, {x: 0, y: 0}]);
});

test("clusterPositions: square block from the snapped click", () => {
  const pos = clusterPositions({x: 1234, y: 567}, 100, Array(5).fill({w: 1, h: 1}));
  assert.deepEqual(pos, [{x: 1200, y: 500}, {x: 1300, y: 500}, {x: 1400, y: 500}, {x: 1200, y: 600}, {x: 1300, y: 600}]);
});

test("planLoot: each, first, chest, stale rows go to the chest", () => {
  const mobs = [{count: 3}, {count: 1}];
  const loot = [{target: "each:0"}, {target: "first:1"}, {target: "chest"}, {target: "first:7"}, {target: "first:0"}];
  assert.deepEqual(planLoot(mobs, loot), {tokens: [[0, 4], [0], [0], [1]], chest: [2, 3]});
});

test("planLoot with an empty mob row", () => {
  assert.deepEqual(planLoot([{count: 0}], [{target: "each:0"}]), {tokens: [], chest: [0]});
});

test("parseHp", () => {
  assert.deepEqual(parseHp(""), {mode: "default"});
  assert.deepEqual(parseHp("Roll"), {mode: "roll"});
  assert.deepEqual(parseHp("12"), {mode: "fixed", value: 12});
  assert.ok(parseHp("-3").error);
  assert.ok(parseHp("2d6").error);
});

test("namesFor: list first, pattern for the rest", () => {
  assert.deepEqual(namesFor("Grimtooth, Snaga", 3, "Goblin"), ["Grimtooth", "Snaga", "Goblin 3"]);
  assert.deepEqual(namesFor("Grimtooth, Snaga, Uglúk", 2, "Goblin"), ["Grimtooth", "Snaga"]);
  assert.deepEqual(namesFor("{name} the Bold {n}", 2, "Orc"), ["Orc the Bold 1", "Orc the Bold 2"]);
  assert.deepEqual(namesFor("Grimtooth", 1, "Goblin"), ["Grimtooth"]);
});

test("freeStagingPositions skips taken cells and wraps upwards", () => {
  const rect = {x: 0, y: 0, width: 300, height: 300};
  const occupied = [{x: 0, y: 200, w: 1, h: 1}, {x: 150, y: 250, w: 1, h: 1}];   // second one off-grid
  const pos = freeStagingPositions(rect, 100, occupied, [{w: 1, h: 1}, {w: 1, h: 1}, {w: 2, h: 2}]);
  assert.deepEqual(pos, [{x: 200, y: 200}, {x: 0, y: 100}, {x: 100, y: 0}]);
});

test("freeStagingPositions on a full scene falls back to the corner", () => {
  const rect = {x: 0, y: 0, width: 100, height: 100};
  assert.deepEqual(freeStagingPositions(rect, 100, [{x: 0, y: 0, w: 1, h: 1}], [{w: 1, h: 1}]), [{x: 0, y: 0}]);
});

const STATE = {
  name: " Ambush ", placement: "click", chestName: "",
  mobs: [{uuid: "Actor.aaaaaaaaaaaaaaaa", name: "Goblin", img: "g.webp", count: 3, kind: "group", pattern: "{name} {n}",
    hp: "roll", hidden: true, disposition: -1, extra: "dropped"}],
  loot: [{uuid: "Compendium.dnd5e.items.Item.bbbbbbbbbbbbbbbb", name: "Dagger", img: "d.webp", quantity: 2, target: "each:0"}]
};

test("toDraft / fromDraft round trip", () => {
  const draft = toDraft(STATE, "d1");
  assert.equal(draft.name, "Ambush");
  assert.equal("extra" in draft.mobs[0], false);
  const back = fromDraft(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(toDraft(back, "d1"), draft);
});

test("fromDraft repairs what it cannot use", () => {
  const s = fromDraft({mobs: [{uuid: "Actor.x", count: "500", kind: "weird"}, {name: "no uuid"}],
    loot: [{uuid: "Item.y", target: "first:3", quantity: 0}, {uuid: "Item.z", target: "each:0"}], placement: "x"});
  assert.equal(s.mobs.length, 1);
  assert.deepEqual([s.mobs[0].count, s.mobs[0].kind, s.mobs[0].hidden, s.mobs[0].pattern], [100, "group", true, "{name} {n}"]);
  assert.deepEqual(s.loot.map(l => [l.target, l.quantity]), [["chest", 1], ["each:0", 1]]);
  assert.equal(s.placement, "staging");
  assert.deepEqual(fromDraft(null), {name: "", placement: "staging", chestName: "", mobs: [], loot: []});
});

test("upsertDraft and draftChanged", () => {
  const a = toDraft({...STATE, name: "B"}, "a");
  const list = upsertDraft(upsertDraft([], a), toDraft({...STATE, name: "A"}, "b"));
  assert.deepEqual(list.map(d => d.id), ["b", "a"]);
  assert.deepEqual(upsertDraft(list, {...a, name: "C"}).map(d => d.name), ["A", "C"]);
  assert.equal(draftChanged(fromDraft(a), a), false);
  assert.equal(draftChanged({...fromDraft(a), chestName: "Chest"}, a), true);
  assert.equal(draftChanged({name: "", placement: "staging", chestName: "", mobs: [], loot: []}, undefined), false);
});

test("stackItems", () => {
  const existing = [{id: "a", name: "Gold", type: "loot", quantity: 10}, {id: "b", name: "Dagger", type: "weapon", quantity: 1}];
  const incoming = [{name: "Gold", type: "loot", quantity: 5}, {name: "Dagger", type: "loot", quantity: 1},
    {name: "Rope", type: "loot", quantity: 1}, {name: "Gold", type: "loot", quantity: 1}];
  assert.deepEqual(stackItems(existing, incoming, true), {updates: [{id: "a", quantity: 16}], create: [1, 2]});
  assert.deepEqual(stackItems(existing, incoming, false), {updates: [], create: [0, 1, 2, 3]});
  assert.deepEqual(stackItems([], incoming.slice(0, 1), true), {updates: [], create: [0]});
});

test("encounterXp: counted rows, count times XP", () => {
  assert.equal(encounterXp([
    {count: 3, xp: 50, counted: true},
    {count: 1, xp: 450, counted: true},
    {count: 2, xp: 200, counted: false},     // friendly
    {count: 4, xp: null, counted: true},     // no XP known
    {count: 0, xp: 1100, counted: true}
  ]), 600);
  assert.equal(encounterXp([]), 0);
});
