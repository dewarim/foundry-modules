# Dewarim: Merchants

**Requires:** nothing beyond Foundry v14 — system-agnostic, with an adapter for dnd5e 6 (recommended);
*Dewarim: Studio* recommended for fast configuration, *Dewarim: Item templates* for crafters and generated
stock.

Friendly merchants on your scenes, who sell and buy items of chosen types.

- **A merchant is an actor; each placed token is a shop.** The actor holds the configuration; the stock lives
  on the token, so it is the same for every character who visits, persists from visit to visit (what was
  sold is gone until the next restock), and the same blacksmith placed in two towns keeps two stocks.
- **Stock for the scene's level**: the stock is chosen for the scene's level (set in the market window or
  the studio; empty: the primary party's level), never above the merchant's own level. Item levels: a level
  set on the item (`flags.dewarim-merchants.level`) > the system's (dnd5e: by rarity) > price brackets
  (*Prices and levels* in the module settings). Sources: compendiums, item folders, single items; a
  condition filter (`price<=500 rarity!=artifact`) narrows them.
- **Custom stock**: items always on offer whatever the level - quest items, specials - with a quantity
  (or unlimited), an optional fixed price, and whether they come back on a restock.
- **Craft** (with *Dewarim: Item templates*): a merchant's own make. Random stock that matches a row's
  filter comes out stronger and dearer - "+5 … +20 %, +10 %" turns a Potion of Healing into a *Potion of
  Healing (+14%)* at 55 gp, an alchemist better than the rest. Strength scales heal and damage dice; an
  item it would not change stays plain, and custom stock is never changed. An item templates folder is a
  source like any other.
- **Prices per character**: a global markup or discount per merchant, and sparse rules by race and
  profession - one row per exception ("dwarf merchants: elves +50%", "priests: warlocks +100%"); anyone no
  rule names pays the plain price. A merchant's own rules come before the world's; the two dimensions
  multiply. He pays for what he buys below value (default 50 %), divided by the same factor - and never
  more than he would ask for it.
- **Players trade on their own**: no approval, nothing for the GM to click. The trade is carried out by the
  connected GM's client (players cannot write the GM's merchant); without a GM the shop can be browsed only.
  Each trade is whispered to the GMs.
- **Restocking**: *Restock* on the sheet or in the market window, or by itself after a period (default:
  24 hours of real time, to match the next session; game time optional). A restock replaces a share of the
  stock (turnover), fills up what was sold and refills custom stock.
- **Market**: the store icon in the token controls lists the merchants on the scene; players open the shops
  from there, the GM sets the scene's level and restocks all.

## Setting up

- New merchant: in the studio (*Merchants* → template, name, level → *New merchant*), or right-click an actor
  → *Make merchant*. The picture defaults to Foundry's market stall icon; click it on the sheet to change it.
- The *Merchant* tab (GM only) holds everything: race, profession, level, prices, own rules, stock types,
  sources, filter, stock size, turnover, restock period, custom stock (drop items), purse.
- Place him: drag the actor onto a scene, *Place* in the studio's merchants table, or several as a market
  (*Market on scene* → an encounter draft). A placed merchant stocks himself at once.
- Players need a character they own; they open the shop by double-clicking the token or from the market.

## System adapters

`scripts/systems/<id>.mjs` registers what the system contributes (`scripts/adapter.mjs` lists it): prices
and money, levels, races and professions as rule keys, the item types that can change hands, default
sources and merchant templates.

- **dnd5e**: coins with change (copper is the unit, platinum broken last, no change in electrum), species
  and class identifiers, the class with the most levels counts, item levels by rarity (common 1, uncommon 3,
  rare 5, very rare 11, legendary 17, artifact 20 - editable), SRD 2024 equipment as default stock;
  templates general store, blacksmith, alchemist, scribe, arcanist.
- **Any other system**: data paths for price, money, quantity, level, race and profession in the module
  settings. A ketib adapter is planned (ROADMAP).

## API

`game.modules.get("dewarim-merchants").api` (from `ready`): `isMerchant`, `config`, `configure(actor,
patch)`, `createMerchant({name, template, level, race, profession, img})`, `templates()`,
`placeMerchant(scene, actor, {x, y})`, `merchantTokens(scene)`, `sceneLevel` / `setSceneLevel`,
`restock(token, {force})`, `restockAll(tokens)`, `openShop(token)`, `openMarket()`, `openRules()`, and for
content builds `references(actor)` and `prepareExport(documentName, data)`.
