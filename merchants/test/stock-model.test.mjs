import {test} from "node:test";
import assert from "node:assert/strict";
import {bracketLevel, itemLevel, planRestock, restockDue, stackTarget, stockLevel} from "../scripts/stock-model.mjs";
import {mulberry32} from "../scripts/rng.mjs";

test("item level by price bracket", () => {
  const brackets = [10, 50, 100];
  assert.equal(bracketLevel(0, brackets), 1);
  assert.equal(bracketLevel(10, brackets), 1);
  assert.equal(bracketLevel(11, brackets), 2);
  assert.equal(bracketLevel(100, brackets), 3);
  assert.equal(bracketLevel(5000, brackets), 4);
  assert.equal(bracketLevel(5000, []), 1);
});

test("item level: flag > system > price", () => {
  const brackets = [10, 50];
  assert.equal(itemLevel({flag: 7, system: 3, price: 1, brackets}), 7);
  assert.equal(itemLevel({flag: "", system: 3, price: 1, brackets}), 3);
  assert.equal(itemLevel({flag: undefined, system: null, price: 40, brackets}), 2);
  assert.equal(itemLevel({flag: "x", system: null, price: 1, brackets}), 1);
});

test("stock level: scene, else party, else the merchant - never above the merchant", () => {
  assert.equal(stockLevel(5, 3, 8), 3);
  assert.equal(stockLevel(5, 9, 1), 5);
  assert.equal(stockLevel(5, null, 2), 2);
  assert.equal(stockLevel(5, undefined, undefined), 5);
});

test("restock due by real and game time", () => {
  const day = {period: 24, clock: "real"};
  const now = Date.UTC(2026, 9, 23);
  assert.equal(restockDue(day, null, now, 0), true);
  assert.equal(restockDue(day, {real: now - (23 * 3600 * 1000)}, now, 0), false);
  assert.equal(restockDue(day, {real: now - (24 * 3600 * 1000)}, now, 0), true);
  const game = {period: 8, clock: "game"};
  assert.equal(restockDue(game, {game: 1000}, now, 1000 + (8 * 3600) - 1), false);
  assert.equal(restockDue(game, {game: 1000}, now, 1000 + (8 * 3600)), true);
  // period 0: by hand only
  assert.equal(restockDue({period: 0, clock: "real"}, {real: 0}, now, 0), false);
});

const candidates = [
  ...Array.from({length: 10}, (_, i) => ({uuid: `low${i}`, level: 1})),
  ...Array.from({length: 10}, (_, i) => ({uuid: `mid${i}`, level: 3, stack: true})),
  ...Array.from({length: 10}, (_, i) => ({uuid: `high${i}`, level: 9}))
];

test("a first restock fills up to the size, nothing above the level, levels mixed", () => {
  const plan = planRestock({stock: [], fixed: [], candidates, stockSize: 8, turnover: 30, level: 5, rng: mulberry32(1)});
  assert.equal(plan.add.length, 8);
  assert.deepEqual(plan.remove, []);
  assert.ok(plan.add.every(a => a.level <= 5));
  assert.ok(plan.add.some(a => a.level === 1) && plan.add.some(a => a.level === 3));
  assert.equal(new Set(plan.add.map(a => a.uuid)).size, 8);
  assert.ok(plan.add.filter(a => a.level === 1).every(a => a.quantity === 1));
  assert.ok(plan.add.filter(a => a.level === 3).every(a => (a.quantity >= 1) && (a.quantity <= 5)));
  // the same dice, the same plan
  assert.deepEqual(planRestock({stock: [], fixed: [], candidates, stockSize: 8, turnover: 30, level: 5, rng: mulberry32(1)}), plan);
});

test("turnover replaces a share, sold items are refilled, too high levels go", () => {
  const stock = [
    ...Array.from({length: 10}, (_, i) => ({id: `s${i}`, source: `low${i}`, fixed: false, level: 1, quantity: 1})),
    {id: "h", source: "high0", fixed: false, level: 9, quantity: 1},
    {id: "b", source: null, fixed: false, level: 1, quantity: 1}     // bought from a player
  ];
  const plan = planRestock({stock, fixed: [], candidates, stockSize: 12, turnover: 30, level: 5, rng: mulberry32(7)});
  assert.ok(plan.remove.includes("h"));
  // 11 at level <= 5, 30 % of them replaced
  assert.equal(plan.remove.length, 1 + Math.round(11 * 0.3));
  const kept = 11 - Math.round(11 * 0.3);
  assert.equal(plan.add.length, 12 - kept);
  // nothing offered twice
  const keptSources = stock.filter(s => !plan.remove.includes(s.id)).map(s => s.source);
  assert.ok(plan.add.every(a => !keptSources.includes(a.uuid)));
});

test("custom stock: always there, refilled or not, removed when no longer configured", () => {
  const fixed = [
    {uuid: "quest", quantity: 1, replenish: false},
    {uuid: "rope", quantity: 5, replenish: true},
    {uuid: "water", quantity: null, replenish: true}
  ];
  const first = planRestock({stock: [], fixed, candidates: [], stockSize: 0, turnover: 30, level: 1, rng: mulberry32(1)});
  assert.deepEqual(first.add, [
    {uuid: "quest", quantity: 1, level: null, fixed: true},
    {uuid: "rope", quantity: 5, level: null, fixed: true},
    {uuid: "water", quantity: 1, level: null, fixed: true}
  ]);
  // later: the quest item was sold, two ropes are left, an old custom item is no longer configured
  const stock = [
    {id: "r", source: "rope", fixed: true, level: 1, quantity: 2},
    {id: "w", source: "water", fixed: true, level: 1, quantity: 1},
    {id: "old", source: "gone", fixed: true, level: 1, quantity: 1}
  ];
  const later = planRestock({stock, fixed, stocked: ["quest", "rope", "water", "gone"], candidates: [], stockSize: 0,
    turnover: 100, level: 1, rng: mulberry32(1)});
  assert.deepEqual(later.add, []);
  assert.deepEqual(later.refill, [{id: "r", quantity: 5}]);
  assert.deepEqual(later.remove, ["old"]);
  // a custom item is never offered as random stock as well
  const both = planRestock({stock: [], fixed: [{uuid: "low0", quantity: 1, replenish: true}],
    candidates: candidates.slice(0, 2), stockSize: 5, turnover: 0, level: 1, rng: mulberry32(3)});
  assert.deepEqual(both.add.map(a => a.uuid).sort(), ["low0", "low1"]);
});

test("nothing is offered twice by name", () => {
  const stock = [{id: "a", name: "Oil", source: "oil1", fixed: false, level: 1, quantity: 1}];
  const named = [{uuid: "oil2", name: "Oil", level: 1}, {uuid: "rope", name: "Rope", level: 1}];
  const plan = planRestock({stock, fixed: [], candidates: named, stockSize: 5, turnover: 0, level: 1, rng: mulberry32(2)});
  assert.deepEqual(plan.add.map(a => a.uuid), ["rope"]);
});

test("stackTarget by name and type", () => {
  const items = [{id: "a", name: "Rope", type: "loot"}, {id: "b", name: "Rope", type: "tool"}];
  assert.equal(stackTarget(items, "Rope", "tool").id, "b");
  assert.equal(stackTarget(items, "Rope", "weapon"), null);
});
