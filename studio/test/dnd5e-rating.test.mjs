import {test} from "node:test";
import assert from "node:assert/strict";
import {partyBudget, partyLevel, rate} from "../scripts/systems/dnd5e-rating.mjs";

// The first levels of dnd5e 6.0.6's CONFIG.DND5E.ENCOUNTER_DIFFICULTY
const TABLE = [[0, 0, 0], [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100]];

test("partyBudget: each character by their own level", () => {
  assert.deepEqual(partyBudget([3, 3, 3, 3], TABLE), {low: 600, moderate: 900, high: 1600});
  assert.deepEqual(partyBudget([5, 4], TABLE), {low: 750, moderate: 1125, high: 1600});
  // level 0 (no class yet) counts as 1, levels past the table as its last
  assert.deepEqual(partyBudget([0, 9], TABLE), {low: 550, moderate: 825, high: 1200});
  assert.deepEqual(partyBudget([], TABLE), {low: 0, moderate: 0, high: 0});
});

test("partyLevel: rounded average", () => {
  assert.equal(partyLevel([5, 5, 4, 5]), 5);
  assert.equal(partyLevel([3, 4]), 4);
  assert.equal(partyLevel([]), 0);
});

test("rate: the first budget the XP fits in", () => {
  const budget = {low: 600, moderate: 900, high: 1600};
  assert.equal(rate(0, budget).rating, "none");
  assert.equal(rate(600, budget).rating, "low");
  assert.equal(rate(601, budget).rating, "moderate");
  assert.equal(rate(1600, budget).rating, "high");
  assert.equal(rate(1601, budget).rating, "beyond");
  assert.equal(rate(500, {low: 0, moderate: 0, high: 0}).rating, null);
});

test("rate: the bar ends at the high budget, or at the XP beyond it", () => {
  const budget = {low: 600, moderate: 900, high: 1600};
  assert.deepEqual(rate(800, budget), {rating: "moderate", xp: 800, budget, pct: 50, stops: {low: 37.5, moderate: 56.3, high: 100}});
  const beyond = rate(3200, budget);
  assert.equal(beyond.pct, 100);
  assert.deepEqual(beyond.stops, {low: 18.8, moderate: 28.1, high: 50});
});
