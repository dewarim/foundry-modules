// dnd5e adapter for the tables: column presets with the choices dnd5e keeps in CONFIG.DND5E instead of
// its schema. Loaded only when the world runs dnd5e. Paths checked against dnd5e 6.0.6 (movement is a
// map of formulas, `system.attributes.movement.speeds.<type>`; rarity is the set `system.rarities`).

import {typeChoices} from "../columns.mjs";
import {MODULE_ID} from "../project.mjs";
import {partyBudget, partyLevel, rate} from "./dnd5e-rating.mjs";

const DND5E = () => CONFIG.DND5E;
const PHYSICAL = ["weapon", "equipment", "consumable", "tool", "loot", "container"];

/** "1/4" for 0.25: challenge ratings are written as fractions. */
function crLabel(cr) {
  if ( (cr === null) || (cr === undefined) || (cr === "") ) return "";
  const fractions = {0.125: "1/8", 0.25: "1/4", 0.5: "1/2"};
  return `CR ${fractions[cr] ?? cr}`;
}

export function register({registerPreset, registerEncounterSupport, registerSourceSupport, registerDropRule}) {
  // Actor -> group or encounter actor: a member. A group takes world actors (a compendium actor is
  // copied in first), an encounter takes NPCs and counts repeats up.
  registerDropRule("Actor", "Actor", {
    label: "DEWARIM_STUDIO.Commander.Rule.Member",
    accepts: target => ["group", "encounter"].includes(target.type),
    async handler(source, target) {
      if ( source === target ) throw new Error(_loc("DEWARIM_STUDIO.Commander.SelfDrop"));
      let actor = source;
      if ( (target.type === "group") && source.pack ) {
        [actor] = await Actor.implementation.createDocuments([game.actors.fromCompendium(source)]);
      }
      await target.system.addMember(actor);
      return _loc("DEWARIM_STUDIO.Commander.MemberAdded", {actor: actor.name, group: target.name});
    }
  });

  // Item -> container item: a copy goes inside (with its own contents, if it is a container too)
  registerDropRule("Item", "Item", {
    label: "DEWARIM_STUDIO.Commander.Rule.Container",
    accepts: target => target.type === "container",
    async handler(source, target) {
      if ( source === target ) throw new Error(_loc("DEWARIM_STUDIO.Commander.SelfDrop"));
      const Item5e = Item.implementation;
      const data = await Item5e.createWithContents([source], {container: target});
      // A world container keeps its contents in its own sidebar folder, as dnd5e's sheet does
      if ( !target.parent && !target.pack ) data.forEach(d => { d.folder = target.folder?.id ?? null; });
      await Item5e.createDocuments(data, {parent: target.parent, pack: target.pack, keepId: true});
      return _loc("DEWARIM_STUDIO.Commander.PutInContainer", {item: source.name, container: target.name});
    }
  });

  registerSourceSupport({
    // Compendium indexes read the stored data, which in dnd5e 6.0.6's own packs still has the old
    // `system.rarity` string - only migrated documents have the `system.rarities` set
    indexFields: {Actor: ["system.details.cr"], Item: ["system.rarities", "system.rarity"]},
    // Condition keys for filter fields ("cr<=2", "rarity=rare", "level>=3"); `get` for values whose
    // stored shape differs between the system's packs and migrated documents
    filterFields: {
      Actor: {
        cr: {path: "system.details.cr"},
        level: {path: "system.details.level"},
        hp: {path: "system.attributes.hp.max"}
      },
      Item: {
        rarity: {get: rarityOf, fields: ["system.rarities", "system.rarity"]},
        level: {path: "system.level"},
        price: {get: e => valueOf(e, "system.price"), fields: ["system.price"]},
        weight: {get: e => valueOf(e, "system.weight"), fields: ["system.weight"]}
      }
    },
    badge(entry, documentName) {
      if ( documentName === "Actor" ) return crLabel(foundry.utils.getProperty(entry, "system.details.cr"));
      if ( documentName === "Item" ) {
        const first = rarityOf(entry)[0];
        return first ? (CONFIG.DND5E.itemRarity[first] ?? first) : "";
      }
      return "";
    }
  });

  registerEncounterSupport({
    rating: RATING,
    quantityPath: "system.quantity",
    hpPath: "system.attributes.hp",
    chestType: "group",       // dnd5e's group actor has an inventory and nothing else to fill in
    async hpDelta(actor, hp) {
      if ( !["npc", "character"].includes(actor.type) || (hp.mode === "default") ) return null;
      let value = hp.value;
      if ( hp.mode === "roll" ) {
        const formula = actor.system.attributes?.hp?.formula;
        if ( !formula ) return null;
        const roll = await new Roll(formula, actor.getRollData()).evaluate();
        value = Math.max(1, roll.total);
      }
      return {attributes: {hp: {value, max: value}}};
    }
  });

  registerPreset("Actor", "dnd5e-npc", {
    label: "DEWARIM_STUDIO.Table.Preset.Dnd5eNpc",
    types: ["npc"],
    columns: [
      {path: "name"},
      {path: "img", type: "image"},
      {path: "prototypeToken.texture.src", type: "image", label: "DEWARIM_STUDIO.Table.Column.TokenImage"},
      {path: "system.details.cr", types: ["npc"]},
      {path: "system.details.type.value", types: ["npc"], choices: () => DND5E().creatureTypes},
      {path: "system.traits.size", types: ["npc", "character"], choices: () => DND5E().actorSizes},
      {path: "system.details.alignment", types: ["npc", "character"]},
      {path: "system.attributes.hp.max", types: ["npc"]},
      {path: "system.attributes.hp.value", types: ["npc", "character"]},
      {path: "system.attributes.hp.formula", types: ["npc"]},
      {path: "system.attributes.ac.calc", types: ["npc", "character"], choices: () => DND5E().armorClasses},
      {path: "system.attributes.ac.flat", types: ["npc", "character"]},
      {path: "system.attributes.ac.value", types: ["npc", "character"], derived: true,
        label: "DEWARIM_STUDIO.Table.Column.AcResult"},
      {path: "system.attributes.movement.speeds.walk", types: ["npc", "character"], type: "formula",
        label: "DEWARIM_STUDIO.Table.Column.Walk"},
      {path: "prototypeToken.disposition"}
    ]
  });

  registerPreset("Actor", "dnd5e-abilities", {
    label: "DEWARIM_STUDIO.Table.Preset.Dnd5eAbilities",
    types: ["npc", "character"],
    columns: [
      {path: "name"},
      ...["str", "dex", "con", "int", "wis", "cha"].map(a => ({
        path: `system.abilities.${a}.value`, types: ["npc", "character"], label: CONFIG.DND5E.abilities[a]?.label ?? a
      }))
    ]
  });

  registerPreset("Item", "dnd5e-physical", {
    label: "DEWARIM_STUDIO.Table.Preset.Dnd5ePhysical",
    types: PHYSICAL,
    columns: [
      {path: "name"},
      {path: "img", type: "image"},
      {path: "type", readonly: true, choices: typeChoices},
      {path: "system.type.value", types: PHYSICAL, choices: itemSubtypes, label: "DEWARIM_STUDIO.Table.Column.Subtype"},
      {path: "system.quantity", types: PHYSICAL},
      {path: "system.weight.value", types: PHYSICAL},
      {path: "system.price.value", types: PHYSICAL},
      {path: "system.price.denomination", types: PHYSICAL, choices: () => DND5E().currencies},
      {path: "system.rarities", types: PHYSICAL, choices: () => DND5E().itemRarity},
      {path: "system.identified", types: PHYSICAL}
    ]
  });
}

