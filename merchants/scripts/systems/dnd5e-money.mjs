// dnd5e coins: prices in copper, paying from a purse with change, receiving coins. The rates come from
// CONFIG.DND5E.currencies (`conversion`: how many make one gold piece) and are passed in, so this file
// has no Foundry globals - covered by test/dnd5e-money.test.mjs.

/** Copper per coin: {pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1} for dnd5e's rates. */
export function coinValues(currencies) {
  const smallest = Math.max(...Object.values(currencies).map(c => c.conversion));
  return Object.fromEntries(Object.entries(currencies).map(([key, c]) => [key, Math.round(smallest / c.conversion)]));
}

/** An amount in a denomination, in copper. */
export function toCopper(value, denomination, values) {
  return Math.round((Number(value) || 0) * (values[denomination] ?? values.gp ?? 1));
}

/** What a purse is worth, in copper. */
export function purseValue(purse, values) {
  return Object.entries(values).reduce((sum, [key, v]) => sum + ((Number(purse?.[key]) || 0) * v), 0);
}

/** Denominations from the largest coin to the smallest. */
const descending = values => Object.keys(values).sort((a, b) => values[b] - values[a]);

/**
 * Coins for an amount: the largest first, from the given denominations (electrum is left out by default -
 * nobody wants change in electrum).
 */
export function coinsFor(amount, values, denominations = descending(values).filter(k => k !== "ep")) {
  const coins = {};
  let rest = Math.max(0, Math.round(amount));
  for ( const key of denominations.sort((a, b) => values[b] - values[a]) ) {
    const n = Math.floor(rest / values[key]);
    if ( n ) coins[key] = n;
    rest -= n * values[key];
  }
  return coins;
}

/**
 * Pay an amount from a purse: the smallest coins go first, a larger coin is broken when needed and the
 * change comes back in coins no larger than it. Platinum is broken last, and the change never holds
 * platinum or electrum.
 * @returns {object|null} the purse afterwards, null if it does not hold enough
 */
export function planPayment(purse, amount, values) {
  const total = purseValue(purse, values);
  if ( total < amount ) return null;
  const after = Object.fromEntries(Object.keys(values).map(k => [k, Number(purse?.[k]) || 0]));
  let rest = Math.round(amount);
  let broken = null;
  for ( const key of descending(values).reverse() ) {
    if ( rest <= 0 ) break;
    const take = Math.min(after[key], Math.ceil(rest / values[key]));
    after[key] -= take;
    rest -= take * values[key];
    if ( take ) broken = key;
  }
  if ( rest < 0 ) {
    const change = coinsFor(-rest, values, Object.keys(values)
      .filter(k => (k !== "ep") && (k !== "pp") && (values[k] <= values[broken])));
    for ( const [key, n] of Object.entries(change) ) after[key] += n;
  }
  return after;
}

/** A purse with an amount added, in the largest coins up to gold. */
export function planReceipt(purse, amount, values) {
  const after = Object.fromEntries(Object.keys(values).map(k => [k, Number(purse?.[k]) || 0]));
  const coins = coinsFor(amount, values, Object.keys(values).filter(k => (k !== "ep") && (values[k] <= (values.gp ?? Infinity))));
  for ( const [key, n] of Object.entries(coins) ) after[key] += n;
  return after;
}

/**
 * A copper amount as coins: "12 gp 5 sp". Only gold and below, as dnd5e lists prices.
 * @param {number} amount
 * @param {object} values
 * @param {Record<string, string>} labels  abbreviations per denomination
 */
export function formatCoins(amount, values, labels) {
  if ( !(amount > 0) ) return `0 ${labels.gp ?? "gp"}`;
  const coins = coinsFor(amount, values, Object.keys(values).filter(k => (k !== "ep") && (values[k] <= (values.gp ?? Infinity))));
  return Object.entries(coins).map(([key, n]) => `${n.toLocaleString()} ${labels[key] ?? key}`).join(" ");
}
