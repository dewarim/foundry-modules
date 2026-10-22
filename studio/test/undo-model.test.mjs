import {test} from "node:test";
import assert from "node:assert/strict";
import {planUndo, previousValues} from "../scripts/undo-model.mjs";

test("previousValues: dotted paths, missing fields, arrays whole", () => {
  const source = {_id: "a", name: "Goblin", system: {quantity: 2, members: [{actor: "x"}]}, flags: {}};
  assert.deepEqual(previousValues(source, {system: {quantity: 3}}), {"system.quantity": 2});
  assert.deepEqual(previousValues(source, {"system.members": [{actor: "x"}, {actor: "y"}]}), {"system.members": [{actor: "x"}]});
  assert.deepEqual(previousValues(source, {flags: {"dewarim-studio": {project: "p"}}, _id: "a", _stats: {modifiedTime: 1}}),
    {"flags.dewarim-studio.project": undefined});
  // the previous value is a copy
  const before = previousValues(source, {"system.members": []});
  before["system.members"].push(1);
  assert.equal(source.system.members.length, 1);
});

test("planUndo: reverts newest first, earliest value per field", () => {
  const log = [
    {kind: "update", uuid: "Actor.a.Item.i", before: {"system.quantity": 1}},
    {kind: "update", uuid: "Actor.b", before: {"system.members": []}},
    {kind: "update", uuid: "Actor.a.Item.i", before: {"system.quantity": 2, name: "Gold"}}
  ];
  assert.deepEqual(planUndo(log), {
    recreates: [],
    reverts: [{uuid: "Actor.a.Item.i", data: {"system.quantity": 1, name: "Gold"}}, {uuid: "Actor.b", data: {"system.members": []}}],
    deletes: []
  });
});

test("planUndo: created documents are deleted, their insides and updates skipped", () => {
  const log = [
    {kind: "create", uuid: "Actor.chest"},
    {kind: "create", uuid: "Actor.chest.Item.gold"},
    {kind: "update", uuid: "Actor.chest", before: {folder: null}},
    {kind: "create", uuid: "Scene.s.Token.t"},
    {kind: "update", uuid: "Scene.s", before: {"flags.dewarim-studio.project": undefined}}
  ];
  assert.deepEqual(planUndo(log), {
    recreates: [],
    reverts: [{uuid: "Scene.s", data: {"flags.dewarim-studio.project": undefined}}],
    deletes: ["Scene.s.Token.t", "Actor.chest"]
  });
  assert.deepEqual(planUndo([]), {recreates: [], reverts: [], deletes: []});
});

test("planUndo: deleted documents come back - not those the action made, not those inside another", () => {
  const goblin = {_id: "g", name: "Goblin", items: [{_id: "dagger"}]};
  const log = [
    {kind: "update", uuid: "Actor.g", before: {name: "Gob"}},
    {kind: "delete", uuid: "Actor.g", type: "Actor", parentUuid: null, pack: null, data: goblin},
    {kind: "delete", uuid: "Actor.g.Item.dagger", type: "Item", parentUuid: "Actor.g", pack: null, data: {_id: "dagger"}},
    {kind: "create", uuid: "Item.tmp"},
    {kind: "delete", uuid: "Item.tmp", type: "Item", parentUuid: null, pack: null, data: {_id: "tmp"}},
    {kind: "delete", uuid: "Scene.s.Tile.t", type: "Tile", parentUuid: "Scene.s", pack: null, data: {_id: "t"}}
  ];
  const plan = planUndo(log);
  assert.deepEqual(plan.recreates.map(r => r.uuid), ["Actor.g", "Scene.s.Tile.t"]);
  assert.equal(plan.recreates[0].data, goblin);
  assert.deepEqual(plan.recreates[1], {uuid: "Scene.s.Tile.t", type: "Tile", parentUuid: "Scene.s", pack: null, data: {_id: "t"}});
  // the update before the deletion is reverted on the recreated actor
  assert.deepEqual(plan.reverts, [{uuid: "Actor.g", data: {name: "Gob"}}]);
  assert.deepEqual(plan.deletes, ["Item.tmp"]);
});
