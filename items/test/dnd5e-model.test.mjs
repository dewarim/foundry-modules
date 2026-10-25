import {test} from "node:test";
import assert from "node:assert/strict";
import {
  applyPlan, formulasOf, parseThresholds, partFormula, rarityForPrice, scalePart, scalePrice
} from "../scripts/systems/dnd5e-model.mjs";
import {repairTemplate, variantPlan} from "../scripts/variant-model.mjs";

const part = (number, denomination, bonus = "") => ({number, denomination, bonus, types: ["healing"], custom: {enabled: false, formula: ""}});
const COINS = {cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000};

test("heal dice follow the strength: the dice count scaled, the bonus making up the rest", () => {
  const f = (factor, p = part(2, 4, "2")) => partFormula(scalePart(p, factor).part);
  assert.equal(f(1.5), "3d4 + 3");
  assert.equal(f(2), "4d4 + 4");
  assert.equal(f(1.75), "4d4 + 2");
  assert.equal(f(1.1), "2d4 + 3");
  assert.equal(f(0.8), "2d4 + 1");
  assert.equal(f(1, part(2, 4, "2")), "2d4 + 2");
  assert.equal(f(1.5, part(1, 8)), "2d8 - 2");
  assert.ok(Math.abs(scalePart(part(2, 4, "2"), 1.1).ratio - 8 / 7) < 1e-9);
  assert.equal(f(0.5), "1d4 + 1");
});

test("a strength the dice cannot follow is multiplied whole, at least 1 when weakened", () => {
  const failed = scalePart(part(2, 4, "2"), 0.1);
  assert.equal(partFormula(failed.part), "max(1, floor((2d4 + 2) * 0.1))");
  assert.equal(failed.part.custom.enabled, true);
  assert.equal(failed.ratio, 0.1);
  // A dice count of 1 cannot shrink: 1d4 at 30 % is no 1d4
  assert.equal(partFormula(scalePart(part(1, 4), 0.3).part), "max(1, floor((1d4) * 0.3))");
});

test("custom formulas are multiplied whole; a formula bonus keeps, the dice follow", () => {
  const custom = {...part(0, 0), custom: {enabled: true, formula: "10"}};
  assert.equal(partFormula(scalePart(custom, 1.5).part), "floor((10) * 1.5)");
  const mod = scalePart(part(2, 6, "@mod"), 2);
  assert.equal(partFormula(mod.part), "4d6 + @mod");
  assert.equal(mod.ratio, null);
});

test("prices in sensible coins", () => {
  assert.deepEqual(scalePrice({value: 50, denomination: "gp"}, 1.1, COINS), {value: 55, denomination: "gp"});
  assert.deepEqual(scalePrice({value: 50, denomination: "gp"}, 1.2, COINS), {value: 60, denomination: "gp"});
  assert.deepEqual(scalePrice({value: 2, denomination: "gp"}, 1.5, COINS), {value: 3, denomination: "gp"});
  assert.deepEqual(scalePrice({value: 2, denomination: "gp"}, 1.25, COINS), {value: 25, denomination: "sp"});
  assert.deepEqual(scalePrice({value: 5, denomination: "sp"}, 0.5, COINS), {value: 3, denomination: "sp"});
  assert.deepEqual(scalePrice({value: 1, denomination: "cp"}, 0.1, COINS), {value: 1, denomination: "cp"});
});

test("rarity by price", () => {
  assert.equal(rarityForPrice(50), "common");
  assert.equal(rarityForPrice(150), "uncommon");
  assert.equal(rarityForPrice(90000), "legendary");
  assert.deepEqual(parseThresholds("10, 20, 30, 40"), {common: 10, uncommon: 20, rare: 30, veryRare: 40});
  assert.deepEqual(parseThresholds("nonsense"), {common: 100, uncommon: 500, rare: 5000, veryRare: 50000});
});

const potion = () => ({
  name: "Potion of Healing",
  type: "consumable",
  img: "potion.webp",
  system: {
    price: {value: 50, denomination: "gp"}, rarity: "common", weight: {value: 0.5, units: "lb"}, properties: ["mgc"],
    description: {value: "<p>Heals.</p>"}, identifier: "potion-of-healing",
    activities: {a1: {_id: "a1", type: "heal", healing: part(2, 4, "2"), effects: []}}
  },
  effects: [],
  flags: {}
});

const ctx = {
  coins: COINS,
  randomId: () => "eff1",
  slugify: s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  condition: id => ({name: id === "poisoned" ? "Poisoned" : id, img: `${id}.svg`}),
  riderText: r => `DC ${r.dc} ${r.ability} save or ${r.condition}`,
  potencyText: p => `Potency ${p}`
};

