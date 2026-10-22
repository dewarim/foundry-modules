// Where content comes from: the project, the world, compendiums - or all of them at once, the project
// first. Shared by the commander columns and the source panels of the encounter editor and tables.
// Compendiums are read from their index (with the fields the system adapter asks for), never loaded.
import {sourceSupport} from "./commander.mjs";
import {matchesQuery, parseQuery, unknownKeys} from "./filters.mjs";
import {activeProject, members, projectOf} from "./project.mjs";

/** Rows shown before "refine the filter" - a pack can hold thousands. */
export const SOURCE_LIMIT = 200;

/**
 * Condition keys for the filter field ("cr<=2"): `type` everywhere, the rest from the system adapter.
 * @returns {Record<string, {path?: string, get?: (entry: object) => *, fields?: string[]}>}
 */
export function filterFields(documentName) {
  return {type: {path: "type"}, ...(sourceSupport.filterFields?.[documentName] ?? {})};
}

/** Index fields a compendium must load for badges and filters. */
function indexFields(documentName) {
  const fields = new Set(sourceSupport.indexFields?.[documentName] ?? []);
  for ( const f of Object.values(filterFields(documentName)) ) {
    if ( f.path && (f.path !== "type") ) fields.add(f.path);
    for ( const p of f.fields ?? [] ) fields.add(p);
  }
  return [...fields];
}

function valueOf(fields, entry) {
  return key => {
    const field = fields[key];
    if ( !field ) return undefined;
    return field.get ? field.get(entry) : foundry.utils.getProperty(entry, field.path);
  };
}

/**
 * A predicate for the filter text: name words plus conditions ("goblin cr<=1/2").
 * @param {string} documentName
 * @param {string} filter
 * @param {(entry: object) => string[]} [texts]  searchable text of an entry, the name by default
 */
export function filterPredicate(documentName, filter, texts = e => [e.name]) {
  const query = parseQuery(filter);
  const fields = filterFields(documentName);
  const predicate = e => matchesQuery(query, texts(e), valueOf(fields, e));
  predicate.unknown = unknownKeys(query, Object.keys(fields));
  return predicate;
}

/** A document's picture for a list row. */
export function documentImage(doc) {
  if ( doc instanceof Scene ) return doc.thumb || doc.initialLevel?.background?.src || "icons/svg/map.svg";
  if ( doc instanceof JournalEntry ) return "icons/svg/book.svg";
  if ( doc instanceof Playlist ) return "icons/svg/sound.svg";
  return doc.img || doc.texture?.src || "icons/svg/mystery-man.svg";
}

/** Compendiums of a type the user may see, by title. */
export function packsOf(documentName) {
  return game.packs.filter(p => (p.documentName === documentName) && p.visible)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * The scope choices: project, world, everything, then each compendium.
 * @param {string} documentName
 * @param {string} selected
 */
export function scopeChoices(documentName, selected) {
  const project = activeProject();
  return {
    scopes: [
      {value: "project", label: project?.title ?? _loc("DEWARIM_STUDIO.Table.NoProject"), selected: selected === "project", disabled: !project},
      {value: "all", label: _loc("DEWARIM_STUDIO.Table.AllWorld"), selected: selected === "all"},
      {value: "everywhere", label: _loc("DEWARIM_STUDIO.Sources.Everywhere"), selected: selected === "everywhere"}
    ],
    packs: packsOf(documentName).map(p => ({
      value: `pack:${p.collection}`, label: `${p.title} · ${p.metadata.packageName}`, selected: selected === `pack:${p.collection}`
    }))
  };
}

/** A scope that still works: an unknown pack or a project scope without a project falls back. */
export function validScope(documentName, scope) {
  if ( scope === "project" ) return activeProject() ? scope : "everywhere";
  if ( scope?.startsWith("pack:") ) {
    const pack = game.packs.get(scope.slice(5));
    return (pack?.documentName === documentName) && pack.visible ? scope : "everywhere";
  }
  return ["all", "everywhere"].includes(scope) ? scope : (activeProject() ? "project" : "everywhere");
}

/**
 * What a scope offers, filtered.
 * @param {string} documentName
 * @param {{scope: string, subtype?: string, filter?: string, limit?: number}} options
 * @returns {Promise<{entries: {uuid: string, name: string, img: string, badge: string, origin: string,
 *   fromPack: boolean, doc: ClientDocument|null}[], more: number, unknown: string[]}>}
 */
export async function listSources(documentName, {scope, subtype = "", filter = "", limit = SOURCE_LIMIT}) {
  const matches = filterPredicate(documentName, filter);
  const keep = e => (!subtype || (e.type === subtype)) && matches(e);
  const byName = (a, b) => a.name.localeCompare(b.name);
  const project = activeProject();
  const groups = [];

  const fromDocs = (docs, origin) => docs.filter(keep).sort(byName).map(doc => ({
    uuid: doc.uuid, name: doc.name, img: documentImage(doc), badge: sourceSupport.badge?.(doc, documentName) ?? "",
    origin, fromPack: false, doc
  }));
  // Two packs can share a title ("Actors" in two modules): then the package tells them apart
  const titles = packsOf(documentName).map(p => p.title);
  const packOrigin = pack => titles.filter(t => t === pack.title).length > 1 ? `${pack.title} (${pack.metadata.packageName})` : pack.title;
  const fromPack = async pack => {
    const index = await pack.getIndex({fields: indexFields(documentName)});
    return [...index].filter(keep).sort(byName).map(e => ({
      uuid: e.uuid, name: e.name, img: e.img || e.thumb || "icons/svg/mystery-man.svg",
      badge: sourceSupport.badge?.(e, documentName) ?? "", origin: packOrigin(pack), fromPack: true, doc: null
    }));
  };

  const world = game.collections.get(documentName).contents;
  if ( scope === "project" ) {
    if ( project ) groups.push(fromDocs(members(project.id)[documentName], project.title));
  }
  else if ( scope === "all" ) groups.push(fromDocs(world, _loc("DEWARIM_STUDIO.Sources.World")));
  else if ( scope === "everywhere" ) {
    // The project's own first, then the rest of the world, then every compendium
    if ( project ) groups.push(fromDocs(members(project.id)[documentName], project.title));
    groups.push(fromDocs(world.filter(d => !project || (projectOf(d) !== project.id)), _loc("DEWARIM_STUDIO.Sources.World")));
    for ( const pack of packsOf(documentName) ) groups.push(await fromPack(pack));
  }
  else if ( scope?.startsWith("pack:") ) {
    const pack = game.packs.get(scope.slice(5));
    if ( pack ) groups.push(await fromPack(pack));
  }
  const entries = groups.flat();
  return {
    entries: entries.slice(0, limit),
    more: Math.max(0, entries.length - limit),
    unknown: matches.unknown
  };
}

/** The hint under a filter field: which condition keys exist, and which typed ones do not. */
export function filterHint(documentName, unknown) {
  const keys = Object.keys(filterFields(documentName)).join(", ");
  if ( unknown.length ) return _loc("DEWARIM_STUDIO.Sources.UnknownKeys", {unknown: unknown.join(", "), keys});
  return "";
}

/** The filter field's tooltip: the syntax, with this type's keys. */
export function filterTooltip(documentName) {
  return _loc("DEWARIM_STUDIO.Sources.FilterHint", {keys: Object.keys(filterFields(documentName)).join(", ")});
}
