// Prices: what a merchant asks from and pays to one character. Rules are sparse - one per exception
// ("dwarf merchants: elves +50%"); a buyer no rule names pays the plain price. Race and profession each
// give a factor, and the two multiply. No Foundry globals - covered by test/pricing.test.mjs.

/**
 * The percent one dimension adds, from the most specific rule that matches:
 *   the merchant's own rule for this buyer, then his own rule for anyone ("*"),
 *   a world rule for merchants of his kind, for this buyer, then for anyone,
 *   a world rule for any merchant ("*"), for this buyer, then for anyone.
 * @param {string} dimension      "race" or "profession"
 * @param {string} merchantKey    the merchant's race or profession ("" if none)
 * @param {string} buyerKey       the buyer's race or profession ("" if none)
 * @param {object[]} own          the merchant's own rules
 * @param {object[]} world        the world's rules
 * @returns {number} percent, 0 without a matching rule
 */
export function rulePercent(dimension, merchantKey, buyerKey, own = [], world = []) {
  const buyer = String(buyerKey ?? "").toLowerCase();
  const merchant = String(merchantKey ?? "").toLowerCase();
  const of = rules => rules.filter(r => r.dimension === dimension);
  const find = (rules, merchantMatch) => {
    const matching = of(rules).filter(merchantMatch);
    return (buyer ? matching.find(r => r.buyer === buyer) : undefined) ?? matching.find(r => r.buyer === "*");
  };
  const rule = find(own, () => true)
    ?? (merchant ? find(world, r => r.merchant === merchant) : undefined)
    ?? find(world, r => r.merchant === "*");
  return rule?.percent ?? 0;
}

/**
 * The factor the rules put on a price for this buyer: (1 + race%) x (1 + profession%), neither below 0.
 * @param {{race: string, profession: string, rules: object[]}} merchant   the merchant's configuration
 * @param {{race?: string, profession?: string}} buyer
 * @param {object[]} worldRules
 * @returns {{factor: number, race: number, profession: number}}
 */
export function priceFactor(merchant, buyer, worldRules = []) {
  const race = rulePercent("race", merchant.race, buyer?.race, merchant.rules, worldRules);
  const profession = rulePercent("profession", merchant.profession, buyer?.profession, merchant.rules, worldRules);
  const factor = Math.max(0, 1 + (race / 100)) * Math.max(0, 1 + (profession / 100));
  return {factor, race, profession};
}

/** Whole smallest units; something that costs anything costs at least one. */
function round(value, base) {
  if ( !(base > 0) || !(value > 0) ) return 0;
  return Math.max(1, Math.round(value));
}

/**
 * What the merchant asks for one item.
 * @param {number} base        the item's value in the smallest currency unit
 * @param {{markup: number}} merchant
 * @param {number} factor      from priceFactor
 * @param {{price?: number|null, exact?: boolean}} [fixed]  a custom stock price (smallest unit) instead
 *                             of the value; `exact` ignores markup and rules
 */
export function salePrice(base, merchant, factor, fixed = null) {
  if ( (fixed?.price !== null) && (fixed?.price !== undefined) ) {
    if ( fixed.exact ) return Math.round(fixed.price);
    return round(fixed.price * factor, fixed.price);
  }
  return round(base * Math.max(0, 1 + (merchant.markup / 100)) * factor, base);
}

/**
 * What the merchant pays for one item: its value less his discount, divided by the factor - a merchant
 * who charges elves more also pays them less. Never more than he would ask for it, so nobody can buy
 * and sell back at a profit.
 */
export function purchasePrice(base, merchant, factor) {
  if ( !(base > 0) ) return 0;
  const value = base * (1 - (merchant.buyDiscount / 100));
  const paid = factor > 0 ? value / factor : 0;
  return Math.min(Math.floor(paid), salePrice(base, merchant, factor));
}
