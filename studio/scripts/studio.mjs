// dewarim-studio: author content in a world, build it into a content module's Adventure.
// Entry points: the "Studio" button in the Settings sidebar, project entries in the sidebar context menus
// and in document sheet headers. Generic: no system-specific code.
import {buildProject} from "./build.mjs";
import {
  MODULE_ID, activeProject, assign, assignFolder, ensureRootFolder, getProject, members, projectOf, projects, rootFolder, unassign
} from "./project.mjs";
import {CONTENT_TYPES} from "./refs.mjs";
import {StudioApp} from "./studio-app.mjs";
import {TableApp} from "./table-app.mjs";
import {registerPreset} from "./columns.mjs";
import {EncounterApp} from "./encounter-app.mjs";
import {SceneApp} from "./scene-app.mjs";
import {CommanderApp} from "./commander-app.mjs";
import {MerchantsApp} from "./merchants-app.mjs";
import {registerDropRule, registerSourceSupport} from "./commander.mjs";
import {registerEncounterSupport} from "./encounter.mjs";
import {registerPortraitEnricher} from "./portrait.mjs";
import {onActorCreated, openNpcPage, registerNpcPageExtra, useForNpcPages} from "./npc-page.mjs";
import {PortraitGenApp} from "./portrait-gen-app.mjs";
import {registerActorTraits} from "./imagegen.mjs";
import {registerChangelog} from "./shared/changelog.mjs";

// After an install or update, GMs see what changed (CHANGELOG.md)
registerChangelog(MODULE_ID);

let app;
const tables = new Map();

let encounter;
let sceneApp;
let commander;
let merchants;

/**
 * The item templates of the optional dewarim-items module, writing into the active project's Item folder
 * (made if it is missing), so generated items join the project and its adventure.
 */
async function openItems() {
  const items = game.modules.get("dewarim-items");
  if ( !items?.active ) return null;
  const project = activeProject();
  const folder = project ? (rootFolder(project.id, "Item") ?? await ensureRootFolder(project, "Item")) : null;
  return items.api?.open({folder: folder?.uuid ?? ""});
}

/** The merchants table - only with the optional dewarim-merchants module active. */
function openMerchants() {
  if ( !game.modules.get("dewarim-merchants")?.active ) return null;
  merchants ??= new MerchantsApp();
  return merchants.render({force: true});
}

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
  if ( merchants?.rendered && !merchants.element.contains(document.activeElement) ) merchants.render();
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
  // image-gen (~/code/image-gen) runs on this machine only: it holds an API key and wants a GPU, so it
  // is never reachable from a hosted server, and the studio offers nothing when it does not answer.
  game.settings.register(MODULE_ID, "imageGenUrl", {
    name: "DEWARIM_STUDIO.ImageGen.UrlName",
    hint: "DEWARIM_STUDIO.ImageGen.UrlHint",
    scope: "world",
    config: true,
    type: String,
    default: "http://127.0.0.1:8090"
  });
  // Off by default: a page per new actor is a thing to ask for, not to discover
  game.settings.register(MODULE_ID, "autoNpcPage", {
    name: "DEWARIM_STUDIO.NpcPage.AutoName",
    hint: "DEWARIM_STUDIO.NpcPage.AutoHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  // The journal new actor pages go into (DEWARIM_STUDIO.NpcPage), remembered per world
  game.settings.register(MODULE_ID, "npcJournal", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
  game.settings.register(MODULE_ID, "tables", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
  // `@Portrait[Actor.xxx]` in any text: the picture is read from the document, never copied
  registerPortraitEnricher();
  // System adapters: column presets for the tables
  if ( game.system.id === "dnd5e" ) import("./systems/dnd5e.mjs").then(m => m.register({registerPreset, registerEncounterSupport, registerSourceSupport, registerDropRule, registerNpcPageExtra, registerActorTraits}));
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    open: openStudio, openTable, openEncounter, openScene, openCommander, openMerchants, openItems, registerDropRule, registerPreset, registerEncounterSupport, build: buildProject,
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

// A new actor of the active project gets its page, if the GM asked for that (setting, off by default)
Hooks.on("createActor", (actor, options, userId) => {
  onActorCreated(actor, options, userId).catch(err => console.error(`${MODULE_ID} | npc page:`, err));
});

Hooks.on("getActorContextOptions", (app, options) => {
  const getActor = li => game.actors.get(entryId(li));
  options.push({
    label: "DEWARIM_STUDIO.NpcPage.Create",
    icon: "fa-solid fa-book-open",
    visible: li => game.user.isGM && !!getActor(li),
    onClick: (event, li) => openNpcPage(getActor(li))
      .catch(err => ui.notifications.error(err.message, {console: true}))
  }, {
    label: "DEWARIM_STUDIO.ImageGen.Create",
    icon: "fa-solid fa-wand-magic-sparkles",
    visible: li => game.user.isGM && !!getActor(li),
    onClick: (event, li) => new PortraitGenApp(getActor(li)).render({force: true})
  });
});

Hooks.on("getJournalEntryContextOptions", (app, options) => {
  const getJournal = li => game.journal.get(entryId(li));
  options.push({
    label: "DEWARIM_STUDIO.NpcPage.UseJournal",
    icon: "fa-solid fa-book-open",
    visible: li => game.user.isGM && !!getJournal(li)
      && (getJournal(li).id !== game.settings.get(MODULE_ID, "npcJournal")),
    onClick: (event, li) => useForNpcPages(getJournal(li))
  });
});

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
  // An actor's own page in the journal: made on the first call, opened on every later one
  if ( doc.documentName === "Actor" ) controls.push({
    icon: "fa-solid fa-book-open",
    label: "DEWARIM_STUDIO.NpcPage.Create",
    onClick: () => openNpcPage(doc).catch(err => ui.notifications.error(err.message, {console: true}))
  });
  // A portrait from the local image-gen, if it is running - the window says so when it is not
  if ( doc.documentName === "Actor" ) controls.push({
    icon: "fa-solid fa-wand-magic-sparkles",
    label: "DEWARIM_STUDIO.ImageGen.Create",
    onClick: () => new PortraitGenApp(doc).render({force: true})
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
