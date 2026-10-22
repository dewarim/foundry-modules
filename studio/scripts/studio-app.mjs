// The studio window: pick the project, see what belongs to it, build it.
import {buildProject} from "./build.mjs";
import {MODULE_ID, activeProject, members, projects} from "./project.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

export class StudioApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dewarim-studio",
    classes: ["dewarim-studio"],
    window: {title: "DEWARIM_STUDIO.Title", icon: "fa-solid fa-compass-drafting", resizable: true},
    position: {width: 520, height: "auto"},
    actions: {
      build: StudioApp.#onBuild,
      openPack: StudioApp.#onOpenPack,
      openDocument: StudioApp.#onOpenDocument,
      openTable: StudioApp.#onOpenTable,
      openEncounter: () => game.modules.get(MODULE_ID).api.openEncounter(),
      openScene: () => game.modules.get(MODULE_ID).api.openScene(),
      openCommander: () => game.modules.get(MODULE_ID).api.openCommander(),
      // A separate, optional module: the files of the content being authored
      openFiles: () => game.modules.get("dewarim-file-commander")?.api?.open()
    }
  };

  static PARTS = {
    // The body scrolls (a long build report); Foundry keeps its scroll position across renders
    main: {template: `modules/${MODULE_ID}/templates/studio.hbs`, scrollable: [""]}
  };

  /** @type {import("./build.mjs").BuildReport|null} */
  #report = null;
  #building = false;

  /** @override */
  async _prepareContext() {
    const project = activeProject();
    const pack = project ? game.packs.get(`${project.id}.${project.flags[MODULE_ID].pack}`) : null;
    const groups = project ? Object.entries(members(project.id))
      .filter(([, docs]) => docs.length)
      .map(([type, docs]) => ({
        label: _loc(getDocumentClass(type).metadata.labelPlural),
        docs: docs.map(d => ({uuid: d.uuid, name: d.name})).sort((a, b) => a.name.localeCompare(b.name))
      })) : [];
    return {
      projects: projects().map(m => ({id: m.id, title: m.title, selected: m.id === project?.id})),
      project,
      inactive: project && !project.active,
      pack,
      groups,
      empty: project && !groups.length,
      building: this.#building,
      hasFiles: !!game.modules.get("dewarim-file-commander")?.active,
      report: this.#report && this.#reportContext(this.#report)
    };
  }

  #reportContext(r) {
    return {
      created: r.created,
      counts: Object.entries(r.counts).map(([k, n]) => `${n} ${k}`).join(", "),
      added: r.added,
      missing: r.missing,
      modules: [...r.modules].map(([id, refs]) => ({id, refs: refs.slice(0, 5), more: Math.max(0, refs.length - 5)})),
      systemPacks: r.systemPacks,
      copied: r.copied.length,
      failedAssets: r.failedAssets
    };
  }

  /** @override */
  _onRender(context, options) {
    this.element.querySelector("select[name=project]")?.addEventListener("change", async event => {
      await game.settings.set(MODULE_ID, "activeProject", event.target.value);
      this.#report = null;
      this.render();
    });
  }

  static async #onBuild() {
    const project = activeProject();
    if ( !project || this.#building ) return;
    this.#building = true;
    this.render();
    const bar = ui.notifications.info(_loc("DEWARIM_STUDIO.Build.Collecting"), {progress: true});
    try {
      this.#report = await buildProject(project, {
        onProgress: (message, pct) => bar.update({message, pct})
      });
      ui.notifications.info(_loc("DEWARIM_STUDIO.Build.Success", {name: project.title}));
    } catch(err) {
      bar.update({pct: 1});
      ui.notifications.error(err.message, {console: true});
    } finally {
      this.#building = false;
      this.render();
    }
  }

  static #onOpenPack() {
    const project = activeProject();
    game.packs.get(`${project?.id}.${project?.flags[MODULE_ID].pack}`)?.render(true);
  }

  static #onOpenTable(event, target) {
    game.modules.get(MODULE_ID).api.openTable(target.dataset.document);
  }

  static async #onOpenDocument(event, target) {
    (await fromUuid(target.dataset.uuid))?.sheet?.render(true);
  }
}
