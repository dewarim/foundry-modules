// The pure half of the dnd5e encounter rating: the party's XP budget against the creatures' XP, as the
// 2024 rules do it - each character adds the budget of their own level, the encounter is low, moderate or
// high by the first budget its XP fits in. No Foundry globals: test/dnd5e-rating.test.mjs. The table is
// CONFIG.DND5E.ENCOUNTER_DIFFICULTY ([low, moderate, high] per level, index = level).

/**
 * The party's budget: per character by their level (1 up to the table's last level), summed.
 * dnd5e's own encounter sheet takes the average level times the party size; for a party of one level
 * that is the same.
 * @param {number[]} levels
 * @param {number[][]} table
 * @returns {{low: number, moderate: number, high: number}}
 */
export function partyBudget(levels, table) {
  const budget = {low: 0, moderate: 0, high: 0};
  for ( const level of levels ) {
    const row = table[Math.max(1, Math.min(table.length - 1, Math.round(level) || 1))] ?? [];
    budget.low += row[0] ?? 0;
    budget.moderate += row[1] ?? 0;
    budget.high += row[2] ?? 0;
  }
  return budget;
}

/** The party's level as dnd5e reads it: the rounded average (0 without characters). */
export function partyLevel(levels) {
  if ( !levels.length ) return 0;
  return Math.round(levels.reduce((sum, l) => sum + (Number(l) || 0), 0) / levels.length);
}

/**
 * Rate an encounter's XP against a budget.
 * rating: null without a budget (no party), "none" without XP, then "low", "moderate", "high" (at most
 * that budget) and "beyond" (more than the high budget). pct and stops place the XP and the three
 * budgets on a bar that ends at the high budget, or at the XP when it is beyond.
 * @param {number} xp
 * @param {{low: number, moderate: number, high: number}} budget
 */
export function rate(xp, budget) {
  if ( !(budget.high > 0) ) return {rating: null, xp, budget, pct: 0, stops: {low: 0, moderate: 0, high: 0}};
  let rating = "beyond";
  if ( !(xp > 0) ) rating = "none";
  else if ( xp <= budget.low ) rating = "low";
  else if ( xp <= budget.moderate ) rating = "moderate";
  else if ( xp <= budget.high ) rating = "high";
  const scale = Math.max(xp, budget.high);
  const at = v => Math.round((v / scale) * 1000) / 10;
  return {rating, xp, budget, pct: at(Math.max(0, xp)), stops: {low: at(budget.low), moderate: at(budget.moderate), high: at(budget.high)}};
}
