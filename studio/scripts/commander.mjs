// What dropping a document of type A onto a document of type B means - defined once per pair, used by
// the commander view. Other modules (or later steps) add pairs with registerDropRule.
import {addToActor, createChest, encounterSupport, itemData, sceneChests, worldActor} from "./encounter.mjs";
import {expandName, freeStagingPositions} from "./encounter-model.mjs";
import {activeProject, assign} from "./project.mjs";

/**
 * What the game system adds to compendium columns: extra index fields to load and a short badge per
 * entry (dnd5e: "CR 1/4", "rare"). Set by a system adapter.
 * @type {{indexFields?: Record<string, string[]>, badge?: (entry: object, documentName: string) => string}}
 */
export const sourceSupport = {};

export function registerSourceSupport(support) {
  Object.assign(sourceSupport, support);
}

/** @type {Map<string, {label: string, accepts?: (target: ClientDocument) => boolean, handler: (source: ClientDocument, target: ClientDocument, options: object) => Promise<string>}>} */
const rules = new Map();

/**
 * @param {string} sourceType  document name being dropped ("Item")
 * @param {string} targetType  document name dropped onto ("Actor")
 * @param {{label: string, accepts?: Function, handler: Function}} rule  handler returns a short message for
 *   the notification; accepts narrows the targets (only group actors, only container items)
 */
export function registerDropRule(sourceType, targetType, rule) {
  rules.set(`${sourceType}>${targetType}`, rule);
}

export function dropRule(sourceType, targetType) {
  return rules.get(`${sourceType}>${targetType}`);
}

/** Pairs that have a rule, for hints in the UI: {Actor: ["Item", ...]} = what an Actor row accepts. */
export function acceptedBy(targetType) {
  return [...rules.keys()].filter(k => k.endsWith(`>${targetType}`)).map(k => k.split(">")[0]);
}

/** A world document for a dropped one: compendium documents are copied in (and join the project). */
async function worldDocument(source) {
  if ( !source.pack ) return source;
  if ( source instanceof Actor ) return worldActor(source);
  const collection = game.collections.get(source.documentName);
  const [doc] = await source.constructor.createDocuments([collection.fromCompendium(source)]);
  const project = activeProject();
  if ( project ) await assign([doc], project);
  return doc;
}

/** Whether a rule applies to this particular target (a rule without `accepts` takes every one). */
export function ruleAccepts(rule, target) {
  return !!rule && (!rule.accepts || !target || rule.accepts(target));
}

/**
 * Roll a table without marking results drawn (compendium tables are read-only): the items it gives,
 * and the names of everything else (text results).
 * @param {RollTable} table
 * @returns {Promise<{items: Item[], other: string[], total: number}>}
 */
async function rollForItems(table) {
  const {roll, results} = await table.roll();
  const items = [];
  const other = [];
  for ( const result of results ) {
    const doc = (result.type === CONST.TABLE_RESULT_TYPES.DOCUMENT) && result.documentUuid ? await fromUuid(result.documentUuid) : null;
    if ( doc instanceof Item ) items.push(doc);
    else other.push(result.name || result.description || "?");
  }
  return {items, other, total: roll.total};
}

/** "Potion of Healing, Dagger" or "–" */
function listNames(names) {
  return names.length ? names.join(", ") : "–";
}

/** Free staging cells on a scene, given what is placed there already. */
function nextCells(scene, footprints) {
  const grid = scene.grid.size;
  const occupied = scene.tokens.map(t => ({x: t.x, y: t.y, w: t.width, h: t.height}));
  return freeStagingPositions(scene.dimensions.sceneRect, grid, occupied, footprints);
}

/* -------------------------------------------- */
/*  Built-in rules                              */
/* -------------------------------------------- */

// Item -> Actor: give it. Where the system has quantities, an item of the same name and type stacks.
registerDropRule("Item", "Actor", {
  label: "DEWARIM_STUDIO.Commander.Rule.Give",
  async handler(item, actor) {
    const path = encounterSupport.quantityPath;
    const same = path && actor.items.find(i => (i.name === item.name) && (i.type === item.type));
    if ( same ) {
      const quantity = (foundry.utils.getProperty(same, path) ?? 1) + 1;
      await same.update({[path]: quantity});
      return _loc("DEWARIM_STUDIO.Commander.Stacked", {item: item.name, actor: actor.name, quantity});
    }
    await actor.createEmbeddedDocuments("Item", [itemData(item, 1)]);
    return _loc("DEWARIM_STUDIO.Commander.Given", {item: item.name, actor: actor.name});
  }
});

// Actor -> Scene: place a token on the next free staging cell, hidden. A linked actor (a named NPC)
// goes as itself; a type gets a numbered, unlinked token ("Goblin 3").
registerDropRule("Actor", "Scene", {
  label: "DEWARIM_STUDIO.Commander.Rule.Place",
  async handler(source, scene) {
    const actor = await worldDocument(source);
    const linked = actor.prototypeToken.actorLink;
    if ( linked && scene.tokens.some(t => t.actorId === actor.id) ) {
      return _loc("DEWARIM_STUDIO.Commander.AlreadyThere", {actor: actor.name, scene: scene.name});
    }
    const [position] = nextCells(scene, [{w: actor.prototypeToken.width, h: actor.prototypeToken.height}]);
    const typeName = actor.prototypeToken.name || actor.name;
    const n = scene.tokens.filter(t => t.actorId === actor.id).length + 1;
    const token = await actor.getTokenDocument({
      ...position,
      hidden: true,
      ...(linked ? {} : {name: expandName("{name} {n}", {name: typeName, n}), actorLink: false})
    });
    await scene.createEmbeddedDocuments("Token", [token.toObject()]);
    const project = activeProject();
    if ( project ) await assign([scene], project);
    return _loc("DEWARIM_STUDIO.Commander.Placed", {name: token.name, scene: scene.name});
  }
});