test("the powerful draught: stronger heal, rider on the drinking activity, cheaper for the drawback, rarity by price", () => {
  const t = repairTemplate({
    pattern: "Wild {base}",
    variance: {mode: "range", min: 100, max: 100},
    aspects: [{kind: "potency", applies: "heal"}, {kind: "price", follow: true},
      {kind: "rider", ability: "con", dc: 13, condition: "poisoned", percent: -20}, {kind: "rarity", value: "auto"}]
  });
  const plan = variantPlan(t, {key: "range:0", factor: 2}, "Potion of Healing");
  const {data, potent, ratio} = applyPlan(potion(), plan, ctx);
  assert.equal(potent, true);
  assert.equal(ratio, 2);
  assert.equal(data.name, "Wild Potion of Healing");
  assert.equal(data.system.identifier, "potion-of-healing", "variants keep the base's identifier");
  assert.deepEqual(formulasOf(data.system), ["4d4 + 4"]);
  assert.deepEqual(data.system.price, {value: 80, denomination: "gp"});
  assert.deepEqual(data.system.rarities, ["common"]);
  assert.equal(data.system.rarity, undefined);
  assert.equal(data.effects.length, 1);
  assert.deepEqual(data.effects[0].statuses, ["poisoned"]);
  assert.equal(data.effects[0].transfer, false);
  assert.deepEqual(data.effects[0].duration, {value: 3600, units: "seconds", expiry: "turnStart"});
  assert.deepEqual(data.system.activities.a1.effects, [{_id: "eff1"}]);
  assert.equal(data.flags["dewarim-items"].riders[0].effect, "eff1");
  assert.equal(data.flags["dewarim-items"].riders[0].activity, "a1");
  assert.match(data.system.description.value, /Potency \+100%.*DC 13 con save or poisoned/);
});

test("a craft variant names the effective strength; a potency that changes nothing says so", () => {
  const craft = repairTemplate({pattern: "{base} ({percent})", aspects: [{kind: "potency"}, {kind: "price", percent: 10}]});
  const {data, potent} = applyPlan(potion(), variantPlan(craft, {key: "c", factor: 1.1}, "Potion of Healing"), ctx);
  assert.equal(potent, true);
  assert.equal(data.name, "Potion of Healing (+14%)");
  assert.deepEqual(data.system.price, {value: 55, denomination: "gp"});

  const sword = {name: "Longsword", type: "weapon", system: {price: {value: 15, denomination: "gp"},
    damage: {base: {number: 1, denomination: 8, bonus: "", types: ["slashing"], custom: {enabled: false}}}, activities: {}}};
  const result = applyPlan(sword, variantPlan(craft, {key: "c", factor: 1.1}, "Longsword"), ctx);
  assert.equal(result.potent, false);
  assert.equal(result.data.system.rarities, undefined, "a mundane item gets no rarity");
});

test("tiers and rows on a mundane item: price, weight, data paths, no rarity", () => {
  const tiers = repairTemplate({variance: {mode: "tiers", tiers: [{name: "Fine", percent: 100}]},
    aspects: [{kind: "price", follow: true}, {kind: "weight", percent: -10}, {kind: "rarity", value: "auto"},
      {kind: "set", path: "system.properties", value: "fin, lgt"}]});
  const dagger = () => ({name: "Dagger", type: "weapon", system: {price: {value: 2, denomination: "gp"}, weight: {value: 1, units: "lb"},
    properties: ["fin"], activities: {}}});
  const {data} = applyPlan(dagger(), variantPlan(tiers, {key: "tier:fine", factor: 2, tier: "Fine"}, "Dagger"), ctx);
  assert.equal(data.name, "Fine Dagger");
  assert.deepEqual(data.system.price, {value: 4, denomination: "gp"});
  assert.equal(data.system.weight.value, 0.9);
  assert.deepEqual(data.system.properties, ["fin", "lgt"]);
  assert.equal(data.system.rarities, undefined);

  const rows = repairTemplate({variance: {mode: "rows", rows: [{name: "Skinning knife", price: 1, note: "Bone handle", img: "knife.webp",
    set: {"system.weight.value": "0.5"}}]}});
  const row = applyPlan(dagger(), variantPlan(rows, {key: "row:skinning-knife", factor: 1, row: rows.variance.rows[0]}, "Dagger"), ctx).data;
  assert.equal(row.name, "Skinning knife");
  assert.deepEqual(row.system.price, {value: 1, denomination: "gp"});
  const half = repairTemplate({variance: {mode: "rows", rows: [{name: "Kitchen knife", price: 0.5}]}});
  assert.deepEqual(applyPlan(dagger(), variantPlan(half, {key: "k", factor: 1, row: half.variance.rows[0]}, "Dagger"), ctx).data.system.price,
    {value: 5, denomination: "sp"});
  assert.equal(row.system.weight.value, 0.5);
  assert.equal(row.img, "knife.webp");
  assert.match(row.system.description.value, /Bone handle/);
});
