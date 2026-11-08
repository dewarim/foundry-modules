// A journal page for an actor: the picture, a link to its sheet, and room to write. The text is built in
// portrait-model.mjs (Node tests); this half finds or makes the journal, finds an existing page, and opens
// what it made.
//
// **Seeded, not owned.** The page is written once and is then the GM's: nothing here regenerates it, so a
// moved portrait, a rewritten line or a deleted paragraph stays the way the GM left it. What the module
// does keep is a flag naming the actor, so a second *Journal page* on the same actor opens the page it made
// before instead of making another. The flag is an authoring aid - the build strips studio flags on export,
// and after an import the page is found by the UUID in its text instead.
import {MODULE_ID, activeProject, assign, ensureRootFolder, projectOf, rootFolder} from "./project.mjs";
import {npcPageData, shouldSeedPage} from "./portrait-model.mjs";

/** System adapters add paragraphs to a new page (dnd5e: the statblock embed). */
const extras = [];

/**
 * @param {(actor: Actor) => string[]} fn  further paragraphs for this actor, as HTML
 */
export function registerNpcPageExtra(fn) {
  extras.push(fn);
}

function extraLines(actor) {
  return extras.flatMap(fn => {
    try { return fn(actor) ?? []; }
    catch ( err ) { console.error(`${MODULE_ID} | npc page extra:`, err); return []; }
  });
}

/* -------------------------------------------- */

/** The page this module made for the actor, or the first page that shows it; null if there is none. */
export function findNpcPage(actor) {
  const uuid = actor.uuid;
  let byText = null;
  for ( const journal of game.journal ) {
    for ( const page of journal.pages ) {
      if ( page.getFlag(MODULE_ID, "npc") === uuid ) return page;
      // After an import the flag is gone, but the reference in the text is not.
      byText ??= (page.type === "text") && page.text?.content?.includes(uuid) ? page : null;
    }
  }
  return byText;
}

/**
 * The journal that new pages go into: the one remembered for this world, else a new one in the active
 * project's journal folder (so the build takes it along), else a loose one.
 * @returns {Promise<JournalEntry>}
 */
export async function npcJournal() {
  const remembered = game.journal.get(game.settings.get(MODULE_ID, "npcJournal"));
  if ( remembered ) return remembered;
  // A world that already keeps its NPCs in a journal of that name keeps them there - nobody wants a second
  // one. Any other journal can be named with `useForNpcPages`.
  const name = game.i18n.localize("DEWARIM_STUDIO.NpcPage.JournalName");
  const existing = game.journal.find(j => j.name.toLowerCase() === name.toLowerCase());
  if ( existing ) {
    await game.settings.set(MODULE_ID, "npcJournal", existing.id);
    return existing;
  }
  const project = activeProject();
  const folder = project ? (rootFolder(project.id, "JournalEntry") ?? await ensureRootFolder(project, "JournalEntry")) : null;
  const [journal] = await JournalEntry.implementation.createDocuments([{
    name: game.i18n.localize("DEWARIM_STUDIO.NpcPage.JournalName"),
    folder: folder?.id ?? null
  }]);
  if ( project ) await assign([journal], project);
  await game.settings.set(MODULE_ID, "npcJournal", journal.id);
  return journal;
}

/**
 * Open the actor's page, making it the first time. A GM-only action: it creates documents.
 * @param {Actor} actor
 * @returns {Promise<JournalEntryPage|null>}
 */
export async function openNpcPage(actor, {show = true} = {}) {
  if ( !actor ) return null;
  const single = foundry.applications.sheets.journal.JournalEntrySheet.VIEW_MODES.SINGLE;
  const existing = findNpcPage(actor);
  if ( existing ) {
    if ( show ) existing.parent.sheet.render({force: true, mode: single, pageId: existing.id});
    return existing;
  }
  const journal = await npcJournal();
  const data = npcPageData(actor, extraLines(actor));
  data.flags = {[MODULE_ID]: {npc: actor.uuid}};
  const [page] = await journal.createEmbeddedDocuments("JournalEntryPage", [data]);
  ui.notifications.info(game.i18n.format("DEWARIM_STUDIO.NpcPage.Created", {name: actor.name, journal: journal.name}));
  if ( show ) journal.sheet.render({force: true, mode: single, pageId: page.id});
  return page;
}

/**
 * The `createActor` hook: a page for a new actor of the active project, when the GM has asked for it. The
 * page is not opened - a GM making five NPCs in a row does not want five windows.
 * @param {Actor} actor
 * @param {object} options  the creation options; `keepId` is how an import announces itself
 * @param {string} userId   who created it - the hook runs on every client
 */
export async function onActorCreated(actor, options, userId) {
  const project = activeProject();
  const decision = {
    enabled: game.settings.get(MODULE_ID, "autoNpcPage"),
    isGM: game.user.isGM,
    self: game.user.id === userId,
    member: !!project && (projectOf(actor) === project.id),
    imported: !!options?.keepId,
    hasPage: false
  };
  if ( !shouldSeedPage(decision) ) return;
  // Looked up last: it walks every journal, and the cheap conditions have already said no.
  if ( findNpcPage(actor) ) return;
  await openNpcPage(actor, {show: false});
}

/** Point new pages at a journal the GM chose, instead of the one the module would make. */
export async function useForNpcPages(journal) {
  await game.settings.set(MODULE_ID, "npcJournal", journal.id);
  ui.notifications.info(game.i18n.format("DEWARIM_STUDIO.NpcPage.JournalSet", {journal: journal.name}));
}
