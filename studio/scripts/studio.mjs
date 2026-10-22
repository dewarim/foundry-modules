// dewarim-studio: author content in a world, build it into a content module's Adventure.
// Entry points: the "Studio" button in the Settings sidebar, project entries in the sidebar context menus
// and in document sheet headers. Generic: no system-specific code.
import {buildProject} from "./build.mjs";
import {MODULE_ID, activeProject, assign, assignFolder, getProject, members, projectOf, projects, unassign}
  from "./project.mjs";
import {CONTENT_TYPES} from "./refs.mjs";
import {StudioApp} from "./studio-app.mjs";
import {TableApp} from "./table-app.mjs";
import {registerPreset} from "./columns.mjs";
import {EncounterApp} from "./encounter-app.mjs";
import {SceneApp} from "./scene-app.mjs";
import {CommanderApp} from "./commander-app.mjs";
import {registerDropRule, registerSourceSupport} from "./commander.mjs";
import {registerEncounterSupport} from "./encounter.mjs";

let app;
const tables = new Map();

let encounter;
let sceneApp;
let commander;

function openCommander() {
  commander ??= new CommanderApp();
  return commander.render({force: true});
}

function openScene(sceneId) {
  sceneApp ??= new SceneApp();
  return sceneId ? sceneApp.showScene(sceneId) : sceneApp.render({force: true});
}

function openEncounter() {
  encounter ??= new EncounterApp();
  return encounter.render({force: true});
}

function openTable(documentName) {
  if ( !tables.has(documentName) ) tables.set(documentName, new TableApp({documentName, id: `dewarim-studio-table-${documentName}`}));
  return tables.get(documentName).render({force: true});
}

function openStudio() {
  app ??= new StudioApp();
  return app.render({force: true});
}

/** Re-render the studio window if open - membership changes with every document or folder update. */
const refresh = foundry.utils.debounce(() => {
  if ( app?.rendered ) app.render();
  if ( encounter?.rendered && !encounter.element.contains(document.activeElement) ) encounter.render();
  commander?.refresh();
  // A table being typed into is left alone - re-rendering would take the focus away
  for ( const table of tables.values() ) {
    if ( table.rendered && !table.element.contains(document.activeElement) ) table.render();
  }
}, 200);

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "activeProject", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
  game.settings.register(MODULE_ID, "commander", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
  // The encounter editor's party to rate against: a group actor's id, "players", "custom" (count x level),
  // or "" - the system's primary party
  game.settings.register(MODULE_ID, "encounterParty", {
    scope: "client",
    config: false,
    type: Object,
    default: {id: "", count: 4, level: 1}
  });
  game.settings.register(MODULE_ID, "tables", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
  // System adapters: column presets for the tables
  if ( game.system.id === "dnd5e" ) import("./systems/dnd5e.mjs").then(m => m.register({registerPreset, registerEncounterSupport, registerSourceSupport, registerDropRule}));
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    open: openStudio, openTable, openEncounter, openScene, openCommander, registerDropRule, registerPreset, registerEncounterSupport, build: buildProject,
    projects, members, assign, assignFolder, unassign, projectOf
  };
  if ( !game.user.isGM ) return;
  // Exactly one project: it is the active one without asking
  const all = projects();
  if ( !activeProject() && (all.length === 1) ) game.settings.set(MODULE_ID, "activeProject", all[0].id);
});

for ( const hook of ["create", "update", "delete"] ) {
  for ( const type of [...CONTENT_TYPES, "Folder"] ) Hooks.on(`${hook}${type}`, refresh);
  for ( const type of ["Token", "Wall", "Note", "Tile", "AmbientLight"] ) {
    Hooks.on(`${hook}${type}`, doc => sceneApp?.refreshFor(doc));
  }
  for ( const type of ["Token", "JournalEntryPage", "PlaylistSound"] ) Hooks.on(`${hook}${type}`, refresh);
}
// A token's actor (HP, items) changing shows in the scene contents too
for ( const hook of ["updateActor", "createItem", "deleteItem"] ) {
  Hooks.on(hook, doc => {
    const actor = doc instanceof Actor ? doc : doc.parent;
    const token = actor?.token ?? canvas.scene?.tokens.find(t => t.actorId === actor?.id);
    if ( token ) sceneApp?.refreshFor(token);
  });
}

