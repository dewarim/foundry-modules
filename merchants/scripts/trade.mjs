// Trading without asking the GM: a player cannot write the GM's merchant token, so each trade goes over
// the module socket to the connected GM's client, which checks it, carries it out and answers - no
// dialog, nothing to click. A GM's own trades run directly. The GM side trusts nothing the client sent
// but ids: prices, funds and stock are worked out again there.
import {adapter} from "./adapter.mjs";
import {MODULE_ID, accepts, config, effectiveLevel, giveItem, isMerchant, quantityOf, stockItems, takeItem, worldRules} from "./merchant.mjs";
import {priceFactor, purchasePrice, salePrice} from "./pricing.mjs";
import {isDue, restock, stateOf} from "./stock.mjs";

const CHANNEL = `module.${MODULE_ID}`;
const TIMEOUT = 15000;

/** Requests waiting for the GM's answer: id -> {resolve, reject, timer} */
const pending = new Map();

/** Trades run one after another on the GM's side: two players buying the last potion get one each - no. */
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

/**
 * A refused trade. It carries a translation key, not a text: the GM's client works the trade out, the
 * player's client words the answer - in the player's language.
 */
class TradeError extends Error {
  constructor(key, data) {
    super(_loc(key, data));
    this.key = key;
    this.data = data;
  }
}

const fail = (key, data) => { throw new TradeError(`DEWARIM_MERCHANTS.Error.${key}`, data); };

/** An outcome to be worded by whoever asked: {key, data}. */
const outcome = (key, data) => ({key: `DEWARIM_MERCHANTS.${key}`, data});
const word = result => (result?.key ? _loc(result.key, result.data) : (result ?? null));

/* -------------------------------------------- */
/*  Prices for a buyer                          */
/* -------------------------------------------- */

/** The rule factor for a buyer at a merchant. */
export function factorFor(merchant, buyer) {
  return priceFactor(config(merchant), buyer ? adapter.buyer(buyer) : {}, worldRules());
}

/** What one piece of a stock item costs this buyer. */
export function askingPrice(merchant, item, factor) {
  const cfg = config(merchant);
  const flag = item.flags[MODULE_ID].stock;
  const entry = flag.fixed ? cfg.fixed.find(f => f.uuid === flag.source) : null;
  const fixed = (entry?.price !== null) && (entry?.price !== undefined)
    ? {price: entry.price * (adapter.unit?.value || 1), exact: entry.exact} : null;
  return salePrice(adapter.basePrice(item), cfg, factor, fixed);
}

/** What the merchant pays for one piece of a buyer's item (0: he does not take it). */
export function offeredPrice(merchant, item, factor) {
  const cfg = config(merchant);
  if ( !accepts(cfg, item) ) return 0;
  return purchasePrice(adapter.basePrice(item), cfg, factor);
}

/* -------------------------------------------- */
/*  The GM's side                               */
/* -------------------------------------------- */

function resolveToken(sceneId, tokenId, user) {
  const token = game.scenes.get(sceneId)?.tokens.get(tokenId);
  if ( !token || !isMerchant(token.actor) ) fail("NoMerchant");
  if ( token.hidden && !user.isGM ) fail("NoMerchant");
  return token;
}

async function resolveBuyer(uuid, user) {
  const buyer = await fromUuid(uuid);
  if ( !(buyer instanceof Actor) || !buyer.testUserPermission(user, "OWNER") ) fail("NotYours");
  return buyer;
}

/** A trade message for the GMs and the trading player. */
function record(token, user, key, data) {
  const whisper = [...new Set([...game.users.filter(u => u.isGM).map(u => u.id), user.id])];
  return ChatMessage.implementation.create({
    content: `<p>${_loc(`DEWARIM_MERCHANTS.Chat.${key}`, data)}</p>`,
    speaker: ChatMessage.implementation.getSpeaker({token}),
    whisper
  });
}

const escape = s => foundry.utils.escapeHTML(String(s ?? ""));

/**
 * Carry out a trade (GM side).
 * @param {{kind: "buy"|"sell", sceneId: string, tokenId: string, buyerUuid: string, itemId: string,
 *   quantity: number}} request
 * @param {User} user   who asked
 */