// Item -> Scene: into the scene's chest (the newest), or a new chest as a hidden token.
registerDropRule("Item", "Scene", {
  label: "DEWARIM_STUDIO.Commander.Rule.Chest",
  async handler(item, scene) {
    const [existing] = sceneChests(scene);
    if ( existing ) {
      await addToActor(existing, [itemData(item, 1)]);
      return _loc("DEWARIM_STUDIO.Commander.AddedToChest", {item: item.name, chest: existing.name});
    }
    const chest = await createChest(_loc("DEWARIM_STUDIO.Encounter.ChestDefault", {scene: scene.name}), [itemData(item, 1)]);
    const project = activeProject();
    if ( project ) await assign([scene], project);
    const [position] = nextCells(scene, [{w: 1, h: 1}]);
    const token = await chest.getTokenDocument({...position, hidden: true});
    await scene.createEmbeddedDocuments("Token", [token.toObject()]);
    return _loc("DEWARIM_STUDIO.Commander.ChestPlaced", {item: item.name, scene: scene.name});
  }
});

// RollTable -> Actor: roll it, give the items it yields (treasure on a goblin). Text results are named.
registerDropRule("RollTable", "Actor", {
  label: "DEWARIM_STUDIO.Commander.Rule.RollGive",
  async handler(table, actor) {
    const {items, other, total} = await rollForItems(table);
    if ( items.length ) await addToActor(actor, items.map(i => itemData(i, 1)));
    return _loc("DEWARIM_STUDIO.Commander.Rolled", {table: table.name, total, items: listNames(items.map(i => i.name)),
      other: listNames(other), target: actor.name});
  }
});

// RollTable -> Scene: roll it, the items go into the scene's chest (or a new one).
registerDropRule("RollTable", "Scene", {
  label: "DEWARIM_STUDIO.Commander.Rule.RollChest",
  async handler(table, scene) {
    const {items, other, total} = await rollForItems(table);
    let chest = sceneChests(scene)[0];
    if ( items.length ) {
      const data = items.map(i => itemData(i, 1));
      if ( chest ) await addToActor(chest, data);
      else {
        chest = await createChest(_loc("DEWARIM_STUDIO.Encounter.ChestDefault", {scene: scene.name}), data);
        const [position] = nextCells(scene, [{w: 1, h: 1}]);
        const token = await chest.getTokenDocument({...position, hidden: true});
        await scene.createEmbeddedDocuments("Token", [token.toObject()]);
        const project = activeProject();
        if ( project ) await assign([scene], project);
      }
    }
    return _loc("DEWARIM_STUDIO.Commander.Rolled", {table: table.name, total, items: listNames(items.map(i => i.name)),
      other: listNames(other), target: chest?.name ?? scene.name});
  }
});

// Macro -> Scene: a region in the middle of the scene that runs the macro when a token enters it
// (a trap, a trigger). Move and resize it on the canvas; it is only shown on the Regions layer.
registerDropRule("Macro", "Scene", {
  label: "DEWARIM_STUDIO.Commander.Rule.Region",
  async handler(source, scene) {
    const macro = await worldDocument(source);
    const rect = scene.dimensions.sceneRect;
    const size = scene.grid.size * 2;
    await scene.createEmbeddedDocuments("Region", [{
      name: macro.name,
      color: "#d9a400",
      shapes: [{type: "rectangle", x: Math.round(rect.x + ((rect.width - size) / 2)), y: Math.round(rect.y + ((rect.height - size) / 2)),
        width: size, height: size}],
      behaviors: [{name: macro.name, type: "executeMacro",
        system: {uuid: macro.uuid, events: [CONST.REGION_EVENTS.TOKEN_ENTER], everyone: false}}]
    }]);
    const project = activeProject();
    if ( project ) await assign([macro, scene], project);
    return _loc("DEWARIM_STUDIO.Commander.RegionPlaced", {macro: macro.name, scene: scene.name});
  }
});

// JournalEntry -> Scene: a note in the middle of the scene; the first one also becomes the scene's journal.
registerDropRule("JournalEntry", "Scene", {
  label: "DEWARIM_STUDIO.Commander.Rule.Note",
  async handler(source, scene) {
    const entry = await worldDocument(source);
    const rect = scene.dimensions.sceneRect;
    await scene.createEmbeddedDocuments("Note", [{
      entryId: entry.id,
      x: Math.round(rect.x + (rect.width / 2)),
      y: Math.round(rect.y + (rect.height / 2)),
      texture: {src: "icons/svg/book.svg"}
    }]);
    if ( !scene.journal ) await scene.update({journal: entry.id});
    const project = activeProject();
    if ( project ) await assign([entry, scene], project);
    return _loc("DEWARIM_STUDIO.Commander.NotePlaced", {entry: entry.name, scene: scene.name});
  }
});

// Playlist -> Scene: the scene's playlist.
registerDropRule("Playlist", "Scene", {
  label: "DEWARIM_STUDIO.Commander.Rule.Playlist",
  async handler(source, scene) {
    const playlist = await worldDocument(source);
    await scene.update({playlist: playlist.id, playlistSound: null});
    const project = activeProject();
    if ( project ) await assign([playlist, scene], project);
    return _loc("DEWARIM_STUDIO.Commander.PlaylistSet", {playlist: playlist.name, scene: scene.name});
  }
});
