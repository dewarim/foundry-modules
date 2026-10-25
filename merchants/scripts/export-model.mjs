// What a content build (dewarim-studio) needs to know about merchants, through the API: what a
// merchant's configuration depends on, and how a scene's merchant tokens are cleaned for export.
// No Foundry globals - covered by test/export-model.test.mjs.

/**
 * The documents and compendiums a merchant's configuration names: custom stock and single-item sources
 * as UUIDs, compendium sources as "package.pack", folders by UUID (the caller adds their items).
 * @param {{sources: string[], fixed: {uuid: string}[]}} cfg
 * @param {(id: string) => boolean} isPack   is this source a compendium id?
 * @returns {{uuids: string[], packs: string[], folders: string[]}}
 */
export function configReferences(cfg, isPack) {
  const uuids = new Set(cfg.fixed.map(f => f.uuid));
  const packs = new Set();
  const folders = new Set();
  for ( const source of cfg.sources ) {
    if ( isPack(source) ) packs.add(source);
    else if ( source.startsWith("Folder.") ) folders.add(source);
    else uuids.add(source);
  }
  for ( const uuid of uuids ) {
    // A compendium entry's pack counts as a reference too
    const match = uuid.match(/^Compendium\.([^.]+)\.([^.]+)\./);
    if ( match ) packs.add(`${match[1]}.${match[2]}`);
  }
  return {uuids: [...uuids], packs: [...packs], folders: [...folders]};
}

/**
 * Scene data for export: placed merchants keep their stock but lose their restock state, so the play
 * world restocks them on the first visit (custom stock already in it stays, as stock).
 * @param {object} data   a Scene's toObject()/toCompendium() data, changed in place
 * @param {string} moduleId
 */
export function clearMerchantState(data, moduleId) {
  for ( const token of data.tokens ?? [] ) {
    const flags = token.flags?.[moduleId];
    if ( !flags?.state ) continue;
    delete flags.state;
    if ( !Object.keys(flags).length ) delete token.flags[moduleId];
  }
  return data;
}
