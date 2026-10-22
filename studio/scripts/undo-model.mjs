// The pure half of undo: from a log of what an action did (documents created, fields updated with their
// previous values, documents deleted with their data), the steps that take it back. No Foundry globals, so `node --test` covers it
// (test/undo-model.test.mjs). The Foundry half, which records the log, is undo.mjs.

/**
 * Previous values of the fields an update changes, as dotted paths. A field that did not exist before is
 * `undefined` - undoing removes it.
 * @param {object} source   the document's source data before the update
 * @param {object} changes  the update (expanded or dotted)
 * @returns {Record<string, *>}
 */
export function previousValues(source, changes) {
  const before = {};
  for ( const path of Object.keys(flatten(changes)) ) {
    if ( (path === "_id") || path.startsWith("_stats.") ) continue;
    before[path] = structuredClone(get(source, path));
  }
  return before;
}

/** Dotted keys down to plain values; arrays count as values (they are replaced as a whole). */
function flatten(obj, prefix = "", out = {}) {
  for ( const [key, value] of Object.entries(obj ?? {}) ) {
    const path = prefix ? `${prefix}.${key}` : key;
    if ( value && (typeof value === "object") && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype)
      && Object.keys(value).length ) flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

function get(obj, path) {
  return path.split(".").reduce((o, k) => (o === null || o === undefined) ? undefined : o[k], obj);
}

/** Whether `uuid` is `parent` itself or something embedded in it ("Scene.a.Token.b" under "Scene.a"). */
function within(uuid, parent) {
  return (uuid === parent) || uuid.startsWith(`${parent}.`);
}

/**
 * The steps that undo a log, in the order to run them.
 * - recreates: what the action deleted, with its data as it was then - except documents it had created
 *   itself, and documents inside another deleted one (they come back with it)
 * - reverts: updates back to the earliest previous value per field, newest first - except on documents
 *   the action created (they go anyway); after the recreates, so a document updated and then deleted
 *   gets its earliest values too
 * - deletes: what the action created, newest first, without things inside another created document
 *   (deleting an actor takes its items along)
 * @param {({kind: "create", uuid: string}|{kind: "update", uuid: string, before: object}
 *   |{kind: "delete", uuid: string, type: string, parentUuid: (string|null), pack: (string|null), data: object})[]} log
 * @returns {{recreates: {uuid: string, type: string, parentUuid: (string|null), pack: (string|null), data: object}[],
 *   reverts: {uuid: string, data: Record<string, *>}[], deletes: string[]}}
 */
export function planUndo(log) {
  const created = log.filter(e => e.kind === "create").map(e => e.uuid);
  const isCreated = uuid => created.some(c => within(uuid, c));
  const deleted = log.filter(e => (e.kind === "delete") && !isCreated(e.uuid));
  const recreates = deleted.filter(e => !deleted.some(d => (d.uuid !== e.uuid) && within(e.uuid, d.uuid)))
    .map(({uuid, type, parentUuid = null, pack = null, data}) => ({uuid, type, parentUuid, pack, data}));

  const reverts = new Map();
  for ( const entry of log ) {
    if ( (entry.kind !== "update") || isCreated(entry.uuid) ) continue;
    const data = reverts.get(entry.uuid) ?? {};
    // The first time a field changed holds its value before the action
    for ( const [path, value] of Object.entries(entry.before) ) if ( !(path in data) ) data[path] = value;
    reverts.delete(entry.uuid);
    reverts.set(entry.uuid, data);
  }

  const deletes = created.filter(uuid => !created.some(c => (c !== uuid) && within(uuid, c)));
  return {
    recreates,
    reverts: [...reverts].reverse().map(([uuid, data]) => ({uuid, data})),
    deletes: deletes.reverse()
  };
}
