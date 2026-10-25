// The stock of a placed merchant: which level it is chosen for, when it is due, and what a restock
// takes out and puts in. The stock belongs to the merchant's token on its scene - every visitor sees the
// same goods. No Foundry globals - covered by test/stock-model.test.mjs.
import {sample} from "./rng.mjs";

/**
 * An item's level by its price: the first level whose bracket the price fits under. Above the last
 * bracket: one level more than there are brackets.
 * @param {number} price       in the system's main unit (dnd5e: gp)
 * @param {number[]} brackets  the highest price per level, level 1 first
 */
export function bracketLevel(price, brackets) {
  if ( !brackets?.length ) return 1;
  const p = Number(price) || 0;
  const index = brackets.findIndex(max => p <= max);
  return index >= 0 ? index + 1 : brackets.length + 1;
}

/**
 * An item's effective level: set on the item (flag) > the system's own notion (dnd5e rarity) > its price.
 * @param {{flag?: *, system?: number|null, price: number, brackets: number[]}} sources
 */
export function itemLevel({flag, system, price, brackets}) {
  const set = Number(flag);
  if ( (flag !== undefined) && (flag !== null) && (flag !== "") && Number.isFinite(set) ) return Math.max(0, set);
  if ( Number.isFinite(system) && (system !== null) ) return system;
  return bracketLevel(price, brackets);
}

/**
 * The level a placed merchant's stock is chosen for: the scene's level, else the party's, else his own -
 * never above his own.
 */
export function stockLevel(merchantLevel, sceneLevel, partyLevel) {
  const valid = n => Number.isFinite(n) && (n > 0);
  const wanted = valid(sceneLevel) ? sceneLevel : (valid(partyLevel) ? partyLevel : merchantLevel);
  return Math.max(1, Math.min(merchantLevel, wanted));
}

/**
 * Is a restock due? Never stocked: yes. Otherwise after `period` hours of real time (ms since epoch) or
 * of the world's game time (seconds). A period of 0 restocks only by hand.
 * @param {{period: number, clock: "real"|"game"}} restock
 * @param {{real?: number, game?: number}|null} last
 */
export function restockDue(restock, last, now, worldTime) {
  if ( !last ) return true;
  if ( !(restock.period > 0) ) return false;
  if ( restock.clock === "game" ) return (worldTime - (last.game ?? 0)) >= restock.period * 3600;
  return (now - (last.real ?? 0)) >= restock.period * 3600 * 1000;
}

/**
 * What a restock does.
 * @param {object} input
 * @param {{id: string, source: string|null, fixed: boolean, level: number, quantity: number, name?: string}[]} input.stock
 *   the stock items now (bought-in items have no source)
 * @param {{uuid: string, quantity: number|null, replenish: boolean}[]} input.fixed   the custom stock
 * @param {string[]} input.stocked     custom stock uuids this merchant had before (a quest item sold out
 *                                     and not replenished must not come back)
 * @param {{uuid: string, level: number, stack?: boolean, name?: string}[]} input.candidates   what may be
 *                                     offered; one the stock has by name already is not offered twice
 * @param {number} input.stockSize     random items wanted
 * @param {number} input.turnover      percent of the random stock replaced
 * @param {number} input.level         stock level
 * @param {() => number} input.rng
 * @returns {{remove: string[], refill: {id: string, quantity: number}[],
 *   add: {uuid: string, quantity: number, level: number|null, fixed: boolean}[]}}
 */
export function planRestock({stock, fixed, stocked = [], candidates, stockSize, turnover, level, rng}) {
  const remove = [];
  const refill = [];
  const add = [];

  // Custom stock: kept as it is, topped up when it replenishes, added when it is new
  const fixedUuids = new Set(fixed.map(f => f.uuid));
  for ( const entry of fixed ) {
    const item = stock.find(s => s.fixed && (s.source === entry.uuid));
    const quantity = entry.quantity ?? 1;
    if ( item ) {
      if ( entry.replenish && (entry.quantity !== null) && (item.quantity < quantity) ) refill.push({id: item.id, quantity});
    }
    else if ( entry.replenish || !stocked.includes(entry.uuid) ) add.push({uuid: entry.uuid, quantity, level: null, fixed: true});
  }
  // Custom stock that is no longer configured goes
  for ( const s of stock ) if ( s.fixed && !fixedUuids.has(s.source) ) remove.push(s.id);

  // Random stock: what is above the level now goes (the scene's level was lowered), then a share at random
  const random = stock.filter(s => !s.fixed);
  const tooHigh = random.filter(s => s.level > level);
  remove.push(...tooHigh.map(s => s.id));
  const rest = random.filter(s => s.level <= level);
  const replaced = sample(rest, Math.round(rest.length * (turnover / 100)), rng);
  remove.push(...replaced.map(s => s.id));
  const kept = rest.filter(s => !replaced.includes(s));

  // Fill up: a level first (each level with candidates equally likely), then an item of that level - so a
  // well-stocked shop keeps its cheap goods next to the expensive ones
  const have = new Set([...kept.map(s => s.source), ...fixedUuids]);
  const named = new Set(stock.filter(s => !remove.includes(s.id) && s.name).map(s => s.name));
  const byLevel = new Map();
  for ( const c of candidates ) {
    if ( (c.level > level) || have.has(c.uuid) || (c.name && named.has(c.name)) ) continue;
    if ( !byLevel.has(c.level) ) byLevel.set(c.level, []);
    byLevel.get(c.level).push(c);
  }
  let missing = Math.max(0, stockSize - kept.length);
  while ( (missing > 0) && byLevel.size ) {
    const levels = [...byLevel.keys()];
    const pick = levels[Math.floor(rng() * levels.length)];
    const pool = byLevel.get(pick);
    const [candidate] = pool.splice(Math.floor(rng() * pool.length), 1);
    if ( !pool.length ) byLevel.delete(pick);
    const quantity = candidate.stack ? 1 + Math.floor(rng() * 5) : 1;
    add.push({uuid: candidate.uuid, quantity, level: candidate.level, fixed: false});
    missing--;
  }
  return {remove, refill, add};
}

/**
 * Stock items the same as an incoming one, to stack on: same name and type.
 * @param {{id: string, name: string, type: string}[]} items
 */
export function stackTarget(items, name, type) {
  return items.find(i => (i.name === name) && (i.type === type)) ?? null;
}
