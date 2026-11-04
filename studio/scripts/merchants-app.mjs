// Merchants (the optional dewarim-merchants module) in the studio: every merchant in one table, written as
// it is typed; new ones from the system's templates; onto a scene (staging row or where the GM clicks),
// several at once as a market - an encounter draft of merchants; custom stock from the source panel.
// Only the merchants module's API is used: it owns what a merchant is and how he trades.
import {awaitCanvasClick} from "./encounter.mjs";
import {freeStagingPositions} from "./encounter-model.mjs";
import {MODULE_ID, activeProject, assign, projectOf} from "./project.mjs";
import {SOURCE_PANEL_TEMPLATE, SourcePanel} from "./source-panel.mjs";

const MERCHANTS = "dewarim-merchants";
const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

const api = () => game.modules.get(MERCHANTS)?.api;

/** Dropdown options for a race or profession: none, the system's keys, and a value it does not know. */
function choices(list, value) {
  const options = [{key: "", label: "–"}, ...list];
  if ( value && !options.some(o => o.key === value) ) options.push({key: value, label: value});
  return options.map(o => ({...o, selected: o.key === (value ?? "")}));
}

export class MerchantsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options) {
    super(options);
    this.#sources = new SourcePanel(this, {
      types: ["Item"],
      onAdd: uuid => this.#addFixed(uuid),
      addHint: "DEWARIM_STUDIO.Merchants.AddFixed"
    });
  }

  static DEFAULT_OPTIONS = {
    id: "dewarim-studio-merchants",
    classes: ["dewarim-studio", "dewarim-studio-merchants"],
    window: {title: "DEWARIM_STUDIO.Merchants.Title", icon: "fa-solid fa-store", resizable: true},
    position: {width: 1180, height: 620},
    actions: {
      create: MerchantsApp.#onCreate,
      select: MerchantsApp.#onSelect,
      open: MerchantsApp.#onOpen,
      place: MerchantsApp.#onPlace,
      restock: MerchantsApp.#onRestock,
      market: MerchantsApp.#onMarket,
      rules: () => api()?.openRules(),
      openMarket: () => api()?.openMarket()
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/merchants.hbs`, templates: [SOURCE_PANEL_TEMPLATE]}
  };

  #sources;
  /** The merchant custom stock from the source panel goes to */
  #selectedId = null;
  /** Merchants checked for *Market on scene* */
  #checked = new Set();
  #sceneId = null;
  #placement = "staging";
  #template = "";
  #busy = false;

  #merchants() {
    const project = activeProject();
    return game.actors.filter(a => api()?.isMerchant(a))
      .sort((a, b) => ((projectOf(b) === project?.id) - (projectOf(a) === project?.id)) || a.name.localeCompare(b.name, game.i18n.lang));
  }

  /** Where each merchant stands: tokens on any scene. */
  #placed(actor) {
    return game.scenes.contents.flatMap(s => s.tokens.filter(t => t.actorId === actor.id));
  }

  /** @override */
  async _prepareContext() {
    const m = api();
    if ( !m ) return {inactive: true};
    const project = activeProject();
    const merchants = this.#merchants();
    if ( !merchants.some(a => a.id === this.#selectedId) ) this.#selectedId = merchants[0]?.id ?? null;
    const scenes = game.scenes.contents
      .map(s => ({id: s.id, name: s.name, inProject: !!project && (projectOf(s) === project.id)}))
      .sort((a, b) => (b.inProject - a.inProject) || a.name.localeCompare(b.name, game.i18n.lang));
    if ( !scenes.some(s => s.id === this.#sceneId) ) this.#sceneId = (scenes.find(s => s.id === canvas.scene?.id) ?? scenes[0])?.id ?? null;
    const scene = game.scenes.get(this.#sceneId);
    const templates = m.templates();
    const [races, professions] = await Promise.all([m.adapter.races(), m.adapter.professions()]);
    const unit = m.adapter.unit?.label ?? "";
    return {
      templates: [{id: "", label: _loc("DEWARIM_STUDIO.Merchants.NoTemplate"), selected: !this.#template},
        ...templates.map(t => ({id: t.id, label: t.label, selected: t.id === this.#template}))],
      unit,
      rows: merchants.map(actor => {
        const cfg = m.config(actor);
        const placed = this.#placed(actor);
        return {
          id: actor.id, name: actor.name, img: actor.prototypeToken.texture.src || actor.img,
          selected: actor.id === this.#selectedId, checked: this.#checked.has(actor.id),
          inProject: !!project && (projectOf(actor) === project.id),
          ...cfg,
          raceChoices: choices(races, cfg.race),
          professionChoices: choices(professions, cfg.profession),
          fixedCount: cfg.fixed.length,
          placed: placed.length,
          placedHint: [...new Set(placed.map(t => t.parent.name))].join(", ")
        };
      }),
      scenes: scenes.map(s => ({...s, selected: s.id === this.#sceneId})),
      sceneLevel: scene ? (m.sceneLevel(scene) ?? "") : "",
      placements: ["staging", "click"].map(p => ({value: p, label: _loc(`DEWARIM_STUDIO.Encounter.Placement.${p}`), selected: p === this.#placement})),
      selected: game.actors.get(this.#selectedId)?.name ?? "",
      checkedCount: this.#checked.size,
      busy: this.#busy,
      source: await this.#sources.context()
    };
  }

  /** @override */
  _onRender(context, options) {
    const html = this.element;
    this.#sources.activate(html, options);
    html.querySelector("[name=template]")?.addEventListener("change", e => { this.#template = e.target.value; });
    html.querySelector("[name=scene]")?.addEventListener("change", e => { this.#sceneId = e.target.value; this.render(); });
    html.querySelector("[name=placement]")?.addEventListener("change", e => { this.#placement = e.target.value; });
    html.querySelector("[name=sceneLevel]")?.addEventListener("change", async e => {
      const scene = game.scenes.get(this.#sceneId);
      if ( scene ) await api().setSceneLevel(scene, e.target.value);
      this.render();
    });
    html.querySelector(".merchant-rows")?.addEventListener("change", this.#onRowChange.bind(this));
    const rows = html.querySelector(".merchant-rows");
    rows?.addEventListener("dragover", e => e.preventDefault());
    rows?.addEventListener("drop", this.#onDrop.bind(this));
  }

  /** A cell changed: written at once (name on the actor, the rest into the merchant's configuration). */
  async #onRowChange(event) {
    const input = event.target;
    const id = input.closest("[data-actor-id]")?.dataset.actorId;
    const actor = game.actors.get(id);
    if ( !actor ) return;
    const field = input.dataset.field;
    if ( field === "check" ) {
      if ( input.checked ) this.#checked.add(id);
      else this.#checked.delete(id);
      return this.render();
    }
    try {
      if ( field === "name" ) await actor.update({name: input.value.trim() || actor.name, "prototypeToken.name": input.value.trim() || actor.name});
      else if ( field === "period" ) await api().configure(actor, {restock: {period: input.value}});
      else await api().configure(actor, {[field]: input.value});
    } catch(err) {
      ui.notifications.error(err.message, {console: true});
    }
    this.render();
  }

  /** An item dropped on a row becomes that merchant's custom stock. */
  async #onDrop(event) {
    event.preventDefault();
    const id = event.target.closest("[data-actor-id]")?.dataset.actorId;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( !id || !data.uuid ) return;
    this.#selectedId = id;
    await this.#addFixed(data.uuid);
  }

  async #addFixed(uuid) {
    const actor = game.actors.get(this.#selectedId);
    if ( !actor ) return ui.notifications.warn("DEWARIM_STUDIO.Merchants.SelectFirst", {localize: true});
    const item = await fromUuid(uuid);
    if ( !(item instanceof Item) || item.parent ) return;
    const cfg = api().config(actor);
    if ( cfg.fixed.some(f => f.uuid === uuid) ) return;
    await api().configure(actor, {fixed: [...cfg.fixed, {uuid, name: item.name, quantity: 1, replenish: true}]});
    ui.notifications.info(_loc("DEWARIM_STUDIO.Merchants.FixedAdded", {item: item.name, merchant: actor.name}));
    this.render();
  }

  static async #onCreate() {
    const form = this.element;
    const name = form.querySelector("[name=newName]").value.trim();
    const level = Number(form.querySelector("[name=newLevel]").value) || undefined;
    const actor = await api().createMerchant({name, template: this.#template, level});
    const project = activeProject();
    if ( project ) await assign([actor], project);
    this.#selectedId = actor.id;
    this.render();
  }

  static #onSelect(event, target) {
    if ( event.target.closest("input, select, a, button") ) return;
    this.#selectedId = target.closest("[data-actor-id]").dataset.actorId;
    this.render();
  }

  static #onOpen(event, target) {
    game.actors.get(target.closest("[data-actor-id]").dataset.actorId)?.sheet.render({force: true});
  }

  /** One merchant onto the chosen scene: the next free staging cell, or where the GM clicks. */
  static async #onPlace(event, target) {
    const actor = game.actors.get(target.closest("[data-actor-id]").dataset.actorId);
    const scene = game.scenes.get(this.#sceneId);
    if ( !actor || !scene || this.#busy ) return;
    this.#busy = true;
    this.render();
    try {
      let position;
      if ( this.#placement === "click" ) {
        if ( canvas.scene?.id !== scene.id ) await scene.view();
        ui.notifications.info("DEWARIM_STUDIO.Encounter.ClickHint", {localize: true});
        await this.minimize();
        const point = await awaitCanvasClick();
        await this.maximize();
        if ( !point ) return;
        const grid = scene.grid.size;
        position = {x: Math.floor(point.x / grid) * grid, y: Math.floor(point.y / grid) * grid};
      }
      else {
        const occupied = scene.tokens.map(t => ({x: t.x, y: t.y, w: t.width, h: t.height}));
        const footprint = {w: actor.prototypeToken.width, h: actor.prototypeToken.height};
        [position] = freeStagingPositions(scene.dimensions.sceneRect, scene.grid.size, occupied, [footprint]);
      }
      await api().placeMerchant(scene, actor, position);
      const project = activeProject();
      if ( project ) await assign([actor, scene], project);
      ui.notifications.info(_loc("DEWARIM_STUDIO.Merchants.PlacedOn", {name: actor.name, scene: scene.name}));
    } catch(err) {
      ui.notifications.error(err.message, {console: true});
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  /** Restock every placed token of a merchant. */
  static async #onRestock(event, target) {
    const actor = game.actors.get(target.closest("[data-actor-id]").dataset.actorId);
    if ( !actor ) return;
    const count = await api().restockAll(this.#placed(actor), {force: true});
    ui.notifications.info(_loc("DEWARIM_STUDIO.Merchants.Restocked", {name: actor.name, count}));
    this.render();
  }

  /** The checked merchants as a new encounter draft on the chosen scene: placed, saved, undone there. */
  static async #onMarket() {
    const actors = [...this.#checked].map(id => game.actors.get(id)).filter(Boolean);
    if ( !actors.length ) return ui.notifications.warn("DEWARIM_STUDIO.Merchants.CheckFirst", {localize: true});
    await game.modules.get(MODULE_ID).api.openEncounter();
    const editor = foundry.applications.instances.get("dewarim-studio-encounter");
    await editor?.fill(actors, this.#sceneId);
  }
}
