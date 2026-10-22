// Which other documents a document depends on - the pure half of the build's dependency closure.
// Works on plain `toObject()` data, so `node --test` covers it (test/refs.test.mjs).

/** Primary document types an Adventure can carry (Adventure.contentFields minus folders and combats). */
export const CONTENT_TYPES = ["Actor", "Cards", "Item", "JournalEntry", "Macro", "Playlist", "RollTable", "Scene"];

const WORLD_UUID = `(?:${CONTENT_TYPES.join("|")})\\.[A-Za-z0-9]{16}`;
const PACK_UUID = String.raw`Compendium\.[^\s\]\)"'.]+\.[^\s\]\)"'.]+\.[A-Z][A-Za-z]+\.[A-Za-z0-9]{16}`;
const UUID_PATTERN = new RegExp(`\\b(${PACK_UUID}|${WORLD_UUID})`, "g");

// Provenance, not dependency: where a document was copied from says nothing about what it needs.
// lastMovedToken is state: dnd5e notes on a character the token it last moved (Scene.<id>.Token.<id>),
// which would otherwise pull any scene the character was ever moved in into the build.
const SKIPPED_KEYS = new Set(["_stats", "sourceId", "compendiumSource", "duplicateSource", "exportSource",
  "lastMovedToken"]);

/**
 * Call fn for every string in a data tree, skipping provenance keys.
 * @param {*} data
 * @param {(value: string) => void} fn
 */
export function walkStrings(data, fn) {
  if ( typeof data === "string" ) return fn(data);
  if ( Array.isArray(data) ) return data.forEach(v => walkStrings(v, fn));
  if ( data && (typeof data === "object") ) {
    for ( const [key, value] of Object.entries(data) ) {
      if ( !SKIPPED_KEYS.has(key) ) walkStrings(value, fn);
    }
  }
}

/**
 * The documents a document refers to.
 * - `world`: "Type.id" of world documents, from UUIDs anywhere in its data (journal text, table results,
 *   region behaviors, system data) and from the id-only fields of a Scene.
 * - `packs`: "package.pack" of every compendium referenced by UUID.
 * @param {string} documentName  e.g. "Scene"
 * @param {object} data          toObject() data
 * @returns {{world: string[], packs: string[]}}
 */
export function findReferences(documentName, data) {
  const world = new Set();
  const packs = new Set();
  walkStrings(data, s => {
    for ( const [, uuid] of s.matchAll(UUID_PATTERN) ) {
      if ( uuid.startsWith("Compendium.") ) {
        const [, pkg, pack] = uuid.split(".");
        packs.add(`${pkg}.${pack}`);
      }
      else world.add(uuid);
    }
  });

  // Fields that hold a bare id instead of a UUID
  if ( documentName === "Scene" ) {
    if ( data.journal ) world.add(`JournalEntry.${data.journal}`);
    if ( data.playlist ) world.add(`Playlist.${data.playlist}`);
    for ( const token of data.tokens ?? [] ) if ( token.actorId ) world.add(`Actor.${token.actorId}`);
    for ( const note of data.notes ?? [] ) if ( note.entryId ) world.add(`JournalEntry.${note.entryId}`);
  }
  return {world: [...world], packs: [...packs]};
}

/**
 * Split "package.pack" references by what they mean for the content module.
 * @param {string[]} packs
 * @param {{moduleId: string, systemId: string}} context
 * @returns {{system: string[], own: string[], modules: Map<string, string[]>}}  modules: package id -> packs
 */
export function classifyPacks(packs, {moduleId, systemId}) {
  const result = {system: [], own: [], modules: new Map()};
  for ( const pack of [...packs].sort() ) {
    const pkg = pack.split(".")[0];
    if ( pkg === systemId ) result.system.push(pack);
    else if ( pkg === moduleId ) result.own.push(pack);
    else {
      if ( !result.modules.has(pkg) ) result.modules.set(pkg, []);
      result.modules.get(pkg).push(pack);
    }
  }
  return result;
}
