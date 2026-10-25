// The template editor: the templates on the left, the chosen one on the right - its base (dropped), the
// variance (range, tiers or rows - rows typed or pasted from a spreadsheet), the aspects, and a preview of
// the items before *Generate* writes them. Every change is saved to the world setting as it is made.
import {adapter} from "./adapter.mjs";
import {MODULE_ID, build, deleteTemplate, generate, generated, saveTemplate, templates} from "./generate.mjs";
import {
  APPLIES, DEFAULT_PATTERNS, DURATION_UNITS, MODES, ROW_FIELDS, fromPreset, repairAspect, repairTemplate,
  rowsFromTSV, rowsToTSV
} from "./variant-model.mjs";

const {ApplicationV2, HandlebarsApplicationMixin, DialogV2} = foundry.applications.api;

const L = (key, data) => _loc(`DEWARIM_ITEMS.${key}`, data);

const choices = (list, value) => list.map(o => ({...o, selected: o.key === value}));

export class ItemsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dewarim-items",
    tag: "form",
    classes: ["dewarim-items"],
    window: {title: "DEWARIM_ITEMS.Title", icon: "fa-solid fa-flask-vial", resizable: true},
    position: {width: 980, height: 720},
    form: {handler: ItemsApp.#onSubmit, submitOnChange: true, closeOnSubmit: false},
    actions: {
      select: ItemsApp.#onSelect,
      create: ItemsApp.#onCreate,
      duplicate: ItemsApp.#onDuplicate,
      remove: ItemsApp.#onRemove,
      exportAll: ItemsApp.#onExport,
      importAll: ItemsApp.#onImport,
      openBase: ItemsApp.#onOpenBase,
      clearBase: ItemsApp.#onClearBase,
      addAspect: ItemsApp.#onAddAspect,
      removeAspect: ItemsApp.#onRemoveAspect,
      addTier: ItemsApp.#onAddTier,
      removeTier: ItemsApp.#onRemoveTier,
      addRow: ItemsApp.#onAddRow,
      removeRow: ItemsApp.#onRemoveRow,
      addColumn: ItemsApp.#onAddColumn,
      removeColumn: ItemsApp.#onRemoveColumn,
      pasteRows: ItemsApp.#onPasteRows,
      copyRows: ItemsApp.#onCopyRows,
      reroll: ItemsApp.#onReroll,
      generate: ItemsApp.#onGenerate,
      openItem: ItemsApp.#onOpenItem
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/items.hbs`, scrollable: [".items-list", ".items-editor"]}
  };

  #selected = null;
  /** Where new templates write: the studio's project folder when opened from there */
  #folder = "";
  #busy = false;

  /** Options from api.open: a default folder, a template to show. */
  configure({folder, template} = {}) {
    if ( folder !== undefined ) this.#folder = folder || "";
    if ( template ) this.#selected = template;
  }

  #current() {
    const list = templates();
    return list.find(t => t.id === this.#selected) ?? list[0] ?? null;
  }

  /** @override */
  async _prepareContext() {
    const list = templates();
    const t = this.#current();
    this.#selected = t?.id ?? null;
    const presets = adapter.presets?.() ?? [];
    return {
      templates: list.map(x => ({id: x.id, name: x.name || "?", selected: x.id === t?.id, count: generated(x.id).length})),
      presets: presets.map(p => ({id: p.id, label: p.label})),
      template: t ? await this.#templateContext(t) : null,
      busy: this.#busy
    };
  }

  async #templateContext(t) {
    const kinds = adapter.aspectKinds ?? [];
    const base = t.base ? await fromUuid(t.base).catch(() => null) : null;
    const folders = game.folders.filter(f => f.type === "Item")
      .map(f => ({key: f.uuid, label: [...f.ancestors].reverse().map(a => a.name).concat(f.name).join(" / ")}))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
    const abilities = adapter.abilities?.() ?? [];
    const conditions = adapter.conditions?.() ?? [];
    const rarities = [{key: "", label: L("Aspect.KeepRarity")}, {key: "auto", label: L("Aspect.AutoRarity")}, ...(adapter.rarities?.() ?? [])];
    const v = t.variance;
    const labels = adapter.rowLabels?.() ?? {};
    const {items} = base ? await build(t) : {items: []};
    const before = new Map(generated(t.id).map(i => [i.flags[MODULE_ID].key, i]));
    const keys = new Set(items.map(i => i.key));
    return {
      ...t,
      base: base ? {uuid: base.uuid, name: base.name, img: base.img} : null,
      missingBase: !!t.base && !base,
      patternPlaceholder: DEFAULT_PATTERNS[v.mode],
      folders: choices([{key: "", label: L("NewFolder")}, ...folders], t.folder),
      modes: MODES.map(m => ({key: m, label: L(`Mode.${m}`), selected: m === v.mode})),
      range: v.mode === "range" ? v : null,
      tiers: v.mode === "tiers" ? v.tiers.map((tier, index) => ({...tier, index})) : null,
      rows: v.mode === "rows" ? {
        labels: ROW_FIELDS.map(f => labels[f] ?? f),
        columns: v.columns.map((path, index) => ({path, index})),
        list: v.rows.map((row, index) => ({...row, index, cells: v.columns.map((path, c) => ({c, value: row.set[path] ?? ""}))})),
        unit: adapter.priceUnit ?? ""
      } : null,
      aspects: t.aspects.map((a, index) => ({
        ...a, index,
        label: L(`Aspect.${a.kind}`),
        unsupported: !kinds.includes(a.kind),
        isPotency: a.kind === "potency",
        isScale: ["price", "weight"].includes(a.kind),
        isRarity: a.kind === "rarity",
        isSet: a.kind === "set",
        isRider: a.kind === "rider",
        applies: a.kind === "potency" ? APPLIES.map(x => ({key: x, label: L(`Applies.${x}`), selected: x === a.applies})) : null,
        rarities: a.kind === "rarity" ? choices(rarities, a.value) : null,
        abilities: a.kind === "rider" ? choices(abilities, a.ability) : null,
        conditions: a.kind === "rider" ? choices(conditions, a.condition) : null,
        units: a.kind === "rider" ? DURATION_UNITS.map(u => ({key: u, label: L(`UnitName.${u}`), selected: u === a.duration.units})) : null
      })),
      kinds: kinds.map(k => ({key: k, label: L(`Aspect.${k}`)})),
      preview: items.map(i => ({...adapter.summary(i.data), name: i.data.name, key: i.key, img: i.data.img,
        exists: before.has(i.key), uuid: before.get(i.key)?.uuid ?? null, unchanged: i.potent === false})),
      stale: [...before.values()].filter(i => !keys.has(i.flags[MODULE_ID].key)).map(i => ({name: i.name, uuid: i.uuid})),
      showSeed: v.mode === "range"
    };
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    for ( const zone of this.element.querySelectorAll("[data-drop]") ) {
      zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", e => {
        zone.classList.remove("drag-over");
        e.preventDefault();
        e.stopPropagation();
        this.#onDrop(e, zone.dataset.drop, Number(zone.dataset.index));
      });
    }
  }

  async #onDrop(event, target, index) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const item = data.uuid ? await fromUuid(data.uuid).catch(() => null) : null;
    if ( !(item instanceof Item) ) return ui.notifications.warn(L("DropItem"));
    const t = this.#current();
    if ( target === "base" ) {
      if ( item.parent ) return ui.notifications.warn(L("DropNotOwned"));
      return this.#save({...t, base: item.uuid, name: t.name || item.name});
    }
    if ( target === "rider" ) {
      const rider = adapter.riderFrom?.(item);
      if ( !rider ) return ui.notifications.warn(L("NoRider", {name: item.name}));
      const aspects = [...t.aspects];
      aspects[index] = {...rider, percent: aspects[index]?.percent ?? 0};
      ui.notifications.info(L("RiderImported", {name: item.name}));
      return this.#save({...t, aspects});
    }
  }

  async #save(template) {
    const saved = await saveTemplate(template);
    this.#selected = saved.id;
    return this.render();
  }

  /** The form: every field of the chosen template. */
  static async #onSubmit(event, form, formData) {
    const t = this.#current();
    if ( !t ) return;
    const data = foundry.utils.expandObject(formData.object);
    const rows = obj => Object.entries(obj ?? {}).sort(([a], [b]) => Number(a) - Number(b)).map(([, v]) => v);
    const v = t.variance;
    const mode = data.variance?.mode ?? v.mode;
    let variance = {...v, ...data.variance, mode};
    if ( mode !== v.mode ) variance = ItemsApp.#varianceFor(mode, v);
    else if ( mode === "tiers" ) variance.tiers = rows(data.tiers);
    else if ( mode === "rows" ) {
      variance.rows = rows(data.rows).map((row, i) => ({
        ...row, set: Object.fromEntries(v.columns.map((path, c) => [path, row.col?.[c] ?? v.rows[i]?.set[path] ?? ""]))
      }));
    }
    const aspects = t.aspects.map((a, i) => {
      const row = rows(data.aspects)[i] ?? {};
      return repairAspect({...a, ...row, kind: a.kind, duration: {...a.duration, ...row.duration}});
    }).filter(Boolean);
    await this.#save({...t, ...data.t, variance, aspects});
  }

  /** A new mode starts with what makes sense there; rows keep nothing of tiers and back. */
  static #varianceFor(mode, old) {
    switch ( mode ) {
      case "range": return {mode, min: 50, max: 100, count: 3, step: 5};
      case "tiers": return {mode, tiers: [{name: L("Tier.Fine"), percent: 100}]};
      case "rows": return {mode, columns: old.columns ?? [], rows: old.rows ?? []};
      default: return {mode};
    }
  }

  static #onSelect(event, target) {
    this.#selected = target.dataset.id;
    this.render();
  }

  static async #onCreate() {
    const presetId = this.element.querySelector("select[data-preset]")?.value;
    const preset = (adapter.presets?.() ?? []).find(p => p.id === presetId);
    const t = preset ? fromPreset(preset, "", "") : repairTemplate({name: L("NewTemplate")});
    if ( preset ) t.name = preset.label;
    t.folder = this.#folder;
    t.seed = Math.floor(Math.random() * 2 ** 31);
    await this.#save(t);
  }

  static async #onDuplicate() {
    const t = this.#current();
    if ( t ) await this.#save({...foundry.utils.deepClone(t), id: "", name: L("CopyOf", {name: t.name})});
  }

  static async #onRemove() {
    const t = this.#current();
    if ( !t ) return;
    const ok = await DialogV2.confirm({window: {title: L("Remove")}, content: `<p>${L("RemoveConfirm", {name: t.name})}</p>`});
    if ( !ok ) return;
    await deleteTemplate(t.id);
    this.#selected = null;
    this.render();
  }

  static async #onExport() {
    const area = document.createElement("textarea");
    area.rows = 16;
    area.readOnly = true;
    area.value = JSON.stringify(templates(), null, 2);
    const content = document.createElement("div");
    content.append(area);
    await DialogV2.prompt({window: {title: L("Export")}, content, ok: {label: L("Close")}, position: {width: 640}});
  }

  static async #onImport() {
    const area = document.createElement("textarea");
    area.rows = 16;
    area.name = "json";
    const content = document.createElement("div");
    content.append(area);
    const text = await DialogV2.prompt({window: {title: L("Import")}, content, position: {width: 640},
      ok: {label: L("Import"), callback: (event, button) => button.form.elements.json.value}});
    if ( !text ) return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return ui.notifications.error(L("ImportInvalid"));
    }
    const known = new Set(templates().map(t => t.id));
    let count = 0;
    for ( const raw of (Array.isArray(parsed) ? parsed : [parsed]) ) {
      const t = repairTemplate(raw);
      if ( !t.name && !t.base ) continue;
      await saveTemplate({...t, id: known.has(t.id) ? "" : t.id});
      count++;
    }
    ui.notifications.info(L("Imported", {count}));
    this.render();
  }

  static async #onOpenBase() {
    const t = this.#current();
    const base = t?.base ? await fromUuid(t.base).catch(() => null) : null;
    base?.sheet.render({force: true});
  }

  static async #onClearBase() {
    const t = this.#current();
    if ( t ) await this.#save({...t, base: ""});
  }

  static async #onAddAspect() {
    const t = this.#current();
    const kind = this.element.querySelector("select[data-aspect-kind]")?.value;
    const aspect = repairAspect({kind, path: kind === "set" ? "system.description.chat" : undefined});
    if ( t && aspect ) await this.#save({...t, aspects: [...t.aspects, aspect]});
  }

  static async #onRemoveAspect(event, target) {
    const t = this.#current();
    const index = Number(target.closest("[data-index]").dataset.index);
    await this.#save({...t, aspects: t.aspects.filter((a, i) => i !== index)});
  }

  static async #onAddTier() {
    const t = this.#current();
    await this.#save({...t, variance: {...t.variance, tiers: [...t.variance.tiers, {name: L("NewTier", {n: t.variance.tiers.length + 1}), percent: 0}]}});
  }

  static async #onRemoveTier(event, target) {
    const t = this.#current();
    const index = Number(target.closest("[data-index]").dataset.index);
    await this.#save({...t, variance: {...t.variance, tiers: t.variance.tiers.filter((x, i) => i !== index)}});
  }

  static async #onAddRow() {
    const t = this.#current();
    const n = t.variance.rows.length + 1;
    await this.#save({...t, variance: {...t.variance, rows: [...t.variance.rows, {name: L("NewRow", {n}), set: {}}]}});
  }

  static async #onRemoveRow(event, target) {
    const t = this.#current();
    const index = Number(target.closest("[data-index]").dataset.index);
    await this.#save({...t, variance: {...t.variance, rows: t.variance.rows.filter((x, i) => i !== index)}});
  }

  static async #onAddColumn() {
    const t = this.#current();
    const input = this.element.querySelector("input[data-column]");
    const path = input?.value.trim();
    if ( !path || !path.includes(".") ) return ui.notifications.warn(L("Rows.ColumnHint"));
    await this.#save({...t, variance: {...t.variance, columns: [...t.variance.columns, path]}});
  }

  static async #onRemoveColumn(event, target) {
    const t = this.#current();
    const path = t.variance.columns[Number(target.dataset.column)];
    const rows = t.variance.rows.map(r => {
      const set = {...r.set};
      delete set[path];
      return {...r, set};
    });
    await this.#save({...t, variance: {...t.variance, columns: t.variance.columns.filter(c => c !== path), rows}});
  }

  /** Rows from a spreadsheet: the header names the columns; rows with a known name replace that row. */
  static async #onPasteRows() {
    const t = this.#current();
    const area = document.createElement("textarea");
    area.rows = 14;
    area.name = "tsv";
    area.placeholder = `${ROW_FIELDS.join("\t")}\tsystem.…`;
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = L("Rows.PasteHint");
    const content = document.createElement("div");
    content.append(hint, area);
    const text = await DialogV2.prompt({window: {title: L("Rows.Paste")}, content, position: {width: 640},
      ok: {label: L("Rows.Paste"), callback: (event, button) => button.form.elements.tsv.value}});
    if ( !text ) return;
    const {rows, columns, unknown} = rowsFromTSV(text, adapter.rowLabels?.() ?? {});
    if ( unknown.length ) ui.notifications.warn(L("Rows.Unknown", {headers: unknown.join(", ")}));
    const byName = new Map(t.variance.rows.map(r => [r.name.toLowerCase(), r]));
    for ( const row of rows ) byName.set(row.name.toLowerCase(), {...byName.get(row.name.toLowerCase()), ...row});
    await this.#save({...t, variance: {...t.variance, columns: [...new Set([...t.variance.columns, ...columns])], rows: [...byName.values()]}});
    ui.notifications.info(L("Rows.Pasted", {count: rows.length}));
  }

  static async #onCopyRows() {
    const t = this.#current();
    await game.clipboard.copyPlainText(rowsToTSV(t.variance));
    ui.notifications.info(L("Rows.Copied", {count: t.variance.rows.length}));
  }

  static async #onReroll() {
    const t = this.#current();
    await this.#save({...t, seed: Math.floor(Math.random() * 2 ** 31)});
  }

  static async #onGenerate() {
    const t = this.#current();
    if ( !t || this.#busy ) return;
    if ( !t.base ) return ui.notifications.warn(L("NoBase"));
    this.#busy = true;
    this.render();
    try {
      const result = await generate(t);
      if ( !result ) return ui.notifications.warn(L("NoBase"));
      ui.notifications.info(L("Generated", {created: result.created, updated: result.updated, folder: result.folder.name}));
      if ( result.stale.length ) {
        const list = result.stale.map(i => `<li>${foundry.utils.escapeHTML(i.name)}</li>`).join("");
        const ok = await DialogV2.confirm({window: {title: L("Stale")}, content: `<p>${L("StaleConfirm")}</p><ul>${list}</ul>`});
        if ( ok ) await Item.implementation.deleteDocuments(result.stale.map(i => i.id));
      }
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  static async #onOpenItem(event, target) {
    const item = await fromUuid(target.dataset.uuid).catch(() => null);
    item?.sheet.render({force: true});
  }
}
