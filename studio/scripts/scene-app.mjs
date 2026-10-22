// Scene contents: everything placed on one scene as tables - tokens, doors, notes, tiles, lights - with
// the switches a GM flips while preparing (hidden, door state, disposition, HP). Unlike the document
// tables, changes are written at once: these are toggles, not a batch of edits.
import {encounterSupport} from "./encounter.mjs";
import {MODULE_ID, activeProject, projectOf} from "./project.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/** Embedded collections shown, in tab order: [tab id, document name, collection name]. */
export const SECTIONS = [
  ["tokens", "Token", "tokens"],
  ["doors", "Wall", "walls"],
  ["notes", "Note", "notes"],
  ["tiles", "Tile", "tiles"],
  ["lights", "AmbientLight", "lights"]
];

export class SceneApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dewarim-studio-scene",
    classes: ["dewarim-studio", "dewarim-studio-scene"],
    window: {title: "DEWARIM_STUDIO.Scene.Title", icon: "fa-solid fa-map", resizable: true},
    position: {width: 820, height: 560},
    actions: {
      switchTab: SceneApp.#onTab,
      view: SceneApp.#onView,
      pan: SceneApp.#onPan,
      openActor: SceneApp.#onOpenActor,
      openJournal: SceneApp.#onOpenJournal,
      bulk: SceneApp.#onBulk,
      cycleDoor: SceneApp.#onCycleDoor
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/scene.hbs`, scrollable: [".scene-scroll"]}
  };

  #sceneId = null;
  #tab = "tokens";

  get scene() {
    return game.scenes.get(this.#sceneId);
  }

  /** Show a specific scene. */
  showScene(sceneId) {
    this.#sceneId = sceneId;
    return this.render({force: true});
  }

  /** @override */
  async _prepareContext() {
    const project = activeProject();
    const scenes = game.scenes.contents
      .map(s => ({id: s.id, name: s.name, inProject: !!project && (projectOf(s) === project.id)}))
      .sort((a, b) => (b.inProject - a.inProject) || a.name.localeCompare(b.name));
    if ( !this.scene ) this.#sceneId = (scenes.find(s => s.id === canvas.scene?.id) ?? scenes[0])?.id ?? null;
    const scene = this.scene;
    const counts = Object.fromEntries(SECTIONS.map(([tab]) => [tab, scene ? this.#rows(tab, scene).length : 0]));
    return {
      scenes: scenes.map(s => ({...s, selected: s.id === this.#sceneId})),
      scene,
      viewed: scene && (canvas.scene?.id === scene.id),
      tabs: SECTIONS.map(([tab]) => ({id: tab, label: _loc(`DEWARIM_STUDIO.Scene.Tab.${tab}`), count: counts[tab], active: tab === this.#tab})),
      tab: this.#tab,
      isTokens: this.#tab === "tokens",
      isDoors: this.#tab === "doors",
      isNotes: this.#tab === "notes",
      isTiles: this.#tab === "tiles",
      isLights: this.#tab === "lights",
      hasHp: !!encounterSupport.hpPath,
      rows: scene ? this.#rows(this.#tab, scene).map(d => this.#row(this.#tab, d)) : []
    };
  }

  #rows(tab, scene) {
    switch ( tab ) {
      case "tokens": return scene.tokens.contents.sort((a, b) => a.name.localeCompare(b.name));
      case "doors": return scene.walls.filter(w => w.door !== CONST.WALL_DOOR_TYPES.NONE);
      case "notes": return scene.notes.contents;
      case "tiles": return scene.tiles.contents;
      case "lights": return scene.lights.contents;
    }
    return [];
  }

  #row(tab, doc) {
    const base = {id: doc.id, x: Math.round(doc.x ?? doc.c?.[0] ?? 0), y: Math.round(doc.y ?? doc.c?.[1] ?? 0)};
    switch ( tab ) {
      case "tokens": {
        const actor = doc.actor;
        const hp = encounterSupport.hpPath ? foundry.utils.getProperty(actor ?? {}, encounterSupport.hpPath) : null;
        const items = actor?.items.contents ?? [];
        return {
          ...base,
          img: doc.texture.src,
          name: doc.name,
          // An unlinked token's actor carries the token's name; the base actor is what the GM recognizes
          actorName: game.actors.get(doc.actorId)?.name ?? actor?.name ?? "?",
          linked: doc.actorLink,
          hidden: doc.hidden,
          dispositions: Object.entries(CONST.TOKEN_DISPOSITIONS).map(([key, value]) => ({
            value, label: _loc(`TOKEN.DISPOSITION.${key}`), selected: value === doc.disposition
          })),
          hp: hp?.value ?? "",
          hpMax: hp?.max ?? "",
          items: items.length,
          itemNames: items.map(i => i.name).join(", ")
        };
      }
      case "doors": {
        const states = Object.entries(CONST.WALL_DOOR_STATES);
        return {
          ...base,
          secret: doc.door === CONST.WALL_DOOR_TYPES.SECRET,
          ds: doc.ds,
          stateLabel: _loc(`DEWARIM_STUDIO.Scene.Door.${states.find(([, v]) => v === doc.ds)?.[0] ?? "CLOSED"}`),
          states: states.map(([key, value]) => ({value, label: _loc(`DEWARIM_STUDIO.Scene.Door.${key}`), selected: value === doc.ds}))
        };
      }
      case "notes": {
        const entry = game.journal.get(doc.entryId);
        return {
          ...base,
          img: doc.texture.src,
          text: doc.text ?? "",
          entry: entry?.name ?? "",
          entryUuid: entry?.uuid ?? "",
          page: entry?.pages.get(doc.pageId)?.name ?? "",
          global: doc.global,
          locked: doc.locked
        };
      }
      case "tiles":
        return {...base, img: doc.texture.src, name: doc.name || (doc.texture.src ?? "").split("/").pop(), hidden: doc.hidden, locked: doc.locked};
      case "lights":
        return {...base, name: doc.name || "", hidden: doc.hidden, locked: doc.locked, bright: doc.config.bright, dim: doc.config.dim};
    }
    return base;
  }

  /** @override */
  _onRender() {
    this.element.querySelector("[name=scene]")?.addEventListener("change", e => { this.#sceneId = e.target.value; this.render(); });
    this.element.querySelector("tbody")?.addEventListener("change", this.#onChange.bind(this));
  }

  /** Every input writes at once: a field of the placed document, or the token's actor HP. */
  async #onChange(event) {
    const input = event.target;
    const field = input.dataset.field;
    const id = input.closest("tr")?.dataset.id;
    if ( !field || !id ) return;
    const [, documentName] = SECTIONS.find(([tab]) => tab === this.#tab);
    const scene = this.scene;
    let value = input.type === "checkbox" ? input.checked : input.value;
    try {
      if ( field === "hp" ) {
        const actor = scene.tokens.get(id)?.actor;
        const n = Number(value);
        if ( actor && Number.isFinite(n) ) await actor.update({[`${encounterSupport.hpPath}.value`]: n});
        return;
      }
      if ( input.dataset.type === "number" ) value = Number(value);
      await scene.updateEmbeddedDocuments(documentName, [{_id: id, [field]: value}]);
    } catch(err) {
      ui.notifications.error(err.message, {console: true});
      this.render();
    }
  }

  static #onTab(event, target) {
    this.#tab = target.dataset.tab;
    this.render();
  }

  static async #onView() {
    await this.scene?.view();
    this.render();
  }

  /** Pan the canvas to the row's document and, for a token, select it. */
  static async #onPan(event, target) {
    const scene = this.scene;
    if ( !scene ) return;
    if ( canvas.scene?.id !== scene.id ) await scene.view();
    const id = target.closest("tr").dataset.id;
    const [, documentName, collection] = SECTIONS.find(([tab]) => tab === this.#tab);
    const doc = scene[collection].get(id);
    const center = doc?.object?.center ?? {x: doc?.x ?? doc?.c?.[0], y: doc?.y ?? doc?.c?.[1]};
    if ( center.x === undefined ) return;
    await canvas.animatePan({x: center.x, y: center.y, scale: Math.max(canvas.stage.scale.x, 1), duration: 400});
    if ( documentName === "Token" ) doc.object?.control({releaseOthers: true});
    this.render();
  }

  static #onOpenActor(event, target) {
    this.scene?.tokens.get(target.closest("tr").dataset.id)?.actor?.sheet?.render(true);
  }

  static async #onOpenJournal(event, target) {
    (await fromUuid(target.dataset.uuid))?.sheet?.render(true);
  }

  /** Door state: closed -> open -> locked -> closed. */
  static async #onCycleDoor(event, target) {
    const wall = this.scene?.walls.get(target.closest("tr").dataset.id);
    if ( !wall ) return;
    const order = [CONST.WALL_DOOR_STATES.CLOSED, CONST.WALL_DOOR_STATES.OPEN, CONST.WALL_DOOR_STATES.LOCKED];
    await wall.update({ds: order[(order.indexOf(wall.ds) + 1) % order.length]});
  }

  /** One field on every row of the current tab: "hide all", "lock all doors" ... */
  static async #onBulk(event, target) {
    const scene = this.scene;
    if ( !scene ) return;
    const [, documentName] = SECTIONS.find(([tab]) => tab === this.#tab);
    const field = target.dataset.field;
    const value = JSON.parse(target.dataset.value);
    const updates = this.#rows(this.#tab, scene).map(d => ({_id: d.id, [field]: value}));
    if ( updates.length ) await scene.updateEmbeddedDocuments(documentName, updates);
  }

  /** Re-render when something on the shown scene changes - unless an input has the focus. */
  refreshFor(document) {
    if ( !this.rendered || (document.parent?.id !== this.#sceneId) ) return;
    if ( this.element.contains(globalThis.document.activeElement) && (globalThis.document.activeElement.tagName !== "BUTTON") ) return;
    this.render();
  }
}