async function executeTrade(request, user) {
  const token = resolveToken(request.sceneId, request.tokenId, user);
  const merchant = token.actor;
  const buyer = await resolveBuyer(request.buyerUuid, user);
  const cfg = config(merchant);
  const {factor} = factorFor(merchant, buyer);
  const state = stateOf(token) ?? {};
  const wanted = Math.max(1, Math.floor(Number(request.quantity) || 1));

  if ( request.kind === "buy" ) {
    const item = stockItems(merchant).find(i => i.id === request.itemId);
    if ( !item ) fail("SoldOut");
    const unlimited = !!item.flags[MODULE_ID].stock.unlimited;
    const quantity = unlimited ? wanted : Math.min(wanted, quantityOf(item));
    if ( quantity < 1 ) fail("SoldOut");
    const total = askingPrice(merchant, item, factor) * quantity;
    if ( !(await adapter.pay(buyer, total)) ) fail("NoMoney", {price: adapter.formatPrice(total)});
    try {
      await giveItem(buyer, item, quantity);
    } catch(err) {
      await adapter.receive(buyer, total);      // the money goes back
      throw err;
    }
    if ( !unlimited ) await takeItem(item, quantity);
    if ( cfg.purse !== null ) await token.setFlag(MODULE_ID, "state", {...state, purse: (state.purse ?? cfg.purse) + total});
    await record(token, user, "Bought", {buyer: escape(buyer.name), item: escape(item.name), quantity, price: adapter.formatPrice(total)});
    return outcome("Bought", {item: item.name, quantity, price: adapter.formatPrice(total)});
  }

  if ( request.kind === "sell" ) {
    const item = buyer.items.get(request.itemId);
    if ( !item ) fail("NoItem");
    const each = offeredPrice(merchant, item, factor);
    if ( !(each > 0) ) fail("NotWanted", {item: item.name});
    const quantity = Math.min(wanted, quantityOf(item) || 1);
    const total = each * quantity;
    if ( (cfg.purse !== null) && ((state.purse ?? cfg.purse) < total) ) fail("MerchantBroke");
    await giveItem(merchant, item, quantity, {source: null, fixed: false, bought: true,
      level: effectiveLevel(item)});
    await takeItem(item, quantity);
    await adapter.receive(buyer, total);
    if ( cfg.purse !== null ) await token.setFlag(MODULE_ID, "state", {...state, purse: (state.purse ?? cfg.purse) - total});
    await record(token, user, "Sold", {buyer: escape(buyer.name), item: escape(item.name), quantity, price: adapter.formatPrice(total)});
    return outcome("Sold", {item: item.name, quantity, price: adapter.formatPrice(total)});
  }
  fail("Unknown");
}

/** A restock a player's visit asks for: only when it is due. */
async function executeRestockIfDue({sceneId, tokenId}, user) {
  const token = resolveToken(sceneId, tokenId, user);
  if ( !isDue(token) ) return null;
  await restock(token);
  return outcome("Restocked", {name: token.name});
}

const ACTIONS = {trade: executeTrade, restockIfDue: executeRestockIfDue};

/** Run an action here (GM) and return its outcome ({key, data}), or throw. */
function runLocal(action, data, user = game.user) {
  return serial(() => ACTIONS[action](data, user));
}

/* -------------------------------------------- */
/*  The socket                                  */
/* -------------------------------------------- */

export function listen() {
  game.socket.on(CHANNEL, async message => {
    if ( message?.type === "response" ) {
      if ( message.to !== game.user.id ) return;
      const waiting = pending.get(message.id);
      if ( !waiting ) return;
      pending.delete(message.id);
      clearTimeout(waiting.timer);
      if ( message.ok ) waiting.resolve(word(message.result));
      else waiting.reject(new Error(message.errorKey ? _loc(message.errorKey, message.errorData) : message.error));
      return;
    }
    if ( (message?.type !== "request") || (game.user !== game.users.activeGM) || !ACTIONS[message.action] ) return;
    const user = game.users.get(message.userId);
    if ( !user ) return;
    const reply = {type: "response", id: message.id, to: user.id};
    try {
      reply.result = await runLocal(message.action, message.data, user);
      reply.ok = true;
    } catch(err) {
      if ( !(err instanceof TradeError) ) console.error(`${MODULE_ID} | ${message.action} for ${user.name} failed`, err);
      reply.ok = false;
      reply.error = err.message;
      if ( err instanceof TradeError ) Object.assign(reply, {errorKey: err.key, errorData: err.data});
    }
    game.socket.emit(CHANNEL, reply);
  });
}

/** Can trades run right now? They need a GM: this user, or one who is connected. */
export function canTrade() {
  return game.user.isGM || !!game.users.activeGM;
}

/**
 * Ask for an action: run here when this user is a GM, else on the connected GM's client.
 * @returns {Promise<string|null>} the outcome message
 */
export function request(action, data) {
  if ( game.user.isGM ) return runLocal(action, data).then(word);
  if ( !game.users.activeGM ) return Promise.reject(new Error(_loc("DEWARIM_MERCHANTS.Error.NoGM")));
  return new Promise((resolve, reject) => {
    const id = foundry.utils.randomID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(_loc("DEWARIM_MERCHANTS.Error.Timeout")));
    }, TIMEOUT);
    pending.set(id, {resolve, reject, timer});
    game.socket.emit(CHANNEL, {type: "request", id, userId: game.user.id, action, data});
  });
}
