// A source panel inside another studio window: pick a scope (project, world, everything, a compendium),
// filter by name and conditions ("cr<=2"), then drag a row out or press + to add it. The owning app
// renders templates/source-panel.hbs with `context()` and calls `activate()` after each render.
import {MODULE_ID} from "./project.mjs";
import {filterHint, filterTooltip, listSources, scopeChoices, validScope} from "./sources.mjs";

export const SOURCE_PANEL_TEMPLATE = `modules/${MODULE_ID}/templates/source-panel.hbs`;

export class SourcePanel {
  /**
   * @param {ApplicationV2} app                     the window the panel lives in (re-rendered on changes)
   * @param {object} options
   * @param {string[]} options.types                document names to offer ("Actor", "Item")
   * @param {(uuid: string, type: string) => *} options.onAdd  what + does
   * @param {string} [options.addHint]              tooltip of +
   */
  constructor(app, {types, onAdd, addHint = "DEWARIM_STUDIO.Sources.Add"}) {
    this.app = app;
    this.types = types;
    this.onAdd = onAdd;
    this.addHint = addHint;
    this.state = {type: types[0], scope: validScope(types[0]), subtype: "", filter: ""};
    this.#scroll = 0;
  }

  #scroll;

  async context() {
    const {type, subtype, filter} = this.state;
    this.state.scope = validScope(type, this.state.scope);
    const {scopes, packs} = scopeChoices(type, this.state.scope);
    const {entries, more, unknown} = await listSources(type, this.state);
    const Cls = getDocumentClass(type);
    const typeLabels = CONFIG[type]?.typeLabels ?? {};
    const subtypes = (Cls.TYPES ?? []).filter(t => t !== "base");
    const everywhere = this.state.scope === "everywhere";
    return {
      types: this.types.length > 1
        ? this.types.map(t => ({value: t, label: _loc(getDocumentClass(t).metadata.labelPlural), selected: t === type}))
        : null,
      scopes,
      packs,
      subtypes: subtypes.length > 1 ? subtypes.map(t => ({value: t, label: _loc(typeLabels[t] ?? t), selected: t === subtype})) : null,
      filter,
      filterTooltip: filterTooltip(type),
      hint: filterHint(type, unknown),
      addHint: this.addHint,
      more,
      rows: entries.map(e => ({...e, type, origin: everywhere ? e.origin : ""}))
    };
  }

  /** Listeners on the rendered panel; `options` are the owning app's render options. */
  activate(html, options = {}) {
    const panel = html.querySelector(".source-panel");
    if ( !panel ) return;
    const set = change => {
      Object.assign(this.state, change);
      if ( "type" in change ) Object.assign(this.state, {subtype: "", scope: validScope(change.type, this.state.scope)});
      this.#scroll = 0;
      this.app.render(change.filter !== undefined ? {sourceFocus: true} : {});
    };
    panel.querySelector("[name=sourceType]")?.addEventListener("change", e => set({type: e.target.value}));
    panel.querySelector("[name=sourceScope]")?.addEventListener("change", e => set({scope: e.target.value}));
    panel.querySelector("[name=sourceSubtype]")?.addEventListener("change", e => set({subtype: e.target.value}));
    const filter = panel.querySelector("[name=sourceFilter]");
    filter.addEventListener("input", foundry.utils.debounce(e => set({filter: e.target.value}), 300));
    if ( options.sourceFocus ) {
      filter.focus();
      filter.setSelectionRange(filter.value.length, filter.value.length);
    }
    const rows = panel.querySelector(".source-rows");
    rows.scrollTop = this.#scroll;
    rows.addEventListener("scroll", () => { this.#scroll = rows.scrollTop; });
    for ( const row of rows.querySelectorAll("[data-uuid]") ) {
      row.addEventListener("dragstart", event => {
        event.stopPropagation();
        event.dataTransfer.setData("text/plain", JSON.stringify({type: row.dataset.type, uuid: row.dataset.uuid}));
        event.dataTransfer.effectAllowed = "copy";
      });
      row.querySelector("[data-source-add]")?.addEventListener("click", async event => {
        event.preventDefault();
        try {
          await this.onAdd(row.dataset.uuid, row.dataset.type);
        } catch(err) {
          ui.notifications.error(err.message, {console: true});
        }
      });
      row.querySelector("[data-source-open]")?.addEventListener("click", async event => {
        event.preventDefault();
        (await fromUuid(row.dataset.uuid))?.sheet?.render(true);
      });
    }
  }
}
