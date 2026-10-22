// The encounter editor: drop actors (mob rows) and items (loot rows), say how many, who carries what,
// hidden or not - then one click creates the tokens on the scene, at a staging row along the bottom edge
// or where the GM clicks. Base actors from a compendium are copied into the world once. The source panel
// on the right offers actors and items from the project, the world and every compendium. Drafts are kept
// on the scene (flag `encounters`), so they travel with the content module and can be placed in play.
// With a system's rating support (dnd5e), a strip rates the rows against a party while they are built, and
// manages the parties: new, members in and out, primary.
import {awaitCanvasClick, createEncounter, encounterSupport, sceneChests, worldActor} from "./encounter.mjs";
import {defaultPattern, draftChanged, encounterXp, fromDraft, parseHp, toDraft, upsertDraft} from "./encounter-model.mjs";
import {MODULE_ID, activeProject, projectOf} from "./project.mjs";
import {SOURCE_PANEL_TEMPLATE, SourcePanel} from "./source-panel.mjs";
import {recorded, undo} from "./undo.mjs";

/** Placements that can be taken back */
const UNDO_DEPTH = 10;

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

export class EncounterApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options) {
    super(options);
    this.#sources = new SourcePanel(this, {
      types: ["Actor", "Item"],
      onAdd: async uuid => this.#add(await fromUuid(uuid)),
      addHint: "DEWARIM_STUDIO.Encounter.AddFromSource"
    });
  }

  static DEFAULT_OPTIONS = {
    id: "dewarim-studio-encounter",
    classes: ["dewarim-studio", "dewarim-studio-encounter"],
    window: {title: "DEWARIM_STUDIO.Encounter.Title", icon: "fa-solid fa-dragon", resizable: true},
    position: {width: 1080, height: 640},
    actions: {
      create: EncounterApp.#onCreate,
      clear: EncounterApp.#onClear,
      removeMob: EncounterApp.#onRemoveMob,
      removeLoot: EncounterApp.#onRemoveLoot,
      saveDraft: EncounterApp.#onSaveDraft,
      deleteDraft: EncounterApp.#onDeleteDraft,
      undoPlacement: EncounterApp.#onUndoPlacement,
      newParty: EncounterApp.#onNewParty,
      removeHero: EncounterApp.#onRemoveHero,
      openHero: EncounterApp.#onOpenHero,
      makePrimary: EncounterApp.#onMakePrimary,
      openParty: EncounterApp.#onOpenParty
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/encounter.hbs`, templates: [SOURCE_PANEL_TEMPLATE]}
  };

  /** @type {{uuid: string, name: string, img: string, count: number, pattern: string, hp: string, hidden: boolean, disposition: number}[]} */
  #mobs = [];
  /** @type {{uuid: string, name: string, img: string, quantity: number, target: string}[]} */
  #loot = [];
  #sceneId = null;
  #placement = "staging";
  #chestName = "";
  #busy = false;
  #sources;
  /** The draft being edited (null: not saved yet) and its name */
  #draftId = null;
  #draftName = "";
  /** Where leftover loot goes: an existing chest's actor id, "new", or "auto" (the scene's newest chest, else new) */
  #chestChoice = "auto";
  /**
   * Placements that can be taken back, newest last: {label, log, chestChoice}. The log (undo.mjs) holds
   * what the placement created and changed - tokens, a new chest, items, named actors. Base actors copied
   * from a compendium into the world are not in it: the rows point at those copies and reuse them.
   */
  #placements = [];
  /** What compendium actors are worth (uuid -> Promise<{xp, cr, label}|null>): loading one takes a while */
  #creatures = new Map();

  /** The chest choice resolved against the chests on the scene. */
  #chest(scene = this.#scene) {
    const chests = sceneChests(scene);
    const id = this.#chestChoice === "auto" ? (chests[0]?.id ?? "new") : this.#chestChoice;
    return {chests, id: chests.some(c => c.id === id) ? id : "new"};
  }

  get #scene() {
    return game.scenes.get(this.#sceneId);
  }

  /** Drafts kept on a scene. */
  #drafts(scene = this.#scene) {
    return scene?.getFlag(MODULE_ID, "encounters") ?? [];
  }

  /* -------------------------------------------- */
  /*  Rating and party                            */
  /* -------------------------------------------- */

  /** The party choice, resolved: "" (or a party that is gone) is the primary party, else the players' characters, else a size. */
  #party() {
    const rating = encounterSupport.rating;
    const stored = game.settings.get(MODULE_ID, "encounterParty") ?? {};
    const parties = rating.parties();
    let id = stored.id;
    if ( !["players", "custom"].includes(id) && !parties.some(p => p.id === id) ) {
      id = rating.primary() ?? (rating.heroes("players").length ? "players" : "custom");
    }
    const count = Math.max(1, Math.min(12, parseInt(stored.count) || 4));
    const level = Math.max(1, Math.min(20, parseInt(stored.level) || 1));
    return {id, count, level, parties};
  }

  #setParty(changes) {
    const {id, count, level} = this.#party();
    return game.settings.set(MODULE_ID, "encounterParty", {id, count, level, ...changes});
  }

  /** What a row's actor is worth (null: nothing known, or not a creature that counts). */
  async #creature(uuid) {
    const rating = encounterSupport.rating;
    const doc = fromUuidSync(uuid, {strict: false});
    if ( doc instanceof Actor ) return rating.creature(doc);
    if ( !this.#creatures.has(uuid) ) {
      this.#creatures.set(uuid, fromUuid(uuid).then(a => (a instanceof Actor ? rating.creature(a) : null)).catch(() => null));
    }
    return this.#creatures.get(uuid);
  }

  /** The rating strip and each row's worth; null without rating support. */
  async #ratingContext() {
    const rating = encounterSupport.rating;
    if ( !rating ) return null;
    const party = this.#party();
    const heroes = party.id === "custom"
      ? Array.from({length: party.count}, () => ({level: party.level, counted: true}))
      : rating.heroes(party.id);
    const levels = heroes.filter(h => h.counted).map(h => h.level);
    const format = new Intl.NumberFormat(game.i18n.lang);
    const rows = await Promise.all(this.#mobs.map(async m => {
      const info = await this.#creature(m.uuid);
      return {count: m.count, xp: info?.xp ?? null, cr: info?.cr ?? null, label: info?.label ?? "",
        counted: m.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY};
    }));
    const result = rating.rate(encounterXp(rows), levels);
    const group = party.parties.find(p => p.id === party.id);
    const label = key => _loc(`DEWARIM_STUDIO.Encounter.Rating.${key}`);
    return {
      parties: [
        ...party.parties.map(p => ({value: p.id, label: p.primary ? `★ ${p.name}` : p.name, selected: p.id === party.id})),
        {value: "players", label: _loc("DEWARIM_STUDIO.Encounter.Party.Players"), selected: party.id === "players"},
        {value: "custom", label: _loc("DEWARIM_STUDIO.Encounter.Party.Custom"), selected: party.id === "custom"}
      ],
      custom: party.id === "custom",
      count: party.count,
      level: party.level,
      group: group ?? null,
      heroes: party.id === "custom" ? [] : heroes,
      noHeroes: (party.id !== "custom") && !levels.length,
      result: {
        ...result,
        label: result.rating ? label(result.rating) : label("NoParty"),
        xp: format.format(result.xp),
        budget: _loc("DEWARIM_STUDIO.Encounter.Rating.Budget", {low: format.format(result.budget.low),
          moderate: format.format(result.budget.moderate), high: format.format(result.budget.high)})
      },
      rows: rows.map(r => {
        if ( !r.counted ) return {text: _loc("DEWARIM_STUDIO.Encounter.Rating.Ally"), dim: true, hint: _loc("DEWARIM_STUDIO.Encounter.Rating.AllyHint")};
        if ( r.xp === null ) return {text: "–", dim: true, hint: _loc("DEWARIM_STUDIO.Encounter.Rating.NoXp")};
        const strong = (result.level > 0) && (r.cr > result.level);
        return {
          text: [r.label, format.format(Math.max(0, r.count) * r.xp)].filterJoin(" · "),
          hint: _loc("DEWARIM_STUDIO.Encounter.Rating.Each", {xp: format.format(r.xp)})
            + (strong ? ` ${_loc("DEWARIM_STUDIO.Encounter.Rating.Strong", {level: result.level})}` : ""),
          strong
        };
      })
    };
  }

  /** An actor dropped on the strip joins the chosen party. */
  async #onPartyDrop(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const actor = data.uuid ? await fromUuid(data.uuid) : null;
    if ( !(actor instanceof Actor) || actor.isToken ) return;
    const party = this.#party();
    if ( !party.parties.some(p => p.id === party.id) ) return ui.notifications.warn("DEWARIM_STUDIO.Encounter.Party.PickFirst", {localize: true});
    try {
      const added = await encounterSupport.rating.addToParty(party.id, actor);
      ui.notifications.info(_loc("DEWARIM_STUDIO.Encounter.Party.Added", {actor: added.name, party: game.actors.get(party.id)?.name}));
    } catch(err) {
      ui.notifications.error(err.message, {console: true});
    }
    this.render();
  }

  static async #onNewParty() {
    const rating = encounterSupport.rating;
    const players = game.actors.filter(a => (a.type === "character") && a.hasPlayerOwner);
    const escape = foundry.utils.escapeHTML;
    const content = `<label>${_loc("DEWARIM_STUDIO.Encounter.Party.Name")} <input type="text" name="name" value="${escape(_loc("DEWARIM_STUDIO.Encounter.Party.DefaultName"))}" autofocus></label>`
      + (players.length ? `<label><input type="checkbox" name="players" checked> ${escape(_loc("DEWARIM_STUDIO.Encounter.Party.WithPlayers",
        {names: players.map(a => a.name).join(", ")}))}</label>` : "");
    const form = await foundry.applications.api.DialogV2.prompt({
      window: {title: "DEWARIM_STUDIO.Encounter.Party.New"},
      content,
      ok: {label: "DEWARIM_STUDIO.Encounter.Party.Create",
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object},
      rejectClose: false
    });
    if ( !form ) return;
    try {
      const group = await rating.createParty(String(form.name ?? "").trim() || _loc("DEWARIM_STUDIO.Encounter.Party.DefaultName"),
        form.players ? players : []);
      await this.#setParty({id: group.id});
    } catch(err) {
      ui.notifications.error(err.message, {console: true});
    }
    this.render();
  }

  static async #onRemoveHero(event, target) {
    event.stopPropagation();
    try {
      await encounterSupport.rating.removeFromParty(this.#party().id, target.closest("[data-actor-id]").dataset.actorId);
    } catch(err) {
      ui.notifications.error(err.message, {console: true});
    }
    this.render();
  }

  static #onOpenHero(event, target) {
    game.actors.get(target.closest("[data-actor-id]").dataset.actorId)?.sheet.render({force: true});
  }

  static async #onMakePrimary() {
    await encounterSupport.rating.makePrimary(this.#party().id);
    this.render();
  }

  static #onOpenParty() {
    encounterSupport.rating.openParty(this.#party().id);
  }

  get #state() {
    return {name: this.#draftName, placement: this.#placement, chestName: this.#chestName, mobs: this.#mobs, loot: this.#loot};
  }

  /** @override */
  async _prepareContext() {
    const project = activeProject();
    const scenes = game.scenes.contents
      .map(s => ({id: s.id, name: s.name, inProject: !!project && (projectOf(s) === project.id)}))
      .sort((a, b) => (b.inProject - a.inProject) || a.name.localeCompare(b.name));
    if ( !scenes.some(s => s.id === this.#sceneId) ) {
      this.#sceneId = (scenes.find(s => s.id === canvas.scene?.id) ?? scenes[0])?.id ?? null;
    }
    const dispositions = Object.entries(CONST.TOKEN_DISPOSITIONS).map(([key, value]) => ({
      value, label: _loc(`TOKEN.DISPOSITION.${key}`)
    }));
    const targets = [{value: "chest", label: _loc("DEWARIM_STUDIO.Encounter.Chest")}];
    this.#mobs.forEach((m, i) => targets.push(
      {value: `each:${i}`, label: _loc("DEWARIM_STUDIO.Encounter.Each", {name: m.name})},
      {value: `first:${i}`, label: _loc("DEWARIM_STUDIO.Encounter.First", {name: m.name})}
    ));
    const scene = game.scenes.get(this.#sceneId);
    const drafts = this.#drafts(scene);
    const stored = drafts.find(d => d.id === this.#draftId);
    // A row whose actor or item is gone (deleted, or its compendium not installed here)
    const exists = uuid => !!fromUuidSync(uuid, {strict: false});
    const chest = this.#chest(scene);
    const rating = await this.#ratingContext();
    return {
      chests: [
        ...chest.chests.map(c => ({id: c.id, label: _loc("DEWARIM_STUDIO.Encounter.ExistingChest", {name: c.name, count: c.items.size}),
          selected: c.id === chest.id})),
        {id: "new", label: _loc("DEWARIM_STUDIO.Encounter.NewChest"), selected: chest.id === "new"}
      ],
      chestIsNew: chest.id === "new",
      drafts: [{id: "", label: _loc("DEWARIM_STUDIO.Encounter.Draft.New"), selected: !stored},
        ...drafts.map(d => ({id: d.id, label: d.name || "–", selected: d.id === this.#draftId}))],
      draftName: this.#draftName,
      draftPlaceholder: _loc("DEWARIM_STUDIO.Encounter.Draft.Default", {n: drafts.length + 1}),
      hasDraft: !!stored,
      draftDirty: draftChanged(this.#state, stored),
      scenes: scenes.map(s => ({...s, selected: s.id === this.#sceneId})),
      placements: ["staging", "click"].map(p => ({value: p, label: _loc(`DEWARIM_STUDIO.Encounter.Placement.${p}`), selected: p === this.#placement})),
      chestName: this.#chestName,
      chestPlaceholder: _loc("DEWARIM_STUDIO.Encounter.ChestDefault", {scene: scene?.name ?? ""}),
      hasHp: !!encounterSupport.hpDelta,
      hasQuantity: !!encounterSupport.quantityPath,
      mobs: this.#mobs.map((m, index) => ({
        ...m, index,
        missing: !exists(m.uuid),
        worth: rating?.rows[index],
        unique: m.kind === "unique",
        kinds: ["group", "named"].map(k => ({value: k, label: _loc(`DEWARIM_STUDIO.Encounter.Kind.${k}`), selected: k === m.kind})),
        patternHint: _loc(m.kind === "named" ? "DEWARIM_STUDIO.Encounter.NamesHint" : "DEWARIM_STUDIO.Encounter.PatternHint"),
        dispositions: dispositions.map(d => ({...d, selected: d.value === m.disposition}))
      })),
      loot: this.#loot.map((l, index) => ({...l, index, missing: !exists(l.uuid),
        targets: targets.map(t => ({...t, selected: t.value === l.target}))})),
      tokenCount: this.#mobs.reduce((n, m) => n + m.count, 0),
      undoLabel: this.#placements.length ? _loc("DEWARIM_STUDIO.Commander.UndoLast", {action: this.#placements.at(-1).label}) : null,
      busy: this.#busy,
      canCreate: !this.#busy && !!scene && this.#mobs.some(m => m.count > 0),
      rating,
      source: await this.#sources.context()
    };
  }

  /** @override */
  _onRender(context, options) {
    const html = this.element;
    this.#sources.activate(html, options);
    html.querySelector("[name=scene]")?.addEventListener("change", e => {
      // The rows stay (to place them elsewhere too); saving now makes a new draft on that scene
      this.#sceneId = e.target.value;
      this.#draftId = null;
      this.#chestChoice = "auto";
      this.render();
    });
    html.querySelector("[name=draft]")?.addEventListener("change", e => this.#loadDraft(e.target.value));
    html.querySelector("[name=draftName]")?.addEventListener("change", e => { this.#draftName = e.target.value.trim(); this.render(); });
    html.querySelector("[name=placement]")?.addEventListener("change", e => { this.#placement = e.target.value; this.render(); });
    html.querySelector("[name=chestName]")?.addEventListener("change", e => { this.#chestName = e.target.value.trim(); this.render(); });
    html.querySelector("[name=chest]")?.addEventListener("change", e => { this.#chestChoice = e.target.value; this.render(); });
    html.querySelector(".mobs")?.addEventListener("change", this.#onMobChange.bind(this));
    html.querySelector("[name=party]")?.addEventListener("change", async e => { await this.#setParty({id: e.target.value}); this.render(); });
    for ( const field of ["count", "level"] ) {
      html.querySelector(`[name=party-${field}]`)?.addEventListener("change", async e => {
        await this.#setParty({[field]: parseInt(e.target.value) || 1});
        this.render();
      });
    }
    html.querySelector(".loot")?.addEventListener("change", this.#onLootChange.bind(this));
    for ( const zone of html.querySelectorAll("[data-drop]") ) {
      zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", e => {
        zone.classList.remove("drag-over");
        if ( zone.dataset.drop === "Party" ) this.#onPartyDrop(e);
        else this.#onDrop(e);
      });
    }
  }

  #onMobChange(event) {
    const input = event.target;
    const row = input.closest("tr");
    if ( !row ) return;     // a field of the section, not of a row
    const mob = this.#mobs[Number(row.dataset.index)];
    const field = input.dataset.field;
    if ( field === "count" ) {
      const count = Math.max(0, Math.min(100, parseInt(input.value) || 0));
      const wasDefault = mob.pattern === defaultPattern(mob.count);
      mob.count = count;
      if ( wasDefault ) mob.pattern = defaultPattern(count);
      return this.render();
    }
    if ( field === "kind" ) {
      mob.kind = input.value;
      return this.render();
    }
    if ( field === "hidden" ) mob.hidden = input.checked;
    else if ( field === "disposition" ) {
      mob.disposition = Number(input.value);
      if ( encounterSupport.rating ) return this.render();     // allies do not count
    }
    else if ( field === "hp" ) {
      mob.hp = input.value;
      const invalid = "error" in parseHp(input.value);
      input.closest("td").classList.toggle("invalid", invalid);
    }
    else mob[field] = input.value;
    this.#markDirty();
  }

  /** Update the "unsaved" mark without a re-render (typing in a row must not lose focus). */
  #markDirty() {
    const stored = this.#drafts().find(d => d.id === this.#draftId);
    this.element?.querySelector("[data-action=saveDraft]")?.classList.toggle("dirty", draftChanged(this.#state, stored));
  }

  #loadDraft(id) {
    const draft = this.#drafts().find(d => d.id === id);
    const state = fromDraft(draft);
    this.#draftId = draft ? id : null;
    this.#draftName = state.name;
    this.#placement = state.placement;
    this.#chestName = state.chestName;
    this.#mobs = state.mobs;
    this.#loot = state.loot;
    this.#chestChoice = "auto";
    this.render();
  }

  static async #onSaveDraft() {
    const scene = this.#scene;
    if ( !scene ) return;
    const drafts = this.#drafts(scene);
    const id = this.#draftId ?? foundry.utils.randomID();
    this.#draftName ||= _loc("DEWARIM_STUDIO.Encounter.Draft.Default", {n: drafts.length + 1});
    await scene.setFlag(MODULE_ID, "encounters", upsertDraft(drafts, toDraft(this.#state, id)));
    this.#draftId = id;
    ui.notifications.info(_loc("DEWARIM_STUDIO.Encounter.Draft.Saved", {name: this.#draftName, scene: scene.name}));
    this.render();
  }

  static async #onDeleteDraft() {
    const scene = this.#scene;
    const draft = this.#drafts(scene).find(d => d.id === this.#draftId);
    if ( !draft ) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {title: "DEWARIM_STUDIO.Encounter.Draft.Delete"},
      content: `<p>${_loc("DEWARIM_STUDIO.Encounter.Draft.DeleteConfirm", {name: foundry.utils.escapeHTML(draft.name), scene: foundry.utils.escapeHTML(scene.name)})}</p>`
    });
    if ( !ok ) return;
    const rest = this.#drafts(scene).filter(d => d.id !== draft.id);
    if ( rest.length ) await scene.setFlag(MODULE_ID, "encounters", rest);
    else await scene.unsetFlag(MODULE_ID, "encounters");
    // The rows stay in the editor, as an unsaved draft
    this.#draftId = null;
    this.render();
  }

  #onLootChange(event) {
    const input = event.target;
    const row = input.closest("tr");
    if ( !row ) return;     // the chest name field sits in this section too
    const loot = this.#loot[Number(row.dataset.index)];
    if ( input.dataset.field === "quantity" ) loot.quantity = Math.max(1, parseInt(input.value) || 1);
    else loot.target = input.value;
    this.#markDirty();
  }

  async #onDrop(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( !data.uuid ) return;
    return this.#add(await fromUuid(data.uuid));
  }

  /** A dropped or picked actor becomes a mob row (or one more of it), an item a loot row. */
  #add(doc) {
    if ( doc instanceof Actor ) {
      if ( doc.isToken ) return;
      const existing = this.#mobs.find(m => m.uuid === doc.uuid);
      if ( existing?.kind === "unique" ) return;
      if ( existing ) {
        existing.count += 1;
        if ( existing.pattern === defaultPattern(existing.count - 1) ) existing.pattern = defaultPattern(existing.count);
      } else {
        // A linked world actor is an individual already: placed as itself (kind "unique")
        const unique = !doc.pack && doc.prototypeToken.actorLink;
        this.#mobs.push({
          uuid: doc.uuid, name: doc.name, img: doc.prototypeToken.texture.src || doc.img, count: 1,
          kind: unique ? "unique" : "group", pattern: defaultPattern(1), hp: "", hidden: true,
          disposition: doc.prototypeToken.disposition
        });
      }
    }
    else if ( doc instanceof Item ) {
      if ( doc.parent ) return;
      const lastMob = this.#mobs.length - 1;
      this.#loot.push({uuid: doc.uuid, name: doc.name, img: doc.img, quantity: 1, target: lastMob >= 0 ? `first:${lastMob}` : "chest"});
    }
    else return;
    this.render();
  }

  static #onRemoveMob(event, target) {
    const index = Number(target.closest("tr").dataset.index);
    this.#mobs.splice(index, 1);
    // Loot aimed at a later row follows it; loot aimed at the removed row goes to the chest
    for ( const l of this.#loot ) {
      const [kind, row] = l.target.split(":");
      if ( kind === "chest" ) continue;
      const r = Number(row);
      if ( r === index ) l.target = "chest";
      else if ( r > index ) l.target = `${kind}:${r - 1}`;
    }
    this.render();
  }

  static #onRemoveLoot(event, target) {
    this.#loot.splice(Number(target.closest("tr").dataset.index), 1);
    this.render();
  }

  /** Take the last placement back: its tokens, a chest it made, items it added, named actors it created. */
  static async #onUndoPlacement() {
    if ( this.#busy ) return;
    const last = this.#placements.pop();
    if ( !last ) return;
    this.#busy = true;
    this.render();
    try {
      const result = await undo(last.log);
      // A chest the placement created is gone again: back to the choice from before
      if ( !game.actors.get(this.#chestChoice) ) this.#chestChoice = last.chestChoice;
      if ( result.failed.length ) ui.notifications.error(result.failed.join(" · "));
      ui.notifications.info(_loc("DEWARIM_STUDIO.Commander.Undone", {action: last.label, recreated: result.recreated, reverted: result.reverted, deleted: result.deleted}));
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  static #onClear() {
    this.#mobs = [];
    this.#loot = [];
    this.#draftId = null;
    this.#draftName = "";
    this.#chestName = "";
    this.render();
  }

  static async #onCreate() {
    const scene = game.scenes.get(this.#sceneId);
    if ( !scene || this.#busy ) return;
    const hp = this.#mobs.map(m => parseHp(m.hp));
    const bad = hp.findIndex(h => "error" in h);
    if ( bad >= 0 ) return ui.notifications.warn(`${this.#mobs[bad].name}: ${hp[bad].error}`);
    // A draft can outlive what it refers to
    const missing = [...this.#mobs, ...this.#loot].filter(r => !fromUuidSync(r.uuid, {strict: false})).map(r => r.name);
    if ( missing.length ) return ui.notifications.warn(_loc("DEWARIM_STUDIO.Encounter.Draft.Missing", {names: missing.join(", ")}));

    this.#busy = true;
    this.render();
    try {
      let origin = null;
      if ( this.#placement === "click" ) {
        if ( canvas.scene?.id !== scene.id ) await scene.view();
        ui.notifications.info("DEWARIM_STUDIO.Encounter.ClickHint", {localize: true});
        await this.minimize();
        origin = await awaitCanvasClick();
        await this.maximize();
        if ( !origin ) return;
      }
      // Each base actor once in the world, even if it came from a compendium
      // A named row only uses its actor as a template, so a compendium actor is not copied for it
      const actors = new Map();
      const key = m => `${m.kind === "named" ? "template" : "world"}|${m.uuid}`;
      for ( const m of this.#mobs ) {
        if ( actors.has(key(m)) ) continue;
        const source = await fromUuid(m.uuid);
        actors.set(key(m), m.kind === "named" ? source : await worldActor(source));
      }
      const loot = [];
      for ( const l of this.#loot ) loot.push({source: await fromUuid(l.uuid), quantity: l.quantity, target: l.target});
      const chestBefore = this.#chestChoice;
      const keep = (log, label) => {
        if ( log?.length ) this.#placements = [...this.#placements, {label, log, chestChoice: chestBefore}].slice(-UNDO_DEPTH);
      };
      let result;
      try {
        const run = await recorded(() => createEncounter(scene, {
          // Rows with count 0 stay in: loot targets refer to rows by index
          mobs: this.#mobs.map((m, i) => ({...m, actor: actors.get(key(m)), hp: hp[i]})),
          loot: loot.filter(l => l.source),
          origin,
          chestName: this.#chestName || _loc("DEWARIM_STUDIO.Encounter.ChestDefault", {scene: scene.name}),
          chest: game.actors.get(this.#chest(scene).id) ?? null
        }));
        result = run.result;
        keep(run.log, _loc("DEWARIM_STUDIO.Encounter.UndoLabel", {count: result.tokens, scene: scene.name}));
      } catch(err) {
        // What a failed placement did before failing can still be taken back
        keep(err.log, _loc("DEWARIM_STUDIO.Encounter.UndoFailedLabel", {scene: scene.name}));
        throw err;
      }
      // The next placement fills the same chest
      if ( result.chest ) this.#chestChoice = result.chest.id;
      // Rows now point at the world copies, so a second click places more of the same
      for ( const m of this.#mobs ) if ( m.kind !== "named" ) m.uuid = actors.get(key(m))?.uuid ?? m.uuid;
      if ( result.named.length ) ui.notifications.info(_loc("DEWARIM_STUDIO.Encounter.NamedCreated", {names: result.named.join(", ")}));
      ui.notifications.info(_loc(result.reused ? "DEWARIM_STUDIO.Encounter.CreatedReused" : "DEWARIM_STUDIO.Encounter.Created", {
        count: result.tokens, scene: scene.name, chest: result.chest ? result.chest.name : "–"
      }));
    } catch(err) {
      ui.notifications.error(err.message, {console: true});
    } finally {
      this.#busy = false;
      this.render();
    }
  }
}
