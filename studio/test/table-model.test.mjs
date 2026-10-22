import {test} from "node:test";
import assert from "node:assert/strict";
import {coerce, collectUpdates, formatValue, mergeUpdate, normalizeChoices, setEdit} from "../scripts/table-model.mjs";

test("normalizeChoices accepts the usual shapes", () => {
  assert.deepEqual(normalizeChoices({sm: "Small", med: {label: "Medium"}}),
    [{value: "sm", label: "Small"}, {value: "med", label: "Medium"}]);
  assert.deepEqual(normalizeChoices(["a"]), [{value: "a", label: "a"}]);
  assert.deepEqual(normalizeChoices([{value: 1, label: "One"}]), [{value: "1", label: "One"}]);
  assert.deepEqual(normalizeChoices(undefined), []);
});

test("coerce number", () => {
  assert.deepEqual(coerce("number", "12"), {value: 12});
  assert.deepEqual(coerce("number", "0,5"), {value: 0.5});
  assert.deepEqual(coerce("number", "", {nullable: true}), {value: null});
  assert.ok(coerce("number", "").error);
  assert.ok(coerce("number", "abc").error);
  assert.deepEqual(coerce("number", "1/4"), {value: 0.25});
  assert.deepEqual(coerce("number", "1 / 8"), {value: 0.125});
  assert.ok(coerce("number", "1/0").error);
});

test("coerce select and set against choices", () => {
  const choices = normalizeChoices({rare: "Rare", common: "Common"});
  assert.deepEqual(coerce("select", "rare", {choices}), {value: "rare"});
  assert.ok(coerce("select", "epic", {choices}).error);
  assert.deepEqual(coerce("set", "rare, common, rare", {choices}), {value: ["rare", "common"]});
  assert.ok(coerce("set", "rare, epic", {choices}).error);
  assert.deepEqual(coerce("set", ""), {value: []});
});

test("coerce text, formula, boolean", () => {
  assert.deepEqual(coerce("text", "  Goblin "), {value: "Goblin"});
  assert.deepEqual(coerce("formula", "30 + @bonus"), {value: "30 + @bonus"});
  assert.deepEqual(coerce("boolean", true), {value: true});
});

test("formatValue", () => {
  assert.equal(formatValue("number", null), "");
  assert.equal(formatValue("number", 0), "0");
  assert.equal(formatValue("set", new Set(["a", "b"])), "a, b");
  assert.equal(formatValue("boolean", undefined), false);
});

test("setEdit records changes and forgets reverts; collectUpdates batches per document", () => {
  const dirty = new Map();
  setEdit(dirty, "a", "system.hp", 10, 7);
  setEdit(dirty, "a", "name", "Orc", "Goblin");
  setEdit(dirty, "b", "system.hp", 3, 3);
  assert.deepEqual(collectUpdates(dirty), [{_id: "a", "system.hp": 10, name: "Orc"}]);
  setEdit(dirty, "a", "name", "Goblin", "Goblin");
  setEdit(dirty, "a", "system.hp", 7, 7);
  assert.equal(dirty.size, 0);
  setEdit(dirty, "c", "system.rarities", ["b", "a"], new Set(["a", "b"]));
  assert.equal(dirty.size, 0);
});

test("coerce: numeric selects", () => {
  const choices = [{value: "0"}, {value: "2"}];
  assert.deepEqual(coerce("select", "2", {choices, numeric: true}), {value: 2});
  assert.deepEqual(coerce("select", "", {choices, numeric: true, nullable: true}), {value: null});
  assert.match(coerce("select", "5", {choices, numeric: true}).error, /not a choice/);
});

test("collectUpdates: writers, merged by embedded _id", () => {
  const dirty = new Map([["s1", new Map([["name", "Cave"], ["bg", "a.webp"], ["fg", "b.webp"]])]]);
  const writers = {
    bg: (value, id) => ({levels: [{_id: `${id}-l`, background: {src: value}}]}),
    fg: (value, id) => ({levels: [{_id: `${id}-l`, foreground: {src: value}}]})
  };
  assert.deepEqual(collectUpdates(dirty, writers), [{_id: "s1", name: "Cave",
    levels: [{_id: "s1-l", background: {src: "a.webp"}, foreground: {src: "b.webp"}}]}]);
  assert.deepEqual(mergeUpdate({a: {b: 1}, l: [{_id: "x", v: 1}]}, {a: {c: 2}, l: [{_id: "y"}]}),
    {a: {b: 1, c: 2}, l: [{_id: "x", v: 1}, {_id: "y"}]});
});
