// The changelog notice: after a module is installed or updated, a GM sees what changed - once per
// version and user. All dewarim modules that are active share one window (the first to load shows it
// for everyone), and each module gets a "What's new" button in its settings to open its history again.
//
// SHARED FILE: the original is shared/changelog/ in the repository; every module carries a copy in
// scripts/shared/ (modules cannot import each other's files). Edit the original and run
// `node scripts/sync-shared.mjs` - a test fails while a copy differs.
import {markdownToHtml, parseChangelog, unseen} from "./changelog-model.mjs";

const TEXT = {
  en: {title: "What's new", all: "Changelog", installed: "Installed", close: "Got it", menu: "What's new",
    menuHint: "This module's changelog.", none: "No changelog."},
  de: {title: "Neuigkeiten", all: "Änderungen", installed: "Installiert", close: "Verstanden", menu: "Neuigkeiten",
    menuHint: "Die Änderungen dieses Moduls.", none: "Keine Änderungen verzeichnet."}
};
/** The user's language (known from i18nInit on). */
const language = () => game.i18n?.lang || "en";
const t = key => (TEXT[language()] ?? TEXT.en)[key];

const STYLE = `<style>
  .dewarim-changelog-body h2 { font-size: 1.3em; margin: 0.4em 0 0.2em; border: none; }
  .dewarim-changelog-body h2 small { font-size: 0.75em; opacity: 0.7; }
  .dewarim-changelog-body h3 { font-size: 1.05em; margin: 0.6em 0 0.2em; border: none; }
  .dewarim-changelog-body h4 { font-size: 1em; margin: 0.4em 0 0.1em; }
  .dewarim-changelog-date { font-weight: normal; opacity: 0.7; margin-left: 0.4em; }
</style>`;

/** Shared by every module's copy: who registered, and whether the notice is on its way already. */
const registry = globalThis.dewarimChangelog ??= {modules: [], scheduled: false};

async function sectionsOf(moduleId) {
  try {
    const response = await fetch(foundry.utils.getRoute(`modules/${moduleId}/CHANGELOG.md`), {cache: "no-cache"});
    return response.ok ? parseChangelog(await response.text()) : [];
  } catch {
    return [];
  }
}

const escape = text => foundry.utils.escapeHTML(String(text ?? ""));

function sectionHtml(section) {
  const date = section.date ? ` <span class="dewarim-changelog-date">${escape(section.date)}</span>` : "";
  return `<section><h3>${escape(section.version)}${date}</h3>${markdownToHtml(section.body)}</section>`;
}

function element(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

/** A window with HTML: the notice after an update, or one module's whole history. */
function show(title, html) {
  return new foundry.applications.api.DialogV2({
    window: {title, icon: "fa-solid fa-gift", resizable: true},
    position: {width: 560, height: "auto"},
    classes: ["dewarim-changelog"],
    // An element, not a string: DialogV2 cleans string content and would drop the <style>. The HTML here
    // is ours - markdownToHtml escapes everything the changelog says.
    content: element(`${STYLE}<div class="dewarim-changelog-body" style="max-height: 70vh; overflow-y: auto">${html}</div>`),
    buttons: [{action: "close", label: t("close"), default: true}]
  }).render({force: true});
}

/** The notice: every registered module with something unseen, in one window; marked seen when shown. */
async function notify() {
  const parts = [];
  for ( const moduleId of registry.modules ) {
    const module = game.modules.get(moduleId);
    if ( !module?.active ) continue;
    const seen = game.user.getFlag(moduleId, "changelogSeen") ?? null;
    if ( seen === module.version ) continue;
    const news = unseen(await sectionsOf(moduleId), module.version, seen);
    if ( news.length ) {
      const what = seen ? `${escape(seen)} → ${escape(module.version)}` : `${t("installed")} ${escape(module.version)}`;
      parts.push(`<h2>${escape(module.title)} <small>${what}</small></h2>${news.map(sectionHtml).join("")}`);
    }
    await game.user.setFlag(moduleId, "changelogSeen", module.version);
  }
  if ( parts.length ) show(t("title"), parts.join("<hr>"));
}

/** One module's whole history (the settings button). */
async function history(moduleId) {
  const sections = (await sectionsOf(moduleId)).filter(s => s.version.toLowerCase() !== "unreleased");
  const module = game.modules.get(moduleId);
  show(`${module?.title ?? moduleId}: ${t("all")}`, sections.length ? sections.map(sectionHtml).join("") : `<p>${t("none")}</p>`);
}

/**
 * Call once from a module's entry script. Registers the module for the notice (GMs, on ready) and a
 * "What's new" button in its settings.
 * @param {string} moduleId
 */
export function registerChangelog(moduleId) {
  if ( !registry.modules.includes(moduleId) ) registry.modules.push(moduleId);
  // i18nInit, not init: the button's label is plain text in the user's language, which is known only now
  Hooks.once("i18nInit", () => {
    // registerMenu wants an application class; this one only opens the history and closes again
    class ChangelogMenu extends foundry.applications.api.ApplicationV2 {
      async render() {
        history(moduleId);
        return this;
      }
    }
    game.settings.registerMenu(moduleId, "changelog", {
      name: t("menu"), label: t("menu"), hint: t("menuHint"), icon: "fa-solid fa-gift",
      type: ChangelogMenu, restricted: false
    });
  });
  if ( registry.scheduled ) return;
  registry.scheduled = true;
  Hooks.once("ready", () => {
    if ( game.user.isGM ) notify().catch(err => console.warn("dewarim changelog:", err));
  });
}
