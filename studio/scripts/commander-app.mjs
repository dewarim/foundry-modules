// Commander view: side-by-side columns, one document type each. Every row is a Foundry drag source and
// drop target, so assigning is drag & drop - between columns, or from/to the sidebar, compendiums and
// sheets. What a drop means comes from the rules in commander.mjs.
import {acceptedBy, dropRule, ruleAccepts} from "./commander.mjs";
import {MODULE_ID, activeProject, assign, projectOf} from "./project.mjs";
import {CONTENT_TYPES} from "./refs.mjs";
import {recorded, undo} from "./undo.mjs";
import {filterHint, filterTooltip, listSources, scopeChoices, validScope} from "./sources.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

const DEFAULT_COLUMNS = [{type: "Actor"}, {type: "Item"}, {type: "Scene"}];

/** The document type being dragged out of this window, if any (dragover cannot read the data). */
let dragging = null;

/** How many drops can be taken back. */
const UNDO_DEPTH = 10;

export class CommanderApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options) {
    super(options);
    const saved = game.settings.get(MODULE_ID, "commander")?.columns;
    this.#columns = (saved?.length ? saved : DEFAULT_COLUMNS).map(c => ({
      type: CONTENT_TYPES.includes(c.type) ? c.type : "Actor",
      scope: c.scope ?? (activeProject() ? "project" : "all"),
      subtype: c.subtype ?? "",
      filter: "",
      expanded: new Set()
    }));
  }

  static DEFAULT_OPTIONS = {
    id: "dewarim-studio-commander",
    classes: ["dewarim-studio", "dewarim-studio-commander"],
    window: {title: "DEWARIM_STUDIO.Commander.Title", icon: "fa-solid fa-table-columns", resizable: true},
    position: {width: 1000, height: 620},
    actions: {
      addColumn: CommanderApp.#onAddColumn,
      removeColumn: CommanderApp.#onRemoveColumn,
      toggle: CommanderApp.#onToggle,
      open: CommanderApp.#onOpen,
      create: CommanderApp.#onCreate,
      variant: CommanderApp.#onVariant,
      undo: CommanderApp.#onUndo
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/commander.hbs`}
  };

  #columns;
  /** scrollTop per column, kept across renders */
  #scroll = [];
  /** Drops that can be undone, newest last: {label, log} */
  #undo = [];

  /** Run a drop and keep what it did for undo. */
  async #record(label, action) {
    const keep = log => {
      if ( log?.length ) this.#undo = [...this.#undo, {label, log}].slice(-UNDO_DEPTH);
    };
    try {
      const {result, log} = await recorded(action);
      keep(log);
      return result;
    } catch(err) {
      keep(err.log);
      throw err;
    }
  }

  /** @override */
  async _prepareContext() {
    const last = this.#undo.at(-1);
    return {
      columns: await Promise.all(this.#columns.map((col, index) => this.#columnContext(col, index))),
      undo: last ? _loc("DEWARIM_STUDIO.Commander.UndoLast", {action: last.label}) : null,
      undoCount: this.#undo.length
    };
  }

  async #columnContext(col, index) {
    col.scope = validScope(col.type, col.scope);
    const Cls = getDocumentClass(col.type);
    const typeLabels = CONFIG[col.type]?.typeLabels ?? {};
    const subtypes = (Cls.TYPES ?? []).filter(t => t !== "base");
    const isPack = col.scope.startsWith("pack:");
    const {scopes, packs} = scopeChoices(col.type, col.scope);
    // Compendium rows come from the pack index: no children, not drop targets
    const {entries, more, unknown} = await listSources(col.type, col);
    return {
      index,
      documentName: col.type,
      filter: col.filter,
      filterTooltip: filterTooltip(col.type),
      hint: filterHint(col.type, unknown),
      removable: this.#columns.length > 1,
      types: CONTENT_TYPES.map(t => ({value: t, label: _loc(getDocumentClass(t).metadata.labelPlural), selected: t === col.type})),
      scopes,
      packs,
      subtypes: subtypes.length > 1 ? subtypes.map(t => ({value: t, label: _loc(typeLabels[t] ?? t), selected: t === col.subtype})) : null,
      isPack,
      canCreate: !isPack,
      accepts: isPack ? "" : acceptedBy(col.type).map(t => _loc(getDocumentClass(t).metadata.label)).join(", "),
      label: _loc(Cls.metadata.labelPlural),
      more,
      rows: entries.map(({doc, ...e}) => ({
        ...e,
        origin: col.scope === "everywhere" ? e.origin : "",
        expandable: !!doc && (this.#children(doc) !== null),
        expanded: !!doc && col.expanded.has(doc.id),
        children: doc && col.expanded.has(doc.id) ? this.#children(doc) : null
      }))
    };
  }

  /** What a row holds, shown when expanded - and draggable itself. null: nothing to expand. */
  #children(doc) {
    const entry = (child, img, note = "") => ({uuid: child.uuid, name: child.name, img, note});
    switch ( doc.documentName ) {
      case "Actor": return doc.items.map(i => entry(i, i.img, this.#quantity(i)));
      case "Scene": return doc.tokens.map(t => entry(t, t.texture.src, t.hidden ? _loc("DEWARIM_STUDIO.Encounter.Hidden") : ""));
      case "JournalEntry": return doc.pages.map(p => entry(p, "icons/svg/book.svg"));
      case "Playlist": return doc.sounds.map(s => entry(s, "icons/svg/sound.svg"));
      default: return null;
    }
  }

  #quantity(item) {
    const q = foundry.utils.getProperty(item, "system.quantity");
    return (typeof q === "number") && (q !== 1) ? `×${q}` : "";
  }

  /** @override */
  _preRender(context, options) {
    this.#scroll = [...(this.element?.querySelectorAll(".commander-column .rows") ?? [])].map(el => el.scrollTop);
    return super._preRender(context, options);
  }

  /** @override */
  _onRender(context, options) {
    const html = this.element;
    html.querySelectorAll(".commander-column .rows").forEach((el, i) => { el.scrollTop = this.#scroll[i] ?? 0; });
    for ( const column of html.querySelectorAll(".commander-column") ) {
      const index = Number(column.dataset.index);
      column.querySelector("[name=type]").addEventListener("change", e => this.#setColumn(index, {type: e.target.value}));
      column.querySelector("[name=scope]").addEventListener("change", e => this.#setColumn(index, {scope: e.target.value}));
      column.querySelector("[name=subtype]")?.addEventListener("change", e => this.#setColumn(index, {subtype: e.target.value}));
      const filter = column.querySelector("[name=filter]");
      filter.addEventListener("input", foundry.utils.debounce(e => {
        this.#columns[index].filter = e.target.value;
        this.render({focusFilter: index});
      }, 250));
      if ( options.focusFilter === index ) {
        filter.focus();
        filter.setSelectionRange(filter.value.length, filter.value.length);
      }
      // Dropping onto the column itself (not a row): bring the document into the world and the project
      column.addEventListener("dragover", e => e.preventDefault());
      column.addEventListener("drop", e => this.#onDropColumn(e, index));
    }
    for ( const row of html.querySelectorAll("[data-uuid]") ) {
      row.addEventListener("dragstart", this.#onDragStart.bind(this));
      row.addEventListener("dragend", () => { dragging = null; });
      if ( !row.classList.contains("row") || row.dataset.fromPack ) continue;
      row.addEventListener("dragover", e => this.#onDragOver(e, row));
      row.addEventListener("dragleave", () => row.classList.remove("drop-ok", "drop-no"));
      row.addEventListener("drop", e => this.#onDropRow(e, row));
      row.addEventListener("dblclick", () => fromUuid(row.dataset.uuid).then(d => d?.sheet?.render(true)));
    }
  }

  async #setColumn(index, change) {
    Object.assign(this.#columns[index], change);
    if ( "type" in change ) {
      this.#columns[index].expanded.clear();
      this.#columns[index].subtype = "";
      // A compendium of the old type does not hold the new one
      if ( this.#columns[index].scope.startsWith("pack:") ) this.#columns[index].scope = validScope(change.type, "");
    }
    await this.#save();
    this.render();
  }

  async #save() {
    await game.settings.set(MODULE_ID, "commander", {columns: this.#columns.map(c => ({type: c.type, scope: c.scope, subtype: c.subtype}))});
  }

  #onDragStart(event) {
    const el = event.currentTarget;
    event.stopPropagation();
    // A compendium row is an index entry, not a document: Foundry's drag data is just type + uuid
    if ( el.dataset.fromPack ) {
      dragging = el.dataset.documentName;
      event.dataTransfer.setData("text/plain", JSON.stringify({type: dragging, uuid: el.dataset.uuid}));
      event.dataTransfer.effectAllowed = "copy";
      return;
    }
    const doc = fromUuidSync(el.dataset.uuid);
    if ( !doc ) return;
    dragging = doc.documentName;
    event.dataTransfer.setData("text/plain", JSON.stringify(doc.toDragData()));
    event.dataTransfer.effectAllowed = "copyMove";
  }

  #onDragOver(event, row) {
    event.preventDefault();
    event.stopPropagation();
    const target = row.dataset.documentName;
    // A drag from elsewhere (sidebar, compendium) has an unknown type until it drops
    const ok = !dragging || ruleAccepts(dropRule(dragging, target), fromUuidSync(row.dataset.uuid));
    row.classList.toggle("drop-ok", ok);
    row.classList.toggle("drop-no", !ok);
    event.dataTransfer.dropEffect = ok ? "copy" : "none";
  }

  async #onDropRow(event, row) {
    event.preventDefault();
    event.stopPropagation();
    row.classList.remove("drop-ok", "drop-no");
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    dragging = null;
    if ( !data.uuid ) return;
    const [source, target] = await Promise.all([fromUuid(data.uuid), fromUuid(row.dataset.uuid)]);
    if ( !source || !target || (source === target) ) return;
    const rule = dropRule(source.documentName, target.documentName);
    if ( rule && !ruleAccepts(rule, target) ) {
      return ui.notifications.warn(_loc("DEWARIM_STUDIO.Commander.NotAccepted", {
        source: _loc(source.constructor.metadata.label), target: target.name
      }));
    }
    if ( !rule ) {
      return ui.notifications.warn(_loc("DEWARIM_STUDIO.Commander.NoRule", {
        source: _loc(source.constructor.metadata.label), target: _loc(target.constructor.metadata.label)
      }));
    }
    try {
      const label = `${source.name} → ${target.name}`;
      const message = await this.#record(label, () => rule.handler(source, target, {event}));
      if ( message ) ui.notifications.info(message);
      // Show the result: expand the target row
      const column = this.#columns[Number(row.closest(".commander-column").dataset.index)];
      column?.expanded.add(target.id);
    } catch(err) {
      ui.notifications.error(err.message, {console: true});
    }
    this.render();
  }

  async #onDropColumn(event, index) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    dragging = null;
    const col = this.#columns[index];
    if ( !data.uuid || (data.type !== col.type) || col.scope.startsWith("pack:") ) return;
    const source = await fromUuid(data.uuid);
    if ( !source || source.isEmbedded ) return;
    await this.#record(source.name, async () => {
      let doc = source;
      if ( source.pack ) {
        const collection = game.collections.get(col.type);
        [doc] = await source.constructor.createDocuments([collection.fromCompendium(source)]);
      }
      const project = activeProject();
      if ( project && (projectOf(doc) !== project.id) ) await assign([doc], project);
    });
    this.render();
  }

  static #onToggle(event, target) {
    const row = target.closest(".row");
    const col = this.#columns[Number(row.closest(".commander-column").dataset.index)];
    const id = fromUuidSync(row.dataset.uuid)?.id;
    if ( col.expanded.has(id) ) col.expanded.delete(id);
    else col.expanded.add(id);
    this.render();
  }

  static async #onOpen(event, target) {
    (await fromUuid(target.closest("[data-uuid]").dataset.uuid))?.sheet?.render(true);
  }

  /** New document of the column's type (and subtype filter), in the project. */
  static async #onCreate(event, target) {
    const col = this.#columns[Number(target.closest(".commander-column").dataset.index)];
    const Cls = getDocumentClass(col.type);
    const data = col.subtype ? {type: col.subtype} : {};
    const doc = await Cls.createDialog(data, {}, col.subtype ? {types: [col.subtype]} : {});
    if ( !doc ) return;
    const project = activeProject();
    if ( project && (col.scope !== "all") ) await assign([doc], project);
    this.render();
  }

  /**
   * Copy & edit: the entry (compendium or world) as the project's own variant - name it, and its sheet
   * opens. "Goblin" -> "Goblin, cave-dweller" in one step.
   */
  static async #onVariant(event, target) {
    const source = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
    if ( !source ) return;
    const name = await foundry.applications.api.DialogV2.prompt({
      window: {title: "DEWARIM_STUDIO.Commander.Variant"},
      content: `<p>${_loc("DEWARIM_STUDIO.Commander.VariantHint", {name: foundry.utils.escapeHTML(source.name)})}</p>
        <input type="text" name="name" value="${foundry.utils.escapeHTML(source.name)}" autofocus>`,
      ok: {callback: (e, button) => button.form.elements.name.value.trim()},
      rejectClose: false
    });
    if ( !name ) return;
    const collection = game.collections.get(source.documentName);
    const data = source.pack ? collection.fromCompendium(source) : source.toObject();
    delete data._id;
    data.name = name;
    if ( data.prototypeToken && (!source.prototypeToken?.name || (source.prototypeToken.name === source.name)) ) {
      data.prototypeToken.name = name;
    }
    if ( !source.pack ) data._stats = {...(data._stats ?? {}), duplicateSource: source.uuid};
    delete data.folder;
    const [doc] = await source.constructor.createDocuments([data]);
    const project = activeProject();
    if ( project ) await assign([doc], project);
    doc.sheet?.render(true);
    this.render();
  }

  /** Take the last drop back: what it changed gets its previous value, what it created is deleted. */
  static async #onUndo() {
    const last = this.#undo.pop();
    if ( !last ) return;
    const result = await undo(last.log);
    if ( result.failed.length ) ui.notifications.error(result.failed.join(" · "));
    ui.notifications.info(_loc("DEWARIM_STUDIO.Commander.Undone", {action: last.label, recreated: result.recreated, reverted: result.reverted, deleted: result.deleted}));
    this.render();
  }

  static async #onAddColumn() {
    const used = new Set(this.#columns.map(c => c.type));
    const type = CONTENT_TYPES.find(t => !used.has(t)) ?? "Actor";
    this.#columns.push({type, scope: activeProject() ? "project" : "all", filter: "", expanded: new Set()});
    await this.#save();
    this.render();
  }

  static async #onRemoveColumn(event, target) {
    this.#columns.splice(Number(target.closest(".commander-column").dataset.index), 1);
    await this.#save();
    this.render();
  }

  /** Re-render on outside changes, unless a filter field is being typed into. */
  refresh() {
    if ( !this.rendered ) return;
    if ( document.activeElement?.matches?.("#dewarim-studio-commander input") ) return;
    this.render();
  }
}
