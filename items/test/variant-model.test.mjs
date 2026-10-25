import {test} from "node:test";
import assert from "node:assert/strict";
import {mulberry32} from "../scripts/rng.mjs";
import {
  factorOf, itemName, percentText, repairAspect, repairTemplate, rollFactor, rowsFromTSV, rowsToTSV, variantPlan, variants
} from "../scripts/variant-model.mjs";

test("an empty or broken template is repaired", () => {
  const t = repairTemplate("garbage");
  assert.deepEqual(t, {id: "", name: "", base: "", folder: "", pattern: "", aspects: [], variance: {mode: "single"}, seed: 1});
  const r = repairTemplate({aspects: [{kind: "magic"}, {kind: "set"}, {kind: "potency", applies: "x", percent: "-200"}],
    variance: {mode: "range", min: "200", max: 50, count: 0, step: 0}});
  assert.deepEqual(r.aspects, [{kind: "potency", applies: "both", percent: -90, follow: true}]);
  assert.deepEqual(r.variance, {mode: "range", min: 50, max: 200, count: 1, step: 1});
});

test("aspects keep their kinds' fields", () => {
  assert.deepEqual(repairAspect({kind: "price", percent: "10", value: ""}), {kind: "price", percent: 10, follow: false, value: null});
  assert.deepEqual(repairAspect({kind: "rider", dc: "99", duration: {value: "2", units: "week"}}),
    {kind: "rider", ability: "con", dc: 40, condition: "poisoned", duration: {value: 2, units: "hour"}, percent: 0});
  assert.deepEqual(repairAspect({kind: "set", path: " system.material ", value: 3}), {kind: "set", path: "system.material", value: "3"});
});

test("percents and names", () => {
  assert.equal(factorOf(50), 1.5);
  assert.equal(factorOf(-20), 0.8);
  assert.equal(percentText(1.14), "+14%");
  assert.equal(percentText(0.9), "−10%");
  assert.equal(percentText(1), "±0%");
  assert.equal(itemName("{tier} {base}", {base: "Potion of Healing", tier: "Strong"}), "Strong Potion of Healing");
  assert.equal(itemName("{tier} {base}", {base: "Dagger"}), "Dagger");
  assert.equal(itemName("{base} ({percent})", {base: "Dagger"}), "Dagger");
  assert.equal(itemName("{name}", {base: "Dagger", name: "Knife"}), "Knife");
});

test("a range rolls the same variants for the same seed, merged and in order", () => {
  const t = repairTemplate({variance: {mode: "range", min: 50, max: 100, count: 5, step: 5}});
  const a = variants(t, mulberry32(7));
  const b = variants(t, mulberry32(7));
  assert.deepEqual(a, b);
  assert.ok(a.length >= 1 && a.length <= 5);
  for ( const v of a ) assert.ok(v.factor >= 1.5 && v.factor <= 2);
  assert.deepEqual(a.map(v => v.key), a.map((v, i) => `range:${i}`));
  assert.deepEqual([...a].sort((x, y) => x.factor - y.factor), a);
  // A range narrower than its step gives one item
  assert.equal(variants(repairTemplate({variance: {mode: "range", min: 10, max: 11, count: 9, step: 5}}), mulberry32(1)).length, 1);
});

test("rollFactor stays in the range and on the step", () => {
  const v = {min: 5, max: 20, step: 1};
  const rng = mulberry32(3);
  for ( let i = 0; i < 50; i++ ) {
    const f = rollFactor(v, rng);
    assert.ok(f >= 1.05 && f <= 1.2, String(f));
    assert.equal(Math.round((f - 1) * 100), (f - 1) * 100 > 0 ? Math.round((f - 1) * 100) : 0);
  }
});

test("tiers and rows: one variant each, duplicates merged, keys from the names", () => {
  const tiers = variants(repairTemplate({variance: {mode: "tiers", tiers: [{name: "Fine", percent: 100}, {name: "fine", percent: 5},
    {name: "", percent: 3}, {name: "Shoddy", percent: -50}]}}), Math.random);
  assert.deepEqual(tiers, [{key: "tier:fine", factor: 2, tier: "Fine"}, {key: "tier:shoddy", factor: 0.5, tier: "Shoddy"}]);
  const rows = variants(repairTemplate({variance: {mode: "rows", rows: [{name: "Hunting knife", price: "2"}, {name: "Hunting Knife"}, {}]}}), Math.random);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "row:hunting-knife");
  assert.equal(rows[0].row.price, 2);
});

test("a plan multiplies price factors, follows the variant where asked, takes fixed values", () => {
  const t = repairTemplate({
    variance: {mode: "range", min: 50, max: 100},
    aspects: [
      {kind: "potency", applies: "heal"},
      {kind: "price", follow: true},
      {kind: "rider", ability: "con", dc: 13, condition: "poisoned", percent: -20},
      {kind: "rarity", value: "auto"},
      {kind: "set", path: "system.properties", value: "mgc"}
    ]
  });
  const plan = variantPlan(t, {key: "range:0", factor: 1.5}, "Potion of Healing");
  assert.deepEqual(plan.potency, {applies: "heal", factor: 1.5});
  assert.equal(plan.price.factor, 1.2);
  assert.equal(plan.price.value, null);
  assert.equal(plan.weight.factor, 1);
  assert.equal(plan.rarity, "auto");
  assert.equal(plan.name, "Potion of Healing (+50%)");
  assert.deepEqual(plan.riders, [{ability: "con", dc: 13, condition: "poisoned", duration: {value: 1, units: "hour"}, percent: -20}]);
  assert.deepEqual(plan.sets, [{path: "system.properties", value: "mgc"}]);

  // A merchant's craft: +10% whatever the strength
  const craft = repairTemplate({aspects: [{kind: "potency"}, {kind: "price", percent: 10}], variance: {mode: "range", min: 5, max: 20}});
  assert.equal(variantPlan(craft, {key: "x", factor: 1.12}, "X").price.factor, 1.1);

  // A row's price and weight win over the aspects
  const rows = repairTemplate({aspects: [{kind: "price", percent: 50}], variance: {mode: "rows", rows: [{name: "Knife", price: 3, weight: 0.5,
    set: {"system.material": "bone"}}]}});
  const [row] = variants(rows, Math.random);
  const p = variantPlan(rows, row, "Dagger");
  assert.equal(p.name, "Knife");
  assert.equal(p.price.value, 3);
  assert.equal(p.weight.value, 0.5);
  assert.deepEqual(p.sets, [{path: "system.material", value: "bone"}]);
});

test("rows come from pasted spreadsheet text and go back", () => {
  const text = "Name\tprice\tGewicht\tsystem.material\tcolour\nKnife\t1,5\t0.5\tbone\tred\n\t\t\t\t\nAxe\t\t2\t\t\n";
  const {rows, columns, unknown} = rowsFromTSV(text, {weight: "Gewicht"});
  assert.deepEqual(columns, ["system.material"]);
  assert.deepEqual(unknown, ["colour"]);
  assert.deepEqual(rows, [
    {name: "Knife", price: 1.5, weight: 0.5, img: "", note: "", set: {"system.material": "bone"}},
    {name: "Axe", price: null, weight: 2, img: "", note: "", set: {}}
  ]);
  const variance = repairTemplate({variance: {mode: "rows", columns, rows}}).variance;
  assert.deepEqual(rowsFromTSV(rowsToTSV(variance)).rows, rows);
});
