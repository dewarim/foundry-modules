// Table columns. A column is a data path plus optional overrides; what kind of cell it gets comes from
// the document's own schema (NumberField -> number, choices -> select, FilePathField -> image ...), so a
// preset mostly lists paths. Systems whose choices live outside the schema (dnd5e: CONFIG.DND5E) give
// them explicitly - see systems/dnd5e.mjs.
//
// Column spec: {path, label?, type?, choices? (object|array|(doc) => ...), nullable?, readonly?,
//               derived? (read the prepared value, never editable), types? (document subtypes it applies to),
//               numeric? (select with number values), get? (doc) => value, write? (value, doc) => update data}
// `get`/`write` are for values that are not one data path: a v14 scene's background is on its level.
import {normalizeChoices} from "./table-model.mjs";

/** @type {Map<string, Map<string, {label: string, columns: object[], types?: string[]}>>} */
const presets = new Map();

/**
 * Register a column preset for a document type. Other modules can call this through the studio's api.
 * @param {string} documentName  "Actor", "Item", ...
 * @param {string} id
 * @param {{label: string, columns: object[], types?: string[]}} preset  types: subtypes the preset is for
 */
export function registerPreset(documentName, id, preset) {
  if ( !presets.has(documentName) ) presets.set(documentName, new Map());
  presets.get(documentName).set(id, preset);
}

/** @returns {[string, {label: string, columns: object[], types?: string[]}][]} */
export function presetsFor(documentName) {
  return [...(presets.get(documentName) ?? [])];
}

/** Choices for the document type column: the subtypes with their localized labels. */
export function typeChoices(doc) {
  const labels = CONFIG[doc.documentName]?.typeLabels ?? {};
  return Object.fromEntries((doc.constructor.TYPES ?? []).filter(t => t !== "base").map(t => [t, labels[t] ?? t]));
}

registerPreset("Actor", "core", {
  label: "DEWARIM_STUDIO.Table.Preset.Core",
  columns: [
    {path: "name"},
    {path: "img", type: "image"},
    {path: "type", readonly: true, choices: typeChoices},
    {path: "prototypeToken.texture.src", type: "image", label: "DEWARIM_STUDIO.Table.Column.TokenImage"},
    {path: "prototypeToken.disposition"},
    {path: "prototypeToken.actorLink"}
  ]
});

registerPreset("Item", "core", {
  label: "DEWARIM_STUDIO.Table.Preset.Core",
  columns: [
    {path: "name"},
    {path: "img", type: "image"},
    {path: "type", readonly: true, choices: typeChoices}
  ]
});

/** Who may see a document by default: none, limited, observer, owner. */
const ownershipChoices = () => Object.fromEntries(Object.entries(CONST.DOCUMENT_OWNERSHIP_LEVELS)
  .filter(([, v]) => v >= 0).map(([k, v]) => [v, `OWNERSHIP.${k}`]));

/** World documents of a type as choices, for a reference field (a scene's playlist, journal). */
const documentChoices = name => () => Object.fromEntries(game.collections.get(name).contents
  .sort((a, b) => a.name.localeCompare(b.name)).map(d => [d.id, d.name]));

/** The level a v14 scene starts on (its background is that level's). */
function initialLevel(source) {
  return source.levels?.find(l => l._id === source.initialLevel) ?? source.levels?.[0];
}

// Same labels as Foundry's scene sheet (SceneConfig._getGridTypes is internal)
const GRID_LABELS = {GRIDLESS: "SCENE.GridGridless", SQUARE: "SCENE.GridSquare", HEXODDR: "SCENE.GridHexOddR",
  HEXEVENR: "SCENE.GridHexEvenR", HEXODDQ: "SCENE.GridHexOddQ", HEXEVENQ: "SCENE.GridHexEvenQ"};
const gridChoices = () => Object.fromEntries(Object.entries(CONST.GRID_TYPES).map(([k, v]) => [v, GRID_LABELS[k] ?? k]));

registerPreset("Scene", "core", {
  label: "DEWARIM_STUDIO.Table.Preset.Core",
  columns: [
    {path: "name"},
    {path: "background", type: "image", label: "DEWARIM_STUDIO.Table.Column.Background",
      get: doc => initialLevel(doc._source)?.background?.src ?? "",
      write: (value, doc) => {
        const level = initialLevel(doc._source);
        return level ? {levels: [{_id: level._id, background: {src: value || null}}]} : {};
      }},
    {path: "navigation"},
    {path: "navName"},
    {path: "ownership.default", type: "select", numeric: true, choices: ownershipChoices, label: "DEWARIM_STUDIO.Table.Column.Ownership"},
    {path: "width"},
    {path: "height"},
    {path: "grid.type", numeric: true, choices: gridChoices},
    {path: "grid.size"},
    {path: "grid.distance"},
    {path: "grid.units"},
    {path: "tokenVision"},
    {path: "environment.darknessLevel"},
    {path: "playlist", choices: documentChoices("Playlist"), nullable: true},
    {path: "journal", choices: documentChoices("JournalEntry"), nullable: true},
    {path: "tokens", type: "number", derived: true, label: "DEWARIM_STUDIO.Table.Column.Tokens", get: doc => doc.tokens.size},
    {path: "notes", type: "number", derived: true, label: "DEWARIM_STUDIO.Table.Column.Notes", get: doc => doc.notes.size},
    {path: "levels", type: "number", derived: true, label: "DEWARIM_STUDIO.Table.Column.Levels", get: doc => doc.levels.size}
  ]
});

