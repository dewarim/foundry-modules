import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_CONFIG, craftEntry, craftRule, fixedEntry, keyChoices, merchantConfig, parseBrackets, patchConfig, priceRule} from "../scripts/config-model.mjs";

test("an empty flag gives the defaults", () => {
  assert.deepEqual(merchantConfig(undefined), {...DEFAULT_CONFIG, restock: {...DEFAULT_CONFIG.restock}});
  assert.deepEqual(merchantConfig("garbage").level, DEFAULT_CONFIG.level);
});

test("fields are repaired", () => {
  const c = merchantConfig({level: "70", race: " Dwarf ", itemTypes: ["weapon", "weapon", 3, ""], stockSize: -4,
    turnover: 300, markup: -250, buyDiscount: "x", restock: {period: "12", clock: "moon"}, purse: "",
    rules: [{dimension: "race", buyer: "Elf", percent: "50"}, {dimension: "mood", buyer: "x"}, {dimension: "race"}]});
  assert.equal(c.level, 30);
  assert.equal(c.race, "dwarf");
  assert.deepEqual(c.itemTypes, ["weapon"]);
  assert.equal(c.stockSize, 0);
  assert.equal(c.turnover, 100);
  assert.equal(c.markup, -100);
  assert.equal(c.buyDiscount, 50);
  assert.deepEqual(c.restock, {period: 12, clock: "real"});
  assert.equal(c.purse, null);
  assert.deepEqual(c.rules, [{dimension: "race", merchant: "*", buyer: "elf", percent: 50}]);
});

test("price rules and custom stock entries", () => {
  assert.equal(priceRule({dimension: "race", buyer: " "}), null);
  assert.deepEqual(priceRule({dimension: "profession", merchant: "Priest", buyer: "warlock", percent: 100}),
    {dimension: "profession", merchant: "priest", buyer: "warlock", percent: 100});
  assert.equal(fixedEntry({}), null);
  assert.deepEqual(fixedEntry({uuid: "Item.a", quantity: null}),
    {uuid: "Item.a", name: "", quantity: null, price: null, exact: false, replenish: true});
  assert.deepEqual(fixedEntry({uuid: "Item.a", quantity: "2.4", price: "15", exact: true, replenish: false}),
    {uuid: "Item.a", name: "", quantity: 2, price: 15, exact: true, replenish: false});
  // exact needs a price
  assert.equal(fixedEntry({uuid: "Item.a", exact: true}).exact, false);
});

test("patchConfig keeps the rest", () => {
  const c = patchConfig(merchantConfig({level: 3, restock: {period: 2, clock: "game"}}), {markup: 10, restock: {period: 5}});
  assert.equal(c.level, 3);
  assert.equal(c.markup, 10);
  assert.deepEqual(c.restock, {period: 5, clock: "game"});
});

test("dropdown choices keep an unknown value and mark the chosen one", () => {
  const races = [{key: "dwarf", label: "Dwarf"}, {key: "elf", label: "Elf"}];
  const any = [{key: "*", label: "anyone"}];
  assert.deepEqual(keyChoices(races, "*", any).filter(o => o.selected).map(o => o.key), ["*"]);
  assert.deepEqual(keyChoices(races, "Elf", any).filter(o => o.selected).map(o => o.key), ["elf"]);
  const homebrew = keyChoices(races, "lizardfolk", any);
  assert.equal(homebrew.length, 4);
  assert.deepEqual(homebrew.at(-1), {key: "lizardfolk", label: "lizardfolk", selected: true});
  assert.equal(keyChoices(races, "", [{key: "", label: "-"}])[0].selected, true);
});

test("price brackets from text", () => {
  assert.deepEqual(parseBrackets("10, 25 50;100"), [10, 25, 50, 100]);
  assert.deepEqual(parseBrackets("10, 5, x, 20"), [10, 20]);
  assert.deepEqual(parseBrackets([1, 2]), [1, 2]);
  assert.deepEqual(parseBrackets(""), []);
});

test("craft entries and their rule", () => {
  assert.equal(craftEntry(null), null);
  assert.deepEqual(craftEntry({}), {filter: "", min: 5, max: 20, price: 10});
  assert.deepEqual(craftEntry({filter: " subtype=potion ", min: "30", max: "-5", price: "-200"}),
    {filter: "subtype=potion", min: -5, max: 30, price: -100});
  assert.deepEqual(merchantConfig({craft: [{min: 1}, "x"]}).craft, [{filter: "", min: 1, max: 20, price: 10}]);
  const rule = craftRule({filter: "", min: 5, max: 20, price: 10});
  assert.deepEqual(rule.variance, {mode: "range", min: 5, max: 20, count: 1, step: 1});
  assert.deepEqual(rule.aspects.map(a => a.kind), ["potency", "price"]);
  assert.equal(rule.aspects[1].percent, 10);
});
