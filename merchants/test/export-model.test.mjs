import {test} from "node:test";
import assert from "node:assert/strict";
import {clearMerchantState, configReferences} from "../scripts/export-model.mjs";

test("a merchant's configuration names its sources and custom stock", () => {
  const cfg = {
    sources: ["dnd5e.equipment24", "Folder.abcdefghijklmnop", "Item.0123456789abcdef"],
    fixed: [{uuid: "Item.fedcba9876543210"}, {uuid: "Compendium.my-module.loot.Item.0123456789abcdef"}]
  };
  const refs = configReferences(cfg, id => id === "dnd5e.equipment24");
  assert.deepEqual(refs.folders, ["Folder.abcdefghijklmnop"]);
  assert.deepEqual(refs.uuids.sort(), ["Compendium.my-module.loot.Item.0123456789abcdef", "Item.0123456789abcdef", "Item.fedcba9876543210"]);
  assert.deepEqual(refs.packs.sort(), ["dnd5e.equipment24", "my-module.loot"]);
});

test("exported merchant tokens lose their restock state, nothing else", () => {
  const data = {tokens: [
    {name: "Smith", flags: {"dewarim-merchants": {state: {last: {real: 1}}}}, delta: {items: [{name: "Sword"}]}},
    {name: "Other", flags: {"dewarim-merchants": {state: {}, note: 1}}},
    {name: "Goblin", flags: {}}
  ]};
  clearMerchantState(data, "dewarim-merchants");
  assert.deepEqual(data.tokens[0].flags, {});
  assert.deepEqual(data.tokens[0].delta.items, [{name: "Sword"}]);
  assert.deepEqual(data.tokens[1].flags, {"dewarim-merchants": {note: 1}});
  assert.deepEqual(data.tokens[2].flags, {});
});
