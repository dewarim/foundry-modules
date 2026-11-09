import {test} from "node:test";
import assert from "node:assert/strict";
import {restoredState, statePersisted, storedState} from "../scripts/source-state.mjs";

const SUBTYPES = {Actor: ["npc", "character", "group"], Item: ["weapon", "spell"]};
const subtypesOf = type => SUBTYPES[type] ?? [];
// Stands in for sources.mjs: "project" needs a project, a pack must exist and hold the type
const validScope = (type, scope) => {
  if ( ["all", "everywhere", "project"].includes(scope) ) return scope;
  if ( scope === `pack:${type.toLowerCase()}s` ) return scope;
  return "everywhere";
};
const restore = saved => restoredState({types: ["Actor", "Item"], saved, validScope, subtypesOf});

test("storedState keeps the picks and drops the typing", () => {
  assert.deepEqual(storedState({type: "Item", scope: "all", subtype: "spell", filter: "level>=9"}),
    {type: "Item", scope: "all", subtype: "spell"});
  assert.deepEqual(storedState({type: "Actor", scope: "project"}), {type: "Actor", scope: "project", subtype: ""});
});

test("statePersisted says which changes are worth storing", () => {
  assert.ok(statePersisted({type: "Item"}));
  assert.ok(statePersisted({scope: "all"}));
  assert.ok(statePersisted({subtype: ""}));
  assert.ok(!statePersisted({filter: "gob"}));
  assert.ok(!statePersisted({}));
});

test("restoredState takes back what still exists", () => {
  assert.deepEqual(restore({type: "Item", scope: "pack:items", subtype: "spell"}),
    {type: "Item", scope: "pack:items", subtype: "spell", filter: ""});
});

test("restoredState starts with an empty filter, whatever was stored", () => {
  assert.equal(restore({type: "Actor", scope: "all", subtype: "npc", filter: "cr<=2"}).filter, "");
});

test("restoredState falls back to the panel's first type", () => {
  // The panel was narrowed to one type since, or the stored name is nonsense
  assert.equal(restoredState({types: ["Actor"], saved: {type: "Item", scope: "all"}, validScope, subtypesOf}).type, "Actor");
  assert.equal(restore({type: "Journal", scope: "all"}).type, "Actor");
});

test("restoredState drops a subtype the type does not have", () => {
  // "spell" belongs to Item: a stored pair that no longer fits must not filter everything away
  assert.equal(restore({type: "Actor", scope: "all", subtype: "spell"}).subtype, "");
  assert.equal(restore({type: "Item", scope: "all", subtype: "potion"}).subtype, "");
});

test("restoredState asks the world about the scope", () => {
  // A compendium that is gone, and one that holds the other type
  assert.equal(restore({type: "Actor", scope: "pack:gone"}).scope, "everywhere");
  assert.equal(restore({type: "Actor", scope: "pack:items"}).scope, "everywhere");
  assert.equal(restore({type: "Item", scope: "pack:items"}).scope, "pack:items");
});

test("restoredState works with nothing stored", () => {
  assert.deepEqual(restore(undefined), {type: "Actor", scope: "everywhere", subtype: "", filter: ""});
  assert.deepEqual(restore({}), {type: "Actor", scope: "everywhere", subtype: "", filter: ""});
});
