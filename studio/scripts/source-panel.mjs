// A source panel inside another studio window: pick a scope (project, world, everything, a compendium),
// filter by name and conditions ("cr<=2"), then drag a row out or press + to add it. The owning app
// renders templates/source-panel.hbs with `context()` and calls `activate()` after each render.
// A panel with a `key` remembers its picks per client (setting `sourcePanels`), so the window opens
// where it was left; see source-state.mjs for what is remembered and what is not.
import {MODULE_ID} from "./project.mjs";
import {restoredState, statePersisted, storedState} from "./source-state.mjs";
import {filterHint, filterTooltip, listSources, scopeChoices, validScope} from "./sources.mjs";

export const SOURCE_PANEL_TEMPLATE = `modules/${MODULE_ID}/templates/source-panel.hbs`;

/** A document type's own subtypes, without the abstract "base". */
function subtypesOf(documentName) {
  return (getDocumentClass(documentName).TYPES ?? []).filter(t => t !== "base");
}

export class SourcePanel {
  /**
   * @param {ApplicationV2} app                     the window the panel lives in (re-rendered on changes)
   * @param {object} options
   * @param {string[]} options.types                document names to offer ("Actor", "Item")
   * @param {(uuid: string, type: string) => *} options.onAdd  what + does
   * @param {string} [options.addHint]              tooltip of +
   * @param {string} [options.key]                  name under which the picks are remembered ("", not at all)
   */
  constructor(app, {types, onAdd, addHint = "DEWARIM_STUDIO.Sources.Add", key = ""}) {
    this.app = app;
    this.types = types;
    this.onAdd = onAdd;
    this.addHint = addHint;
    this.key = key;
    this.state = restoredState({types, saved: key ? (game.settings.get(MODULE_ID, "sourcePanels")[key] ?? {}) : {},
      validScope, subtypesOf});
    this.#scroll = 0;
  }

  #scroll;

  /** Store the picks for the next time this panel opens; a panel without a key keeps nothing. */
  async #save() {
    if ( !this.key ) return;
    const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, "sourcePanels"));
    all[this.key] = storedState(this.state);
    await game.settings.set(MODULE_ID, "sourcePanels", all);
  }

  async context() {
    const {type, subtype, filter} = this.state;
    this.state.scope = validScope(type, this.state.scope);
    const {scopes, packs} = scopeChoices(type, this.state.scope);
    const {entries, more, unknown} = await listSources(type, this.state);
    const typeLabels = CONFIG[type]?.typeLabels ?? {};
    const subtypes = subtypesOf(type);
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
      if ( statePersisted(change) ) this.#save().catch(err => console.error(`${MODULE_ID} | source panel:`, err));
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
