// Encounter actions: everything that turns "3 goblins with a sword each, a chest with gold" into
// documents. Kept apart from the window so the commander views (ROADMAP step 5) can reuse the same
// "drop item on actor" and "drop actor on scene" logic.
import {clusterPositions, expandName, namesFor, planLoot, stackItems, stagingPositions} from "./encounter-model.mjs";
import {MODULE_ID, activeProject, assign} from "./project.mjs";

const CHEST_IMG = "icons/svg/chest.svg";

/**
 * What the game system contributes: how to override HP on a token, where an item keeps its quantity,
 * which actor type can serve as a loot chest. Set by a system adapter (systems/dnd5e.mjs).
 * hpPath: where an actor keeps {value, max} - the scene contents view reads and writes it.
 * rating: the encounter's difficulty against a party, and the parties themselves (see systems/dnd5e.mjs):
 *   parties(), primary(), heroes(id) -> [{id, name, img, level, counted}], creature(actor) -> {xp, cr, label},
 *   rate(xp, levels) -> {rating, xp, budget, pct, stops, level}, createParty(name, actors),
 *   addToParty(id, actor), removeFromParty(id, actorId), makePrimary(id), openParty(id).
 * @type {{hpDelta?: (actor: Actor, hp: object) => Promise<object|null>, quantityPath?: string, hpPath?: string,
 *   chestType?: string, rating?: object}}
 */
export const encounterSupport = {};

export function registerEncounterSupport(support) {
  Object.assign(encounterSupport, support);
}

/**
 * A world actor for a dropped one: compendium actors are copied into the world (once per call site -
 * the caller keeps a cache), world actors are used as they are. Either way it joins the active project.
 * @param {Actor} source
 * @returns {Promise<Actor>}
 */
export async function worldActor(source) {
  let actor = source;
  if ( source.pack ) [actor] = await Actor.implementation.createDocuments([game.actors.fromCompendium(source)]);
  const project = activeProject();
  if ( project ) await assign([actor], project);
  return actor;
}

/**
 * Embedded item data from an Item (world or compendium), with a quantity where the system has one.
 * @param {Item} source
 * @param {number} quantity
 */
export function itemData(source, quantity = 1) {
  const data = source.pack ? game.items.fromCompendium(source, {keepId: false}) : source.toObject();
  data._id = foundry.utils.randomID();
  delete data.folder;
  delete data.sort;
  if ( encounterSupport.quantityPath ) foundry.utils.setProperty(data, encounterSupport.quantityPath, quantity);
  return data;
}

/**
 * The loot chests on a scene: linked actors with a token there that the studio made as chests (flag
 * `chest`; older ones by the system's chest type and the chest icon). Newest first.
 * @param {Scene} scene
 * @returns {Actor[]}
 */
export function sceneChests(scene) {
  const chests = new Map();
  for ( const token of scene?.tokens ?? [] ) {
    const actor = token.actorLink ? token.actor : null;
    if ( !actor || chests.has(actor.id) ) continue;
    const flagged = actor.getFlag(MODULE_ID, "chest");
    const legacy = (actor.type === encounterSupport.chestType) && (actor.img === CHEST_IMG);
    if ( flagged || legacy ) chests.set(actor.id, actor);
  }
  return [...chests.values()].sort((a, b) => (b._stats.createdTime ?? 0) - (a._stats.createdTime ?? 0));
}

/**
 * A new chest actor holding item data, in the project. Its token is the caller's business.
 * @param {string} name
 * @param {object[]} items  embedded item data
 */
export async function createChest(name, items) {
  const type = encounterSupport.chestType ?? Actor.TYPES.find(t => t !== "base");
  const [chest] = await Actor.implementation.createDocuments([{
    name,
    type,
    img: CHEST_IMG,
    items,
    prototypeToken: {texture: {src: CHEST_IMG}, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL, actorLink: true},
    flags: {[MODULE_ID]: {chest: true}}
  }]);
  const project = activeProject();
  if ( project ) await assign([chest], project);
  return chest;
}

/**
 * Put item data into an existing actor: what it has already (same name and type) stacks, the rest is added.
 * @param {Actor} actor
 * @param {object[]} items  embedded item data
 */
export async function addToActor(actor, items) {
  const path = encounterSupport.quantityPath;
  const quantity = d => (path ? foundry.utils.getProperty(d, path) : 1) ?? 1;
  const existing = actor.items.map(i => ({id: i.id, name: i.name, type: i.type, quantity: quantity(i)}));
  const plan = stackItems(existing, items.map(d => ({name: d.name, type: d.type, quantity: quantity(d)})), !!path);
  if ( plan.updates.length ) await actor.updateEmbeddedDocuments("Item", plan.updates.map(u => ({_id: u.id, [path]: u.quantity})));
  if ( plan.create.length ) await actor.createEmbeddedDocuments("Item", plan.create.map(i => items[i]));
}

/** Give items to an actor (a world actor, or a token's synthetic actor - then they land in its delta). */
export async function giveItems(actor, items) {
  return actor.createEmbeddedDocuments("Item", items.map(i => itemData(i.source, i.quantity)));
}

/**
 * Create an encounter on a scene in one createEmbeddedDocuments call.
 * @param {Scene} scene
 * @param {object} plan
 * @param {{actor: Actor, kind: "group"|"named"|"unique", count: number, pattern: string, hp: object,
 *   hidden: boolean, disposition: number}[]} plan.mobs  a "unique" row has count 1
 * @param {{source: Item, quantity: number, target: string}[]} plan.loot
 * @param {{x: number, y: number}|null} plan.origin  clicked point, or null for the staging row
 * @param {string} plan.chestName       name of a new chest
 * @param {Actor|null} [plan.chest]      an existing chest on the scene to put the leftover loot in
 * @returns {Promise<{tokens: number, chest: Actor|null, reused: boolean, named: string[]}>}
 */
