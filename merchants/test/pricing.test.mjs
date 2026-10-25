import {test} from "node:test";
import assert from "node:assert/strict";
import {priceFactor, purchasePrice, rulePercent, salePrice} from "../scripts/pricing.mjs";
import {merchantConfig} from "../scripts/config-model.mjs";

const world = [
  {dimension: "race", merchant: "dwarf", buyer: "elf", percent: 50},
  {dimension: "race", merchant: "*", buyer: "orc", percent: 20},
  {dimension: "profession", merchant: "*", buyer: "warlock", percent: 100},
  {dimension: "profession", merchant: "priest", buyer: "*", percent: -10}
];

test("no rule means no markup", () => {
  assert.equal(rulePercent("race", "dwarf", "human", [], world), 0);
  assert.equal(rulePercent("race", "", "", [], []), 0);
  assert.deepEqual(priceFactor(merchantConfig({race: "human"}), {race: "human", profession: "fighter"}, world),
    {factor: 1, race: 0, profession: 0});
});

test("the most specific rule wins", () => {
  // world: for this merchant's race, then for any merchant
  assert.equal(rulePercent("race", "dwarf", "elf", [], world), 50);
  assert.equal(rulePercent("race", "dwarf", "orc", [], world), 20);
  assert.equal(rulePercent("race", "gnome", "elf", [], world), 0);
  // a merchant's own rule beats the world's
  const own = [{dimension: "race", merchant: "*", buyer: "elf", percent: 10}];
  assert.equal(rulePercent("race", "dwarf", "elf", own, world), 10);
  // the exact buyer beats "*" at the same level; a "*" own rule beats any world rule
  assert.equal(rulePercent("profession", "priest", "warlock", [], world), -10);
  assert.equal(rulePercent("profession", "priest", "warlock", [{dimension: "profession", buyer: "*", percent: 5}], world), 5);
  // keys compare without case
  assert.equal(rulePercent("race", "Dwarf", "ELF", [], world), 50);
});

test("race and profession multiply", () => {
  const merchant = merchantConfig({race: "dwarf", profession: "smith"});
  assert.deepEqual(priceFactor(merchant, {race: "elf", profession: "warlock"}, world), {factor: 3, race: 50, profession: 100});
  // a factor never goes below zero
  const free = [{dimension: "race", merchant: "*", buyer: "elf", percent: -150}];
  assert.equal(priceFactor(merchant, {race: "elf"}, free).factor, 0);
});

test("sale price: value, global markup, factor; rounded, at least 1", () => {
  const cheap = merchantConfig({markup: -20});
  assert.equal(salePrice(1000, cheap, 3), 2400);
  assert.equal(salePrice(1000, merchantConfig({}), 1), 1000);
  assert.equal(salePrice(1, cheap, 0.1), 1);
  assert.equal(salePrice(0, cheap, 1), 0);
  // a custom price replaces the value; exact ignores markup and rules
  assert.equal(salePrice(1000, cheap, 2, {price: 500}), 1000);
  assert.equal(salePrice(1000, cheap, 2, {price: 500, exact: true}), 500);
});

test("purchase price: value less discount, divided by the factor, never above the sale price", () => {
  const merchant = merchantConfig({buyDiscount: 50});
  assert.equal(purchasePrice(1000, merchant, 1), 500);
  assert.equal(purchasePrice(1000, merchant, 2), 250);
  // a merchant who likes the buyer pays more - but not more than he asks
  const generous = merchantConfig({buyDiscount: 0, markup: -20});
  assert.equal(purchasePrice(1000, generous, 0.5), 400);
  assert.equal(purchasePrice(0, merchant, 1), 0);
  assert.equal(purchasePrice(1000, merchant, 0), 0);
});