registerPreset("JournalEntry", "core", {
  label: "DEWARIM_STUDIO.Table.Preset.Core",
  columns: [
    {path: "name"},
    {path: "ownership.default", type: "select", numeric: true, choices: ownershipChoices, label: "DEWARIM_STUDIO.Table.Column.Ownership"},
    {path: "pages", type: "number", derived: true, label: "DEWARIM_STUDIO.Table.Column.Pages", get: doc => doc.pages.size},
    {path: "pageNames", type: "text", derived: true, label: "DEWARIM_STUDIO.Table.Column.PageNames",
      get: doc => doc.pages.contents.sort((a, b) => a.sort - b.sort).map(p => p.name).join(", ")},
    // Where the journal is used: as a scene's journal, as map notes
    {path: "sceneJournal", type: "text", derived: true, label: "DEWARIM_STUDIO.Table.Column.SceneJournal",
      get: doc => game.scenes.filter(s => s.journal?.id === doc.id).map(s => s.name).join(", ")},
    {path: "mapNotes", type: "number", derived: true, label: "DEWARIM_STUDIO.Table.Column.MapNotes",
      get: doc => game.scenes.reduce((n, s) => n + s.notes.filter(note => note.entryId === doc.id).length, 0)}
  ]
});

/**
 * The schema field behind a data path. Foundry's getField does not descend into `system`, and a
 * MappingField's keys are not fields, so the walk is done by hand.
 * @param {ClientDocument} doc
 * @param {string} path
 * @returns {DataField|undefined}
 */
export function fieldFor(doc, path) {
  let field;
  let segments;
  if ( path.startsWith("system.") ) {
    field = doc.system?.schema;
    segments = path.split(".").slice(1);
  } else {
    field = doc.schema;
    segments = path.split(".");
  }
  for ( const segment of segments ) {
    if ( !field ) return undefined;
    if ( field.fields ) field = field.fields[segment];
    else if ( field.element && !field.fields ) field = field.element;     // MappingField key, ArrayField index
    else if ( field.model?.schema ) field = field.model.schema.fields[segment];
    else return undefined;
  }
  return field;
}

function typeFromField(field) {
  if ( !field ) return undefined;
  const names = [];
  for ( let c = field.constructor; c && c.name; c = Object.getPrototypeOf(c) ) names.push(c.name);
  if ( names.includes("FormulaField") ) return "formula";
  if ( names.includes("HTMLField") ) return "html";
  if ( names.includes("BooleanField") ) return "boolean";
  if ( names.includes("NumberField") ) return "number";
  if ( names.includes("FilePathField") ) return "image";
  if ( names.includes("SetField") || names.includes("ArrayField") ) {
    return typeFromField(field.element) === "text" ? "set" : undefined;
  }
  if ( names.includes("StringField") ) return "text";
  return undefined;
}

function fieldChoices(field) {
  const choices = field?.choices ?? field?.element?.choices;
  return typeof choices === "function" ? choices() : choices;
}

/**
 * Everything a cell needs to know about a column for one document.
 * @param {object} spec
 * @param {ClientDocument} doc
 * @returns {{path: string, label: string, type: string, choices: {value: string, label: string}[],
 *   nullable: boolean, readonly: boolean, applies: boolean}}
 */
export function resolveColumn(spec, doc) {
  const applies = !spec.types || spec.types.includes(doc.type);
  const field = applies ? fieldFor(doc, spec.path) : undefined;
  const rawChoices = typeof spec.choices === "function" ? spec.choices(doc) : (spec.choices ?? fieldChoices(field));
  const choices = normalizeChoices(rawChoices).map(c => ({...c, label: _loc(c.label)}));
  let type = spec.type ?? typeFromField(field) ?? "text";
  // A number with choices (grid type) is a select whose values are numbers
  const numeric = spec.numeric ?? (type === "number");
  // Declared choices make a select even while empty (no playlists yet): a text field would take any id
  if ( ["text", "number"].includes(type) && (choices.length || spec.choices) ) type = "select";
  // Not in the schema, but declared and given a reader: virtual column (background on the level)
  const unknown = !field && !spec.type && !spec.derived && !spec.get;
  // Unknown to the schema and not declared: Foundry would drop the update silently, so do not offer it
  return {
    path: spec.path,
    label: _loc(spec.label ?? field?.label ?? spec.path) || spec.path,
    type,
    choices,
    nullable: spec.nullable ?? field?.nullable ?? false,
    numeric: (type === "select") && numeric,
    readonly: Boolean(spec.readonly || spec.derived || (type === "html") || unknown || (spec.get && !spec.write)),
    applies
  };
}

/** A column's current value on a document: its reader, source data, or prepared data for derived columns. */
export function readValue(spec, doc) {
  if ( spec.get ) return spec.get(doc);
  return foundry.utils.getProperty(spec.derived ? doc : doc._source, spec.path);
}

/** Update writers of a column list, for collectUpdates: path -> (value, id) => update data. */
export function columnWriters(specs, collection) {
  return Object.fromEntries(specs.filter(s => s.write).map(s => [s.path, (value, id) => s.write(value, collection.get(id))]));
}