/* -------------------------------------------- */
/*  Settings sidebar button                     */
/* -------------------------------------------- */

Hooks.on("renderSettings", (settings, html) => {
  if ( !game.user.isGM || html.querySelector("[data-dewarim-studio]") ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.dewarimStudio = "";
  button.innerHTML = `<i class="fa-solid fa-compass-drafting" inert></i> ${_loc("DEWARIM_STUDIO.Title")}`;
  button.addEventListener("click", openStudio);
  html.querySelector("section.settings")?.append(button);
});

/* -------------------------------------------- */
/*  Sidebar context menus                       */
/* -------------------------------------------- */

/**
 * The id behind a context menu entry: a sidebar directory entry, or a scene in the scene navigation - which
 * fires the same getSceneContextOptions hook (its level entries are left alone).
 */
function entryId(li) {
  return li.closest("[data-entry-id]")?.dataset.entryId ?? (li.dataset.levelId ? undefined : li.dataset.sceneId);
}

for ( const type of CONTENT_TYPES ) {
  Hooks.on(`get${type}ContextOptions`, (app, options) => {
    const collection = app.collection ?? game.collections.get(type);
    const getDocument = li => collection?.get(entryId(li));
    options.push({
      label: "DEWARIM_STUDIO.Menu.Add",
      icon: "fa-solid fa-box-archive",
      visible: li => {
        const doc = getDocument(li);
        return game.user.isGM && !!doc && !!activeProject() && (projectOf(doc) !== activeProject().id);
      },
      onClick: (event, li) => assign([getDocument(li)], activeProject())
    }, {
      label: "DEWARIM_STUDIO.Menu.Remove",
      icon: "fa-solid fa-box-open",
      visible: li => {
        const doc = getDocument(li);
        return game.user.isGM && !!doc && !!projectOf(doc);
      },
      onClick: (event, li) => unassign([getDocument(li)])
    });
  });
}

Hooks.on("getSceneContextOptions", (app, options) => {
  options.push({
    label: "DEWARIM_STUDIO.Scene.Open",
    icon: "fa-solid fa-map",
    visible: li => game.user.isGM && !!entryId(li),
    onClick: (event, li) => openScene(entryId(li))
  });
});

Hooks.on("getFolderContextOptions", (directory, options) => {
  const getFolder = header => fromUuidSync(header.closest(".directory-item").dataset.uuid);
  options.push({
    label: "DEWARIM_STUDIO.Menu.AddFolder",
    icon: "fa-solid fa-box-archive",
    visible: header => {
      const folder = getFolder(header);
      return game.user.isGM && !!activeProject() && CONTENT_TYPES.includes(folder?.type)
        && !folder.getFlag(MODULE_ID, "root");
    },
    onClick: (event, header) => assignFolder(getFolder(header), activeProject())
      .catch(err => ui.notifications.error(err.message, {console: true}))
  });
});

/* -------------------------------------------- */
/*  Document sheet header                       */
/* -------------------------------------------- */

Hooks.on("getHeaderControlsDocumentSheetV2", (sheet, controls) => {
  const doc = sheet.document;
  if ( !game.user.isGM || !CONTENT_TYPES.includes(doc?.documentName) || doc.pack || doc.isEmbedded ) return;
  controls.push({
    icon: "fa-solid fa-box-archive",
    label: "DEWARIM_STUDIO.Menu.Assign",
    onClick: () => assignDialog(doc)
  });
});

async function assignDialog(doc) {
  const current = projectOf(doc) ?? "";
  const options = [`<option value="">${_loc("DEWARIM_STUDIO.None")}</option>`]
    .concat(projects().map(m => `<option value="${m.id}" ${m.id === current ? "selected" : ""}>${m.title}</option>`));
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: {title: _loc("DEWARIM_STUDIO.Menu.Assign")},
    content: `<div class="form-group"><label>${_loc("DEWARIM_STUDIO.Project")}</label>`
      + `<select name="project">${options.join("")}</select></div>`,
    ok: {callback: (event, button) => button.form.elements.project.value},
    rejectClose: false
  });
  if ( (choice === undefined) || (choice === null) || (choice === current) ) return;
  if ( choice ) await assign([doc], getProject(choice));
  else await unassign([doc]);
}
