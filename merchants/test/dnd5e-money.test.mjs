import {test} from "node:test";
import assert from "node:assert/strict";
import {coinValues, coinsFor, formatCoins, planPayment, planReceipt, purseValue, toCopper} from "../scripts/systems/dnd5e-money.mjs";

const values = coinValues({pp: {conversion: 0.1}, gp: {conversion: 1}, ep: {conversion: 2}, sp: {conversion: 10}, cp: {conversion: 100}});

test("coin values and prices in copper", () => {
  assert.deepEqual(values, {pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1});
  assert.equal(toCopper(1.5, "gp", values), 150);
  assert.equal(toCopper(2, "sp", values), 20);
  assert.equal(toCopper(0.1, "gp", values), 10);
  assert.equal(purseValue({pp: 1, gp: 2, ep: 1, sp: 3, cp: 4}, values), 1284);
});

test("paying: small coins first, change in coins no larger than the broken one", () => {
  assert.equal(planPayment({gp: 1}, 101, values), null);
  assert.deepEqual(planPayment({gp: 3, sp: 5, cp: 3}, 150, values), {pp: 0, gp: 2, ep: 0, sp: 0, cp: 3});
  // 5 cp from 3 cp and 1 gp: the gold piece is broken, 98 cp change
  assert.deepEqual(planPayment({cp: 3, gp: 1}, 5, values), {pp: 0, gp: 0, ep: 0, sp: 9, cp: 8});
  // platinum only when nothing else does
  assert.deepEqual(planPayment({pp: 1, gp: 1}, 150, values), {pp: 0, gp: 9, ep: 0, sp: 5, cp: 0});
  assert.deepEqual(planPayment({pp: 2, gp: 1}, 100, values), {pp: 2, gp: 0, ep: 0, sp: 0, cp: 0});
  // every payment keeps the value right
  for ( const [purse, amount] of [[{pp: 3, ep: 3, cp: 7}, 1234], [{gp: 10}, 999], [{sp: 30}, 1]] ) {
    const after = planPayment(purse, amount, values);
    assert.equal(purseValue(after, values), purseValue(purse, values) - amount);
  }
});

test("receiving and formatting", () => {
  assert.deepEqual(planReceipt({gp: 1}, 1234, values), {pp: 0, gp: 13, ep: 0, sp: 3, cp: 4});
  assert.deepEqual(coinsFor(1234, values), {pp: 1, gp: 2, sp: 3, cp: 4});
  const labels = {gp: "gp", sp: "sp", cp: "cp"};
  assert.equal(formatCoins(1250, values, labels), "12 gp 5 sp");
  assert.equal(formatCoins(0, values, labels), "0 gp");
});
