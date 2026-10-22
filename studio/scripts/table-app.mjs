// A spreadsheet-like editor for one document type. Edits collect in memory (`#dirty`) and go out as one
// `updateDocuments` call on Save; the table re-renders from documents + pending edits, so a re-render
// never loses typing. Drop a document from a compendium to copy it into the world, or from the sidebar
// to pull it into the project. The source panel (toolbar button) offers the same from every compendium.
import {columnWriters, readValue, presetsFor, resolveColumn} from "./columns.mjs";
import {MODULE_ID, activeProject, assign, members} from "./project.mjs";
import {SOURCE_PANEL_TEMPLATE, SourcePanel} from "./source-panel.mjs";
import {filterHint, filterPredicate, filterTooltip} from "./sources.mjs";
import {coerce, collectUpdates, formatValue, setEdit} from "./table-model.mjs";
import {parseTSV, readPaste, toTSV} from "./tsv.mjs";
import {recorded, undo} from "./undo.mjs";

/** Table actions that can be taken back */
const UNDO_DEPTH = 10;

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;


export class TableApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @param {{documentName: string}} options */
  constructor(options) {
    super(options);
    this.documentName = options.documentName;
    const saved = game.settings.get(MODULE_ID, "tables")[this.documentName] ?? {};
    const available = presetsFor(this.documentName).map(([id]) => id);
    // Default: the first system preset (registered after core), else core
    this.#preset = available.includes(saved.preset) ? saved.preset : (available[1] ?? available[0]);
    this.#custom = saved.custom ?? [];
    this.#scope = activeProject() ? "project" : "all";
    this.#showSources = !!saved.sources;
    this.#sources = new SourcePanel(this, {
      types: [this.documentName],
      onAdd: async uuid => {
        await this.#addSource(await fromUuid(uuid));
        this.render();
      },
      addHint: "DEWARIM_STUDIO.Table.AddFromSource"
    });
  }

  static DEFAULT_OPTIONS = {
    classes: ["dewarim-studio", "dewarim-studio-table"],
    window: {icon: "fa-solid fa-table", resizable: true},
    position: {width: 1100, height: 640},
    actions: {
      save: TableApp.#onSave,
      revert: TableApp.#onRevert,
      create: TableApp.#onCreate,
      duplicate: TableApp.#onDuplicate,
      delete: TableApp.#onDelete,
      bulk: TableApp.#onBulk,
      addColumn: TableApp.#onAddColumn,
      removeColumn: TableApp.#onRemoveColumn,
      openSheet: TableApp.#onOpenSheet,
      pickImage: TableApp.#onPickImage,
      selectAll: TableApp.#onSelectAll,
      copyRows: TableApp.#onCopy,
      pasteRows: TableApp.#onPaste,
      toggleSources: TableApp.#onToggleSources,
      undo: TableApp.#onUndo
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/table.hbs`, templates: [SOURCE_PANEL_TEMPLATE], scrollable: [".table-scroll"]}
  };

  /** @type {Map<string, Map<string, *>>} id -> path -> value */
  #dirty = new Map();
  /** @type {Map<string, string>} "id|path" -> raw text that did not parse */
  #invalid = new Map();
  #selected = new Set();
  /** Saves, creations, duplicates, deletions, pastes and drops that can be taken back, newest last: {label, log} */
  #undo = [];
  #preset;
  #custom;
  #scope;
  #subtype = "";
  #filter = "";
  #bulkColumn = "";
  #showSources;
  #sources;

  get title() {
    return `${_loc("DEWARIM_STUDIO.Title")}: ${_loc(getDocumentClass(this.documentName).metadata.labelPlural)}`;
  }

  get collection() {
    return game.collections.get(this.documentName);
  }

  /** The column specs in use: the preset's, then the custom path columns. */
  get columns() {
    const preset = presetsFor(this.documentName).find(([id]) => id === this.#preset)?.[1];
    const custom = this.#custom.map(path => ({path, custom: true}));
    return [...(preset?.columns ?? []), ...custom];
  }

  /** Documents in scope, filtered and sorted. */
  get rows() {
    const project = activeProject();
    let docs = ((this.#scope === "project") && project) ? members(project.id)[this.documentName] : this.collection.contents;
    if ( this.#subtype ) docs = docs.filter(d => d.type === this.#subtype);
    docs = docs.filter(filterPredicate(this.documentName, this.#filter, d => [d.name, d.type]));
    return docs.sort((a, b) => a.name.localeCompare(b.name));
  }

  get hasPendingEdits() {
    return this.#dirty.size > 0;
  }

  /** @override */
  async _prepareContext() {
    const columns = this.columns;
    const docs = this.rows;
    const project = activeProject();
    const headers = columns.map((spec, index) => {
      const sample = docs.find(d => !spec.types || spec.types.includes(d.type));
      const resolved = sample ? resolveColumn(spec, sample) : {label: _loc(spec.label ?? spec.path), readonly: true};
      return {index, path: spec.path, label: resolved.label, custom: !!spec.custom, editable: !resolved.readonly};
    });
    const rows = docs.map(doc => ({
      id: doc.id,
      uuid: doc.uuid,
      selected: this.#selected.has(doc.id),
      dirty: this.#dirty.has(doc.id),
      cells: columns.map(spec => this.#cell(spec, doc))
    }));
    const subtypes = (getDocumentClass(this.documentName).TYPES ?? []).filter(t => t !== "base");
    return {
      presets: presetsFor(this.documentName).map(([id, p]) => ({id, label: _loc(p.label), selected: id === this.#preset})),
      scopes: [
        {id: "project", label: project ? project.title : _loc("DEWARIM_STUDIO.Table.NoProject"), selected: this.#scope === "project", disabled: !project},
        {id: "all", label: _loc("DEWARIM_STUDIO.Table.AllWorld"), selected: this.#scope === "all"}
      ],
      subtypes: subtypes.map(t => ({id: t, label: this.#subtypeLabel(t), selected: t === this.#subtype})),
      filter: this.#filter,
      filterTooltip: filterTooltip(this.documentName),
      filterHint: filterHint(this.documentName, filterPredicate(this.documentName, this.#filter).unknown),
      showSources: this.#showSources,
      source: this.#showSources ? await this.#sources.context() : null,
      headers,
      rows,
      empty: !rows.length,
      pending: [...this.#dirty.values()].reduce((n, m) => n + m.size, 0),
      undoLabel: this.#undo.length ? _loc("DEWARIM_STUDIO.Commander.UndoLast", {action: this.#undo.at(-1).label}) : null,
      invalid: this.#invalid.size,
      selectedCount: this.#selected.size,
      allSelected: rows.length && rows.every(r => r.selected),
      bulkColumns: headers.filter(h => h.editable).map(h => ({...h, selected: h.path === this.#bulkColumn}))
    };
  }

  /** A subtype's label - or, for documents without subtypes (scenes, journals), the document's. */
  #subtypeLabel(type) {
    if ( !type ) return _loc(getDocumentClass(this.documentName).metadata.label);
    const key = CONFIG[this.documentName]?.typeLabels?.[type];
    return key ? _loc(key) : type;
  }

  #cell(spec, doc) {
    const column = resolveColumn(spec, doc);
    if ( !column.applies ) return {na: true};
    const key = `${doc.id}|${spec.path}`;
    const pending = this.#dirty.get(doc.id);
    const hasEdit = pending?.has(spec.path);
    const value = hasEdit ? pending.get(spec.path) : readValue(spec, doc);
    const raw = this.#invalid.get(key);
    const text = raw ?? formatValue(column.type, value);
    // Keep a value the choices do not know (a homebrew type, an old key) visible and selectable
    const choices = [...column.choices];
    if ( (column.type === "select") && (text !== "") && !choices.some(c => c.value === text) ) choices.unshift({value: text, label: text});
    return {
      path: spec.path,
      type: column.type,
      isBoolean: column.type === "boolean",
      isSelect: column.type === "select",
      isImage: column.type === "image",
      isNumber: column.type === "number",
      value: text,
      choices: choices.map(c => ({...c, selected: c.value === text})),
      allowEmpty: column.nullable || (text === ""),
      readonly: column.readonly,
      dirty: hasEdit,
      invalid: raw !== undefined,
      hint: column.type === "set" ? column.choices.map(c => c.value).join(", ") : ""
    };
  }

  /** @override */
  _onRender(context, options) {
    const html = this.element;
    if ( this.#showSources ) this.#sources.activate(html, options);
    html.querySelector("[name=preset]")?.addEventListener("change", e => this.#setView({preset: e.target.value}));
    html.querySelector("[name=scope]")?.addEventListener("change", e => this.#setView({scope: e.target.value}));
    html.querySelector("[name=subtype]")?.addEventListener("change", e => this.#setView({subtype: e.target.value}));
    const filter = html.querySelector("[name=filter]");
    filter?.addEventListener("input", foundry.utils.debounce(e => this.#setView({filter: e.target.value}, {refocus: true}), 250));
    html.querySelector("tbody")?.addEventListener("change", this.#onCellChange.bind(this));
    const table = html.querySelector(".table-scroll");
    table?.addEventListener("dragover", e => e.preventDefault());
    table?.addEventListener("drop", this.#onDrop.bind(this));
    if ( options.refocus && filter ) {
      filter.focus();
      filter.setSelectionRange(filter.value.length, filter.value.length);
    }
  }

  async #setView(change, {refocus = false} = {}) {
    if ( "preset" in change ) this.#preset = change.preset;
    if ( "scope" in change ) this.#scope = change.scope;
    if ( "subtype" in change ) this.#subtype = change.subtype;
    if ( "filter" in change ) this.#filter = change.filter;
    if ( "preset" in change ) await this.#saveView();
    this.render({refocus});
  }

  async #saveView() {
    const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "tables"));
    all[this.documentName] = {preset: this.#preset, custom: this.#custom, sources: this.#showSources};
    await game.settings.set(MODULE_ID, "tables", all);
  }

  /** Record a cell edit without re-rendering, so focus and the scroll position stay. */
  #onCellChange(event) {
    const input = event.target;
    if ( input.name === "select" ) {
      const id = input.closest("tr").dataset.id;
      if ( input.checked ) this.#selected.add(id);
      else this.#selected.delete(id);
      this.#updateFooter();
      return;
    }
    const path = input.dataset.path;
    if ( !path ) return;
    const doc = this.collection.get(input.closest("tr").dataset.id);
    const spec = this.columns.find(c => c.path === path);
    const column = resolveColumn(spec, doc);
    const raw = column.type === "boolean" ? input.checked : input.value;
    const result = coerce(column.type, raw, column);
    const key = `${doc.id}|${path}`;
    const cell = input.closest("td");
    if ( "error" in result ) {
      this.#invalid.set(key, String(raw));
      cell.classList.add("invalid");
      cell.dataset.tooltip = result.error;
    } else {
      this.#invalid.delete(key);
      cell.classList.remove("invalid");
      delete cell.dataset.tooltip;
      setEdit(this.#dirty, doc.id, path, result.value, readValue(spec, doc));
      cell.classList.toggle("dirty", !!this.#dirty.get(doc.id)?.has(path));
      if ( column.type === "image" ) cell.querySelector("img")?.setAttribute("src", result.value || "icons/svg/mystery-man.svg");
    }
    input.closest("tr").classList.toggle("dirty", this.#dirty.has(doc.id));
    this.#updateFooter();
  }

  #updateFooter() {
    const pending = [...this.#dirty.values()].reduce((n, m) => n + m.size, 0);
    const save = this.element.querySelector("[data-action=save]");
    if ( save ) {
      save.disabled = !pending || this.#invalid.size > 0;
      save.querySelector(".count").textContent = pending;
    }
    const revert = this.element.querySelector("[data-action=revert]");
    if ( revert ) revert.disabled = !pending && !this.#invalid.size;
    const count = this.element.querySelector(".selected-count");
    if ( count ) count.textContent = this.#selected.size;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** Run an action that changes documents and keep what it did for undo (undo.mjs). */
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

  /** Take the last action back: deleted rows return, saved fields get their old values, new rows go. */
  static async #onUndo() {
    const last = this.#undo.pop();
    if ( !last ) return;
    const result = await undo(last.log);
    if ( result.failed.length ) ui.notifications.error(result.failed.join(" · "));
    ui.notifications.info(_loc("DEWARIM_STUDIO.Commander.Undone", {action: last.label, recreated: result.recreated,
      reverted: result.reverted, deleted: result.deleted}));
    this.render();
  }

  static async #onSave() {
    const updates = collectUpdates(this.#dirty, columnWriters(this.columns, this.collection));
    if ( !updates.length ) return;
    try {
      await this.#record(_loc("DEWARIM_STUDIO.Table.UndoSave", {count: updates.length}),
        () => getDocumentClass(this.documentName).updateDocuments(updates));
      this.#dirty.clear();
      ui.notifications.info(_loc("DEWARIM_STUDIO.Table.Saved", {count: updates.length}));
    } catch(err) {
      ui.notifications.error(err.message, {console: true});
    }
    this.render();
  }

  static #onRevert() {
    this.#dirty.clear();
    this.#invalid.clear();
    this.render();
  }

  static async #onCreate() {
    const types = getDocumentClass(this.documentName).TYPES.filter(t => t !== "base");
    const preset = presetsFor(this.documentName).find(([id]) => id === this.#preset)?.[1];
    const type = this.#subtype || preset?.types?.find(t => types.includes(t)) || types[0];
    const name = _loc("DOCUMENT.New", {type: this.#subtypeLabel(type)});
    await this.#record(name, async () => {
      const [doc] = await getDocumentClass(this.documentName).createDocuments([type ? {name, type} : {name}]);
      await this.#adopt([doc]);
    });
    this.render();
  }

  static async #onDuplicate() {
    const docs = this.#selectedDocuments();
    if ( !docs.length ) return;
    const data = docs.map(d => {
      const o = d.toObject();
      delete o._id;
      o.name = `${o.name} (2)`;
      return o;
    });
    await this.#record(_loc("DEWARIM_STUDIO.Table.UndoDuplicate", {count: data.length}),
      () => getDocumentClass(this.documentName).createDocuments(data));
    this.render();
  }

  static async #onDelete() {
    const docs = this.#selectedDocuments();
    if ( !docs.length ) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {title: "DEWARIM_STUDIO.Table.Delete"},
      content: `<p>${_loc("DEWARIM_STUDIO.Table.DeleteConfirm", {count: docs.length})}</p>`
        + `<ul>${docs.slice(0, 10).map(d => `<li>${foundry.utils.escapeHTML(d.name)}</li>`).join("")}`
        + `${docs.length > 10 ? "<li>…</li>" : ""}</ul>`
    });
    if ( !ok ) return;
    await this.#record(_loc("DEWARIM_STUDIO.Table.UndoDelete", {count: docs.length}),
      () => getDocumentClass(this.documentName).deleteDocuments(docs.map(d => d.id)));
    docs.forEach(d => { this.#selected.delete(d.id); this.#dirty.delete(d.id); });
    this.render();
  }

  /** Set one column on every selected row (as pending edits - Save writes them). */
  static #onBulk() {
    const path = this.#bulkColumn = this.element.querySelector("[name=bulkColumn]").value;
    const raw = this.element.querySelector("[name=bulkValue]").value;
    const spec = this.columns.find(c => c.path === path);
    if ( !spec ) return;
    let applied = 0;
    for ( const doc of this.#selectedDocuments() ) {
      const column = resolveColumn(spec, doc);
      if ( !column.applies || column.readonly ) continue;
      const result = coerce(column.type, column.type === "boolean" ? ["1", "true", "yes", "ja", "x"].includes(raw.trim().toLowerCase()) : raw, column);
      if ( "error" in result ) {
        ui.notifications.warn(`${doc.name}: ${result.error}`);
        continue;
      }
      this.#invalid.delete(`${doc.id}|${path}`);
      setEdit(this.#dirty, doc.id, path, result.value, readValue(spec, doc));
      applied++;
    }
    ui.notifications.info(_loc("DEWARIM_STUDIO.Table.BulkApplied", {count: applied}));
    this.render();
  }

  static async #onAddColumn() {
    const input = this.element.querySelector("[name=newColumn]");
    const path = input.value.trim();
    if ( !path || this.columns.some(c => c.path === path) ) return;
    this.#custom.push(path);
    await this.#saveView();
    this.render();
  }

  static async #onRemoveColumn(event, target) {
    this.#custom = this.#custom.filter(p => p !== target.dataset.path);
    await this.#saveView();
    this.render();
  }

  static #onOpenSheet(event, target) {
    this.collection.get(target.closest("tr").dataset.id)?.sheet?.render(true);
  }

  static async #onPickImage(event, target) {
    const input = target.closest("td").querySelector("input");
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: input.value,
      callback: path => {
        input.value = path;
        input.dispatchEvent(new Event("change", {bubbles: true}));
      }
    });
    picker.render(true);
  }

  static #onSelectAll(event, target) {
    const ids = this.rows.map(d => d.id);
    if ( target.checked ) ids.forEach(id => this.#selected.add(id));
    else ids.forEach(id => this.#selected.delete(id));
    this.render();
  }

  /* -------------------------------------------- */
  /*  Spreadsheet round trip                      */
  /* -------------------------------------------- */

  /** Column headers for the clipboard: the label, or the path where two labels would be the same. */
  #clipboardColumns() {
    const docs = this.rows;
    const columns = this.columns.map(spec => {
      const sample = docs.find(d => !spec.types || spec.types.includes(d.type));
      return {spec, path: spec.path, label: sample ? resolveColumn(spec, sample).label : spec.path};
    });
    const seen = new Map();
    columns.forEach(c => seen.set(c.label, (seen.get(c.label) ?? 0) + 1));
    return columns.map(c => ({...c, header: seen.get(c.label) > 1 ? c.path : c.label}));
  }

  /** Copy the selected rows (or all shown) as tab-separated text, with an _id column for pasting back. */
  static async #onCopy() {
    const columns = this.#clipboardColumns();
    const docs = this.#selected.size ? this.rows.filter(d => this.#selected.has(d.id)) : this.rows;
    const body = docs.map(doc => [doc.id, ...columns.map(({spec}) => {
      const column = resolveColumn(spec, doc);
      if ( !column.applies ) return "";
      const pending = this.#dirty.get(doc.id);
      const value = pending?.has(spec.path) ? pending.get(spec.path) : readValue(spec, doc);
      const text = formatValue(column.type, value);
      return typeof text === "boolean" ? (text ? "1" : "0") : text;
    })]);
    const text = toTSV(["_id", ...columns.map(c => c.header)], body);
    try {
      await navigator.clipboard.writeText(text);
      ui.notifications.info(_loc("DEWARIM_STUDIO.Table.Copied", {count: docs.length}));
    } catch {
      // No clipboard access (insecure origin, denied): show the text to copy by hand
      await foundry.applications.api.DialogV2.prompt({
        window: {title: "DEWARIM_STUDIO.Table.Copy"},
        content: `<textarea class="dewarim-studio-tsv" readonly>${foundry.utils.escapeHTML(text)}</textarea>`,
        rejectClose: false
      });
    }
  }

  /** Paste from a spreadsheet: matching rows become pending edits, unknown names new documents. */
  static async #onPaste() {
    const text = await foundry.applications.api.DialogV2.prompt({
      window: {title: "DEWARIM_STUDIO.Table.Paste"},
      content: `<p class="hint">${_loc("DEWARIM_STUDIO.Table.PasteHint")}</p><textarea class="dewarim-studio-tsv" name="tsv" autofocus></textarea>`,
      ok: {callback: (event, button) => button.form.elements.tsv.value},
      rejectClose: false
    });
    if ( !text?.trim() ) return;
    const columns = this.#clipboardColumns();
    const {key, records, unknownHeaders} = readPaste(parseTSV(text),
      columns.flatMap(c => [{path: c.path, label: c.header}, {path: c.path, label: c.label}]));
    if ( !key ) return ui.notifications.warn("DEWARIM_STUDIO.Table.PasteNoKey", {localize: true});

    const inScope = this.rows;
    const find = record => (key === "_id") ? this.collection.get(record._id)
      : (inScope.find(d => d.name === record.name) ?? this.collection.find(d => d.name === record.name));
    const errors = [];
    const fresh = [];
    let edited = 0;
    for ( const record of records ) {
      const doc = find(record);
      if ( !doc ) {
        if ( record.name?.trim() ) fresh.push(record);
        continue;
      }
      for ( const [path, raw] of Object.entries(record) ) {
        if ( path === "_id" ) continue;
        const spec = this.columns.find(c => c.path === path);
        const column = resolveColumn(spec, doc);
        if ( !column.applies || column.readonly ) continue;
        const result = coerce(column.type, column.type === "boolean" ? ["1", "true", "yes", "ja", "x"].includes(raw.trim().toLowerCase()) : raw, column);
        if ( "error" in result ) {
          errors.push(`${doc.name}: ${column.label}: ${result.error}`);
          continue;
        }
        const before = this.#dirty.get(doc.id)?.get(path);
        setEdit(this.#dirty, doc.id, path, result.value, readValue(spec, doc));
        if ( this.#dirty.get(doc.id)?.get(path) !== before ) edited++;
      }
    }
    if ( fresh.length ) {
      await this.#record(_loc("DEWARIM_STUDIO.Table.UndoPaste", {count: fresh.length}), () => this.#createFromPaste(fresh, errors));
    }
    if ( unknownHeaders.length ) errors.unshift(_loc("DEWARIM_STUDIO.Table.PasteUnknown", {headers: unknownHeaders.join(", ")}));
    ui.notifications.info(_loc("DEWARIM_STUDIO.Table.Pasted", {edited, created: fresh.length}));
    if ( errors.length ) ui.notifications.warn(errors.slice(0, 6).join(" · ") + (errors.length > 6 ? " …" : ""));
    this.render();
  }

  /** New documents for pasted rows whose name matched nothing - after asking. */
  async #createFromPaste(records, errors) {
    const Cls = getDocumentClass(this.documentName);
    const types = (Cls.TYPES ?? []).filter(t => t !== "base");
    // The subtype filter, else what the preset is for ("dnd5e: NPC stats" -> npc), else the first type
    const preset = presetsFor(this.documentName).find(([id]) => id === this.#preset)?.[1];
    const defaultType = this.#subtype || preset?.types?.find(t => types.includes(t)) || types[0];
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {title: "DEWARIM_STUDIO.Table.Paste"},
      content: `<p>${_loc("DEWARIM_STUDIO.Table.PasteCreate", {count: records.length, type: this.#subtypeLabel(defaultType)})}</p>`
        + `<ul>${records.slice(0, 10).map(r => `<li>${foundry.utils.escapeHTML(r.name)}</li>`).join("")}${records.length > 10 ? "<li>…</li>" : ""}</ul>`
    });
    if ( !ok ) {
      records.length = 0;
      return;
    }
    // Values of writer columns wait until their document exists (a new scene's level exists only then)
    const later = [];
    const data = records.map(record => {
      const type = types.includes(record.type) ? record.type : defaultType;
      const out = type ? {name: record.name.trim(), type} : {name: record.name.trim()};
      // The probe gets a copy: a document seals the data it is built from
      const probe = new Cls.implementation(foundry.utils.deepClone(out));
      const deferred = {};
      later.push(deferred);
      for ( const [path, raw] of Object.entries(record) ) {
        if ( ["_id", "name", "type"].includes(path) || (raw === "") ) continue;
        const spec = this.columns.find(c => c.path === path);
        const column = resolveColumn(spec, probe);
        if ( !column.applies || column.readonly ) continue;
        const result = coerce(column.type, raw, column);
        if ( "error" in result ) errors.push(`${out.name}: ${column.label}: ${result.error}`);
        else if ( spec.write ) deferred[path] = result.value;
        else foundry.utils.setProperty(out, path, result.value);
      }
      return out;
    });
    const created = await Cls.createDocuments(data);
    const writers = columnWriters(this.columns, this.collection);
    const updates = created.map((doc, i) => collectUpdates(new Map([[doc.id, new Map(Object.entries(later[i]))]]), writers)[0])
      .filter(Boolean);
    if ( updates.length ) await Cls.updateDocuments(updates);
    await this.#adopt(created);
  }

  #selectedDocuments() {
    return [...this.#selected].map(id => this.collection.get(id)).filter(Boolean);
  }

  /* -------------------------------------------- */
  /*  Drops                                       */
  /* -------------------------------------------- */

  async #onDrop(event) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if ( (data.type !== this.documentName) || !data.uuid ) return;
    await this.#addSource(await fromUuid(data.uuid));
    this.render();
  }

  /** A compendium document is copied into the world; either way it joins the project when the table shows it. */
  async #addSource(source) {
    if ( !source || (source.documentName !== this.documentName) || source.isEmbedded ) return;
    await this.#record(source.name, async () => {
      let doc = source;
      if ( source.pack ) {
        const created = await getDocumentClass(this.documentName).createDocuments([this.collection.fromCompendium(source)]);
        doc = created[0];
      }
      await this.#adopt([doc]);
    });
  }

  static async #onToggleSources() {
    this.#showSources = !this.#showSources;
    await this.#saveView();
    this.render();
  }

  /** New or dropped documents join the active project when the table shows the project. */
  async #adopt(docs) {
    const project = activeProject();
    if ( (this.#scope === "project") && project ) await assign(docs, project);
  }
}
