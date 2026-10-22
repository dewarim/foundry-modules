import {test} from "node:test";
import assert from "node:assert/strict";
import {matchesQuery, parseQuery, toNumber, unknownKeys} from "../scripts/filters.mjs";

test("parseQuery splits words and conditions", () => {
  assert.deepEqual(parseQuery("Goblin cr<=1/2"), {words: ["goblin"], conditions: [{key: "cr", op: "<=", value: "1/2"}]});
  assert.deepEqual(parseQuery('"giant spider" CR>2 rarity!=common').words, ["giant spider"]);
  assert.deepEqual(parseQuery("rarity!=common").conditions, [{key: "rarity", op: "!=", value: "common"}]);
  assert.deepEqual(parseQuery("  "), {words: [], conditions: []});
  // A word that only contains an operator stays a word
  assert.deepEqual(parseQuery("=x <3").words, ["=x", "<3"]);
});

test("toNumber reads fractions and commas", () => {
  assert.equal(toNumber("1/4"), 0.25);
  assert.equal(toNumber("2,5"), 2.5);
  assert.ok(Number.isNaN(toNumber("rare")));
  assert.ok(Number.isNaN(toNumber("")));
});

test("matchesQuery", () => {
  const goblin = {cr: 0.25, rarity: undefined};
  const valueOf = entry => key => entry[key];
  assert.ok(matchesQuery(parseQuery(""), ["Goblin"]));
  assert.ok(matchesQuery(parseQuery("gob"), ["Goblin Boss"]));
  assert.ok(matchesQuery(parseQuery("gob boss"), ["Goblin Boss"]));
  assert.ok(!matchesQuery(parseQuery("gob orc"), ["Goblin Boss"]));
  assert.ok(matchesQuery(parseQuery("cr<=1/2"), ["Goblin"], valueOf(goblin)));
  assert.ok(matchesQuery(parseQuery("cr=1/4"), ["Goblin"], valueOf(goblin)));
  assert.ok(!matchesQuery(parseQuery("cr>1"), ["Goblin"], valueOf(goblin)));
  // missing value: only != holds
  assert.ok(!matchesQuery(parseQuery("level>=1"), ["Goblin"], valueOf(goblin)));
  assert.ok(matchesQuery(parseQuery("rarity!=rare"), ["Goblin"], valueOf(goblin)));
  // text values, case-insensitive; sets match on any member
  const sword = {rarity: new Set(["veryRare"])};
  assert.ok(matchesQuery(parseQuery("rarity=veryrare"), ["Sword"], valueOf(sword)));
  assert.ok(!matchesQuery(parseQuery("rarity=rare"), ["Sword"], valueOf(sword)));
  assert.ok(!matchesQuery(parseQuery("rarity!=veryRare"), ["Sword"], valueOf(sword)));
  assert.ok(!matchesQuery(parseQuery("rarity>rare"), ["Sword"], valueOf(sword)));
});

test("unknownKeys", () => {
  assert.deepEqual(unknownKeys(parseQuery("cr<1 lvl>2 lvl<4"), ["cr", "level"]), ["lvl"]);
});