/* -------------------------------------------- */
/*  Encounter rating and parties                */
/* -------------------------------------------- */

/** Group actors that are parties - not the loot chests the encounter editor makes (group actors too). */
function isParty(actor) {
  return (actor?.type === "group") && !actor.getFlag(MODULE_ID, "chest") && (actor.img !== "icons/svg/chest.svg");
}

/** A party member: characters count with their level; anyone else (a companion NPC) is listed, not counted. */
function hero(actor) {
  const counted = actor.type === "character";
  return {id: actor.id, name: actor.name, img: actor.prototypeToken?.texture?.src || actor.img,
    level: counted ? (actor.system.details?.level ?? 0) : null, counted};
}

function partyGroup(id) {
  const group = game.actors.get(id);
  if ( !isParty(group) ) throw new Error(_loc("DEWARIM_STUDIO.Encounter.Party.Gone"));
  return group;
}

/**
 * Encounter difficulty by the 2024 rules (CONFIG.DND5E.ENCOUNTER_DIFFICULTY), against a party: a group
 * actor (dnd5e's primary party first), the player-owned characters, or a party size and level the editor
 * keeps. Parties are dnd5e group actors, managed from the editor: new, members in and out, primary.
 */
const RATING = {
  /** @returns {{id: string, name: string, primary: boolean}[]} */
  parties() {
    const primary = game.actors.party;
    return game.actors.filter(isParty).map(a => ({id: a.id, name: a.name, primary: a === primary}))
      .sort((a, b) => (b.primary - a.primary) || a.name.localeCompare(b.name, game.i18n.lang));
  },

  primary: () => (isParty(game.actors.party) ? game.actors.party.id : null),

  /** The members of a party (group actor id), or of "players": every character a player owns. */
  heroes(id) {
    if ( id === "players" ) return game.actors.filter(a => (a.type === "character") && a.hasPlayerOwner).map(hero);
    const group = game.actors.get(id);
    return isParty(group) ? group.system.members.map(m => m.actor).filter(Boolean).map(hero) : [];
  },

  /** What a creature row is worth: NPCs only (their XP includes a lair). */
  creature(actor) {
    if ( actor?.type !== "npc" ) return null;
    const cr = actor.system.details?.cr ?? null;
    return {xp: actor.system.details?.xp?.value ?? null, cr, label: crLabel(cr)};
  },

  rate(xp, levels) {
    return {...rate(xp, partyBudget(levels, CONFIG.DND5E.ENCOUNTER_DIFFICULTY)), level: partyLevel(levels)};
  },

  /** A new party with these actors in it; the primary one if there is none yet. */
  async createParty(name, actors) {
    const [group] = await Actor.implementation.createDocuments([{name, type: "group", img: "icons/svg/combat.svg",
      system: {members: actors.map(a => ({actor: a.id}))}}]);
    if ( !game.actors.party ) await game.settings.set("dnd5e", "primaryParty", {actor: group});
    return group;
  },

  /** Add an actor to a party; one from a compendium is copied into the world first. */
  async addToParty(id, actor) {
    const group = partyGroup(id);
    if ( actor.pack ) [actor] = await Actor.implementation.createDocuments([game.actors.fromCompendium(actor)]);
    await group.system.addMember(actor);
    return actor;
  },

  removeFromParty: (id, actorId) => partyGroup(id).system.removeMember(actorId),

  makePrimary: id => game.settings.set("dnd5e", "primaryParty", {actor: partyGroup(id)}),

  openParty: id => partyGroup(id).sheet.render({force: true})
};

/** An item's rarities as a list - migrated documents have the `system.rarities` set, the packs `system.rarity`. */
function rarityOf(entry) {
  const rarities = foundry.utils.getProperty(entry, "system.rarities");
  if ( rarities?.size || rarities?.length ) return [...rarities];
  const rarity = foundry.utils.getProperty(entry, "system.rarity");
  return rarity ? [rarity] : [];
}

/** `system.weight` / `system.price` are {value, ...} now; older stored data has the bare number. */
function valueOf(entry, path) {
  const v = foundry.utils.getProperty(entry, path);
  return (v && (typeof v === "object")) ? v.value : v;
}

/** The subtype list differs per item type: loot types for loot, weapon types for weapons ... */
function itemSubtypes(doc) {
  const c = DND5E();
  switch ( doc.type ) {
    case "weapon": return c.weaponTypes;
    case "equipment": return {...c.armorTypes, ...c.miscEquipmentTypes};
    case "consumable": return c.consumableTypes;
    case "tool": return c.toolTypes;
    case "loot": return c.lootTypes;
    default: return undefined;
  }
}
