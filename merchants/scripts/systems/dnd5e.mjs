// dnd5e adapter: coins (CONFIG.DND5E.currencies, prices in copper), species and classes as rule keys
// (their identifiers), item levels by rarity, the SRD equipment as the default stock. Loaded only when the
// world runs dnd5e. Paths checked against dnd5e 6.0.6: `system.price {value, denomination}`, rarity as the
// set `system.rarities` (the system's own packs still store `system.rarity`), `actor.classes` by identifier.
import {MODULE_ID} from "../merchant.mjs";
import {coinValues, formatCoins, planPayment, planReceipt, purseValue, toCopper} from "./dnd5e-money.mjs";

const PHYSICAL = ["weapon", "equipment", "consumable", "tool", "loot", "container"];
const STACKABLE = ["consumable", "loot"];

/** Item levels per rarity - a setting the GM can change (*Merchants: prices and levels*). */
const RARITY_LEVELS = {common: 1, uncommon: 3, rare: 5, veryRare: 11, legendary: 17, artifact: 20};

const values = () => coinValues(CONFIG.DND5E.currencies);

function rarityOf(entry) {
  const rarities = foundry.utils.getProperty(entry, "system.rarities");
  if ( rarities?.size || rarities?.length ) return [...rarities];
  const rarity = foundry.utils.getProperty(entry, "system.rarity");
  return rarity ? [rarity] : [];
}

/** dnd5e's identifier rule for a name: "Half-Elf" -> "half-elf". */
const identifier = name => String(name ?? "").replaceAll(/(\w+)([\\|/])(\w+)/g, "$1-$3").slugify({strict: true});
const keyOf = entry => foundry.utils.getProperty(entry, "system.identifier") || identifier(entry.name);

/** Rule keys of one item type from the world and every visible compendium, by name. */
async function keysOfType(type) {
  const found = new Map();
  const add = entry => {
    const key = keyOf(entry);
    if ( key && !found.has(key) ) found.set(key, {key, label: entry.name});
  };
  game.items.filter(i => i.type === type).forEach(add);
  for ( const actor of game.actors ) actor.items.filter(i => i.type === type).forEach(add);
  for ( const pack of game.packs.filter(p => (p.documentName === "Item") && p.visible) ) {
    const index = await pack.getIndex({fields: ["system.identifier"]});
    index.filter(e => e.type === type).forEach(add);
  }
  return [...found.values()].sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}

function species(actor) {
  const race = actor.system.details?.race;
  if ( race instanceof Item ) return race.identifier;
  return actor.items.find(i => i.type === "race")?.identifier ?? "";
}

/** The class with the most levels counts for a multiclass character. */
function mainClass(actor) {
  const classes = Object.values(actor.classes ?? {});
  classes.sort((a, b) => (b.system.levels ?? 0) - (a.system.levels ?? 0));
  return classes[0]?.identifier ?? "";
}

const T = key => _loc(`DEWARIM_MERCHANTS.Dnd5e.${key}`);

export function register({registerAdapter}) {
  registerAdapter({
    id: "dnd5e",
    actorType: "npc",
    itemTypes: () => PHYSICAL.map(id => ({id, label: _loc(CONFIG.Item.typeLabels[id] ?? id)})),
    sellable: entry => PHYSICAL.includes(entry?.type),
    indexFields: ["system.price", "system.rarity", "system.rarities", "system.type.value", "system.weight", "system.identifier"],
    filterFields: {
      rarity: {get: rarityOf},
      magic: {get: e => (rarityOf(e).length ? 1 : 0)},
      subtype: {path: "system.type.value"},
      weight: {get: e => {
        const w = foundry.utils.getProperty(e, "system.weight");
        return (w && (typeof w === "object")) ? w.value : w;
      }}
    },
    quantityPath: "system.quantity",
    get unit() {
      return {label: _loc(CONFIG.DND5E.currencies.gp.abbreviation), value: values().gp};
    },
    basePrice(entry) {
      const price = foundry.utils.getProperty(entry, "system.price");
      if ( (price === null) || (price === undefined) ) return 0;
      if ( typeof price !== "object" ) return toCopper(price, "gp", values());
      return toCopper(price.value, price.denomination || "gp", values());
    },
    formatPrice(amount) {
      const labels = Object.fromEntries(Object.entries(CONFIG.DND5E.currencies).map(([k, c]) => [k, _loc(c.abbreviation)]));
      return formatCoins(amount, values(), labels);
    },
    systemLevel(entry) {
      const levels = {...RARITY_LEVELS, ...game.settings.get(MODULE_ID, "systemLevels")};
      const known = rarityOf(entry).map(r => Number(levels[r])).filter(Number.isFinite);
      return known.length ? Math.max(...known) : null;
    },
    levelSettings: () => Object.entries(RARITY_LEVELS).map(([key, value]) => ({
      key, label: _loc(CONFIG.DND5E.itemRarity[key] ?? key), default: value
    })),
    stackable: entry => STACKABLE.includes(entry?.type),
    buyer(actor) {
      const level = actor.system.details?.level ?? Math.round(actor.system.details?.cr ?? 1);
      return {level: Number(level) || 1, race: species(actor), profession: mainClass(actor)};
    },
    races: () => keysOfType("race"),
    professions: () => keysOfType("class"),
    /** The highest level among the primary party's characters. */
    partyLevel() {
      const members = game.actors.party?.system.members?.map(m => m.actor).filter(a => a?.type === "character") ?? [];
      const levels = members.map(a => a.system.details?.level ?? 0).filter(n => n > 0);
      return levels.length ? Math.max(...levels) : null;
    },
    funds: actor => (actor.system.currency ? purseValue(actor.system.currency, values()) : null),
    async pay(actor, amount) {
      if ( !actor.system.currency ) return false;
      if ( amount <= 0 ) return true;
      const after = planPayment(actor.system.currency, amount, values());
      if ( !after ) return false;
      await actor.update({"system.currency": after});
      return true;
    },
    async receive(actor, amount) {
      if ( !actor.system.currency || (amount <= 0) ) return;
      await actor.update({"system.currency": planReceipt(actor.system.currency, amount, values())});
    },
    /** The 2024 SRD equipment, or the 2014 one in a world without it. */
    defaultSources: () => ["dnd5e.equipment24", "dnd5e.items"].filter(id => game.packs.has(id)).slice(0, 1),
    templates: () => [
      {id: "general", label: T("General"), itemTypes: ["loot", "tool", "consumable", "container"], filter: "magic=0"},
      {id: "blacksmith", label: T("Blacksmith"), itemTypes: ["weapon", "equipment"],
        filter: "magic=0 subtype!=trinket subtype!=clothing subtype!=ring subtype!=rod subtype!=wand subtype!=wondrous"},
      {id: "alchemist", label: T("Alchemist"), itemTypes: ["consumable"], filter: "subtype=potion"},
      {id: "scribe", label: T("Scribe"), itemTypes: ["consumable"], filter: "subtype=scroll"},
      {id: "arcanist", label: T("Arcanist"), itemTypes: ["weapon", "equipment", "consumable"], filter: "magic=1"}
    ]
  });
}