export async function createEncounter(scene, {mobs, loot, origin, chestName, chest: existingChest = null}) {
  const lootPlan = planLoot(mobs, loot);
  const lootFor = indices => indices.map(i => itemData(loot[i].source, loot[i].quantity));

  // The loot that belongs to nobody: into the chosen chest, or one new chest (with its own token)
  let chest = null;
  let reused = false;
  if ( lootPlan.chest.length ) {
    if ( existingChest ) {
      await addToActor(existingChest, lootFor(lootPlan.chest));
      chest = existingChest;
      reused = true;
    }
    else chest = await createChest(chestName, lootFor(lootPlan.chest));
  }
  const newChest = chest && !reused;

  // One entry per token, in token order (all of row 0, row 1 ...). Kinds:
  //   group  - unlinked tokens of the type ("Wolf 1"), HP and loot in each token's delta
  //   named  - each token gets its own world actor and a linked token, so it can leave this scene and
  //            turn up in another with its HP and loot ("Grimtooth")
  //   unique - the actor is linked already (a named NPC placed before): placed as itself, not copied
  const entries = [];
  for ( const mob of mobs ) {
    const typeName = mob.actor.prototypeToken.name || mob.actor.name;
    if ( mob.kind === "unique" ) entries.push({mob, name: mob.actor.name});
    else if ( mob.kind === "named" ) namesFor(mob.pattern, mob.count, typeName).forEach(name => entries.push({mob, name}));
    else for ( let n = 1; n <= mob.count; n++ ) entries.push({mob, name: expandName(mob.pattern, {name: typeName, n})});
  }

  // Named creatures: create their actors first, loot and HP on the actor itself
  const actorFor = new Map();
  const namedData = [];
  for ( const [i, {mob, name}] of entries.entries() ) {
    if ( !["unique", "named"].includes(mob.kind) ) continue;
    const hp = await encounterSupport.hpDelta?.(mob.actor, mob.hp);
    if ( mob.kind === "unique" ) {
      if ( lootPlan.tokens[i].length ) await mob.actor.createEmbeddedDocuments("Item", lootFor(lootPlan.tokens[i]));
      if ( hp ) await mob.actor.update({system: hp});
      actorFor.set(i, mob.actor);
    }
    else {
      const data = mob.actor.pack ? game.actors.fromCompendium(mob.actor) : mob.actor.toObject();
      delete data._id;
      delete data.folder;     // the project folder, via assign() below
      delete data.sort;
      data.name = name;
      data.prototypeToken = {...data.prototypeToken, name, actorLink: true};
      data.items = [...data.items, ...lootFor(lootPlan.tokens[i])];
      if ( hp ) data.system = foundry.utils.mergeObject(data.system, hp, {inplace: false});
      data._stats = mob.actor.pack ? {compendiumSource: mob.actor.uuid}
        : {compendiumSource: mob.actor._stats.compendiumSource ?? null, duplicateSource: mob.actor.uuid};
      namedData.push({index: i, data});
    }
  }
  if ( namedData.length ) {
    const created = await Actor.implementation.createDocuments(namedData.map(n => n.data));
    created.forEach((actor, k) => actorFor.set(namedData[k].index, actor));
    const project = activeProject();
    if ( project ) await assign(created, project);
  }

  // Footprints in token order, then the chest
  const footprints = entries.map(({mob}) => ({w: mob.actor.prototypeToken.width, h: mob.actor.prototypeToken.height}));
  if ( newChest ) footprints.push({w: 1, h: 1});
  const grid = scene.grid.size;
  const positions = origin ? clusterPositions(origin, grid, footprints) : stagingPositions(scene.dimensions.sceneRect, grid, footprints);

  const tokens = [];
  for ( const [i, {mob, name}] of entries.entries() ) {
    const placed = {...positions[i], hidden: mob.hidden, disposition: mob.disposition};
    let token;
    if ( actorFor.has(i) ) token = await actorFor.get(i).getTokenDocument({...placed, actorLink: true});
    else {
      const delta = {items: lootFor(lootPlan.tokens[i])};
      const hp = await encounterSupport.hpDelta?.(mob.actor, mob.hp);
      if ( hp ) delta.system = hp;
      token = await mob.actor.getTokenDocument({...placed, name, actorLink: false, delta});
    }
    tokens.push(token.toObject());
  }
  if ( newChest ) {
    const token = await chest.getTokenDocument({...positions.at(-1), hidden: true, actorLink: true});
    tokens.push(token.toObject());
  }
  await scene.createEmbeddedDocuments("Token", tokens);

  const project = activeProject();
  if ( project ) await assign([scene], project);
  return {tokens: entries.length, chest, reused, named: namedData.map(n => n.data.name)};
}

/**
 * Wait for one left click on the canvas and return it in scene coordinates. Escape cancels (null).
 * @returns {Promise<{x: number, y: number}|null>}
 */
export function awaitCanvasClick() {
  return new Promise(resolve => {
    const view = canvas.app.canvas ?? canvas.app.view;
    const finish = result => {
      view.removeEventListener("pointerdown", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      resolve(result);
    };
    const onClick = event => {
      if ( event.button !== 0 ) return;
      event.stopPropagation();
      event.preventDefault();
      finish(canvas.canvasCoordinatesFromClient({x: event.clientX, y: event.clientY}));
    };
    const onKey = event => { if ( event.key === "Escape" ) finish(null); };
    view.addEventListener("pointerdown", onClick, true);
    document.addEventListener("keydown", onKey, true);
  });
}
