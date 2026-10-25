// dewarim-merchants: friendly actors that buy and sell. The actor is the merchant (his configuration),
// each placed token a shop with its own stock - the same for every visitor, priced per character. Players
// trade on their own; the connected GM's client carries the trades out (trade.mjs). System code lives in
// systems/<id>.mjs; other systems get the generic fallback.
import {adapter, registerAdapter} from "./adapter.mjs";
import {DEFAULT_BRACKETS} from "./config-model.mjs";
import {clearMerchantState, configReferences} from "./export-model.mjs";
import {MarketApp} from "./market-app.mjs";
import {
  DEFAULT_IMG, MODULE_ID, SHEET_CLASS, config, configure, createMerchant, isMerchant, merchantTokens, sceneLevel, setSceneLevel
} from "./merchant.mjs";
import {MerchantSheet} from "./merchant-sheet.mjs";
import {RulesApp} from "./rules-app.mjs";
import {isDue, restock, restockAll, stateOf} from "./stock.mjs";
import {canTrade, listen, request} from "./trade.mjs";
import {registerChangelog} from "./shared/changelog.mjs";

// After an install or update, GMs see what changed (CHANGELOG.md)
registerChangelog(MODULE_ID);

let market;
let rules;

function openMarket() {
  market ??= new MarketApp();
  return market.render({force: true});
}

function openRules() {
  rules ??= new RulesApp();
  return rules.render({force: true});
}

/** The shop of a placed merchant (its token's sheet). */
function openShop(token) {
  const doc = token?.document ?? token;
  return doc?.actor?.sheet.render({force: true});
}

/**
 * Put a merchant on a scene: an unlinked friendly token, stocked right away (by the createToken hook).
 * @param {Scene} scene
 * @param {Actor} actor
 * @param {{x: number, y: number}} position   the token's top left corner
 */
async function placeMerchant(scene, actor, {x, y}) {
  const token = await actor.getTokenDocument({x, y, actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY});
  const [created] = await scene.createEmbeddedDocuments("Token", [token.toObject()]);
  return created;
}

/**
 * What a merchant actor depends on, for a content build: world items (custom stock, single-item sources,
 * the items of source folders, recursively) as UUIDs, and the compendiums named.
 * @returns {{uuids: string[], packs: string[]}}
 */
function references(actor) {
  if ( !isMerchant(actor) ) return {uuids: [], packs: []};
  const refs = configReferences(config(actor), id => game.packs.has(id));
  const uuids = new Set(refs.uuids);
  for ( const uuid of refs.folders ) {
    const folder = fromUuidSync(uuid, {strict: false});
    if ( !(folder instanceof Folder) ) continue;
    for ( const f of [folder, ...folder.getSubfolders(true)] ) f.contents.forEach(item => uuids.add(item.uuid));
  }
  return {uuids: [...uuids], packs: refs.packs};
}

/** Exported data cleaned for a content build: a scene's merchant tokens lose their restock state. */
function prepareExport(documentName, data) {
  if ( documentName === "Scene" ) clearMerchantState(data, MODULE_ID);
  return data;
}

const refreshMarket = foundry.utils.debounce(() => { if ( market?.rendered ) market.render(); }, 200);

Hooks.once("init", async () => {
  game.settings.register(MODULE_ID, "rules", {scope: "world", config: false, type: Array, default: []});
  game.settings.register(MODULE_ID, "brackets", {scope: "world", config: false, type: Array, default: DEFAULT_BRACKETS});
  game.settings.register(MODULE_ID, "systemLevels", {scope: "world", config: false, type: Object, default: {}});
  game.settings.registerMenu(MODULE_ID, "rulesMenu", {
    name: "DEWARIM_MERCHANTS.Rules.Title",
    label: "DEWARIM_MERCHANTS.Rules.Open",
    hint: "DEWARIM_MERCHANTS.Rules.Hint",
    icon: "fa-solid fa-scale-unbalanced",
    type: RulesApp,
    restricted: true
  });

  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, MerchantSheet, {
    label: "DEWARIM_MERCHANTS.Sheet", makeDefault: false
  });

  if ( game.system.id === "dnd5e" ) (await import("./systems/dnd5e.mjs")).register({registerAdapter});
  else {
    for ( const key of ["price", "money", "quantity", "level", "race", "profession"] ) {
      game.settings.register(MODULE_ID, `generic.${key}`, {
        name: `DEWARIM_MERCHANTS.Generic.${key}`, hint: "DEWARIM_MERCHANTS.Generic.Hint",
        scope: "world", config: true, type: String, default: ""
      });
    }
    (await import("./systems/generic.mjs")).register({registerAdapter});
  }
});

Hooks.once("ready", () => {
  listen();
  game.modules.get(MODULE_ID).api = {
    isMerchant, config, configure, createMerchant, placeMerchant, merchantTokens, sceneLevel, setSceneLevel,
    templates: () => adapter.templates?.() ?? [],
    restock: (token, options) => restock(token?.document ?? token, options),
    restockAll: (tokens, options) => restockAll(tokens.map(t => t?.document ?? t), options),
    isDue, stateOf, openShop, openMarket, openRules, canTrade, request, references, prepareExport,
    DEFAULT_IMG, SHEET_CLASS,
    adapter: {
      id: adapter.id,
      itemTypes: () => adapter.itemTypes?.() ?? [],
      races: () => adapter.races?.() ?? Promise.resolve([]),
      professions: () => adapter.professions?.() ?? Promise.resolve([]),
      get unit() {
        return adapter.unit;
      },
      formatPrice: n => adapter.formatPrice(n)
    }
  };
});

/** Only one client restocks: the connected GM who is in charge. */
const inCharge = () => game.user === game.users.activeGM;

// A merchant placed on a scene - by hand, by the studio, by placeMerchant - gets his first stock
Hooks.on("createToken", token => {
  if ( inCharge() && isMerchant(token.actor) && !stateOf(token) ) {
    restock(token).catch(err => console.error(`${MODULE_ID} | first stock of ${token.name} failed`, err));
  }
});

// A scene's merchants catch up when the GM looks at it; players' visits ask for themselves (the sheet)
Hooks.on("canvasReady", () => {
  if ( inCharge() ) restockAll(merchantTokens(canvas.scene).filter(isDue));
  refreshMarket();
});

for ( const hook of ["createToken", "updateToken", "deleteToken", "createItem", "updateItem", "deleteItem"] ) Hooks.on(hook, refreshMarket);

/* -------------------------------------------- */
/*  Entry points                                */
/* -------------------------------------------- */

// The market in the token controls, on scenes with merchants
Hooks.on("getSceneControlButtons", controls => {
  const tokens = controls.tokens;
  if ( !tokens || !merchantTokens(canvas.scene).length ) return;
  tokens.tools.merchants = {
    name: "merchants",
    order: Object.keys(tokens.tools).length,
    title: "DEWARIM_MERCHANTS.Market.Title",
    icon: "fa-solid fa-store",
    button: true,
    onChange: () => openMarket()
  };
});

// Actors directory: make a merchant of an actor, or open its configuration
Hooks.on("getActorContextOptions", (app, options) => {
  const actorOf = li => game.actors.get(li.closest("[data-entry-id]")?.dataset.entryId);
  options.push({
    label: "DEWARIM_MERCHANTS.MakeMerchant",
    icon: "fa-solid fa-store",
    visible: li => game.user.isGM && !!actorOf(li) && !isMerchant(actorOf(li)),
    onClick: async (event, li) => {
      const actor = actorOf(li);
      await configure(actor);
      actor.sheet.render({force: true});
    }
  });
});
