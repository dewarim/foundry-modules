// Undo for studio actions: while an action runs, record what this user creates, the previous values of
// what they update and the data of what they delete (Foundry's create/preUpdate/preDelete hooks), then
// take it back on request. Works for any drop
// rule - the system adapter's too - without the rule knowing about undo. Planning is undo-model.mjs.
import {planUndo, previousValues} from "./undo-model.mjs";

/**
 * Run an action and record what it changes.
 * @template T
 * @param {() => Promise<T>} action
 * @returns {Promise<{result: T, log: object[]}>}
 */
export async function recorded(action) {
  const log = [];
  const hooks = [];
  const mine = userId => userId === game.user.id;
  // Not content: a setting, chat or fog change during the action is not part of it
  const skipped = new Set(["Setting", "ChatMessage", "FogExploration", "User"]);
  for ( const type of CONST.ALL_DOCUMENT_TYPES.filter(t => !skipped.has(t)) ) {
    hooks.push([`create${type}`, Hooks.on(`create${type}`, (doc, options, userId) => {
      if ( mine(userId) ) log.push({kind: "create", uuid: doc.uuid});
    })]);
    hooks.push([`preUpdate${type}`, Hooks.on(`preUpdate${type}`, (doc, changes, options, userId) => {
      if ( mine(userId) ) log.push({kind: "update", uuid: doc.uuid, before: previousValues(doc._source, changes)});
    })]);
    // The whole document as it is now: undo creates it again with the same id (links to it keep working)
    hooks.push([`preDelete${type}`, Hooks.on(`preDelete${type}`, (doc, options, userId) => {
      if ( mine(userId) ) log.push({kind: "delete", uuid: doc.uuid, type: doc.documentName,
        parentUuid: doc.isEmbedded ? doc.parent.uuid : null, pack: doc.pack ?? null, data: doc.toObject()});
    })]);
  }
  try {
    return {result: await action(), log};
  } catch(err) {
    // What a failed action did before failing can still be undone
    err.log = log;
    throw err;
  } finally {
    for ( const [hook, id] of hooks ) Hooks.off(hook, id);
  }
}

/**
 * Take an action back: deleted documents created again (same id), fields to their previous values, created
 * documents deleted. What is gone already (deleted by hand meanwhile) or back already is skipped.
 * @param {object[]} log  from recorded()
 * @returns {Promise<{recreated: number, reverted: number, deleted: number, failed: string[]}>}
 */
export async function undo(log) {
  const {recreates, reverts, deletes} = planUndo(log);
  const out = {recreated: 0, reverted: 0, deleted: 0, failed: []};
  for ( const {uuid, type, parentUuid, pack, data} of recreates ) {
    if ( fromUuidSync(uuid, {strict: false}) ) continue;
    try {
      if ( parentUuid ) {
        const parent = fromUuidSync(parentUuid, {strict: false});
        if ( !parent ) throw new Error(_loc("DEWARIM_STUDIO.Undo.ParentGone"));
        await parent.createEmbeddedDocuments(type, [data], {keepId: true});
      }
      else await getDocumentClass(type).create(data, {keepId: true, pack});
      out.recreated++;
    } catch(err) {
      out.failed.push(`${data.name ?? uuid}: ${err.message}`);
    }
  }
  for ( const {uuid, data} of reverts ) {
    const doc = fromUuidSync(uuid);
    if ( !doc ) continue;
    // A field that did not exist before is removed again
    const update = Object.fromEntries(Object.entries(data).map(([path, value]) =>
      [path, value === undefined ? new foundry.data.operators.ForcedDeletion() : value]));
    try {
      await doc.update(update);
      out.reverted++;
    } catch(err) {
      out.failed.push(`${doc.name ?? uuid}: ${err.message}`);
    }
  }
  for ( const uuid of deletes ) {
    const doc = fromUuidSync(uuid);
    if ( !doc ) continue;
    try {
      await doc.delete();
      out.deleted++;
    } catch(err) {
      out.failed.push(`${doc.name ?? uuid}: ${err.message}`);
    }
  }
  return out;
}
