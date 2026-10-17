// The Foundry half of repointing: which world documents use a file, and pointing them at another one.
// The plans come from references.mjs; this file knows Foundry's document classes and how to update
// embedded documents (tokens, tiles, a scene's levels, journal pages, an unlinked token's items ...).
import {planUpdate} from "./references.mjs";

/** World document types that can hold file paths. Chat messages, combats and settings are left alone. */
const SCANNED = ["Scene", "Actor", "Item", "JournalEntry", "Playlist", "Macro", "RollTable", "Cards", "User"];

function documentClass(name) {
  return CONFIG[name]?.documentClass ?? foundry.documents[name];
}

const specs = new Map();

/** A document type's embedded collections, as planUpdate wants them: {key: {documentName, single?, embedded}}. */
function embeddedSpec(name) {
  if ( specs.has(name) ) return specs.get(name);
  const cls = documentClass(name);
  const spec = {};
  specs.set(name, spec);
  for ( const [child, key] of Object.entries(cls?.metadata.embedded ?? {}) ) {
    const field = cls.schema.fields[key];
    spec[key] = {
      documentName: child,
      single: field instanceof foundry.data.fields.EmbeddedDocumentField,
      embedded: embeddedSpec(child)
    };
  }
  return spec;
}

/**
 * Every world document that uses a file.
 * @param {string} path
 * @param {string} [to]   the path the plans point at (only matters for repointing)
 * @returns {{doc: ClientDocument, plan: object}[]}
 */
export function findUses(path, to = path) {
  const uses = [];
  for ( const name of SCANNED ) {
    const collection = game.collections.get(name);
    if ( !collection ) continue;
    const spec = embeddedSpec(name);
    for ( const doc of collection ) {
      const plan = planUpdate(doc.toObject(), path, to, spec);
      if ( plan ) uses.push({doc, plan});
    }
  }
  return uses;
}

/** Carry out one document's plan: its own fields, then each embedded collection in one call. */
async function apply(doc, plan) {
  if ( !foundry.utils.isEmpty(plan.update) ) await doc.update(plan.update);
  for ( const [key, {documentName, entries}] of Object.entries(plan.children) ) {
    // "delta.items": the items of the token's delta
    const owner = key.split(".").slice(0, -1).reduce((d, k) => d?.[k], doc);
    if ( !owner ) continue;
    const flat = entries.filter(e => foundry.utils.isEmpty(e.plan.children));
    if ( flat.length ) await owner.updateEmbeddedDocuments(documentName, flat.map(e => ({_id: e._id, ...e.plan.update})));
    for ( const e of entries.filter(e => !foundry.utils.isEmpty(e.plan.children)) ) {
      const child = owner.getEmbeddedDocument(documentName, e._id);
      if ( child ) await apply(child, e.plan);
    }
  }
}

/**
 * Point every world document that uses `from` at `to`.
 * @returns {Promise<{documents: number, uses: number, failed: string[]}>}
 */
export async function repoint(from, to) {
  const result = {documents: 0, uses: 0, failed: []};
  for ( const {doc, plan} of findUses(from, to) ) {
    try {
      await apply(doc, plan);
      result.documents += 1;
      result.uses += plan.fields.length;
    } catch(err) {
      console.error(err);
      result.failed.push(`${doc.name}: ${err.message}`);
    }
  }
  return result;
}
