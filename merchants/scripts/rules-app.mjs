// The world's price rules and item levels. One row per exception ("dwarf merchants: elves +50%") - a
// buyer no rule names pays the plain price, so nothing is pre-filled. Item levels: the price brackets and
// the system's own levels (dnd5e: per rarity).
import {adapter} from "./adapter.mjs";
import {DIMENSIONS, keyChoices, parseBrackets, priceRule} from "./config-model.mjs";
import {MODULE_ID, brackets} from "./merchant.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

export class RulesApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dewarim-merchants-rules",
    tag: "form",
    classes: ["dewarim-merchants", "merchant-rules"],
    window: {title: "DEWARIM_MERCHANTS.Rules.Title", icon: "fa-solid fa-scale-unbalanced", resizable: true},
    position: {width: 640, height: "auto"},
    form: {handler: RulesApp.#onSubmit, submitOnChange: false, closeOnSubmit: false},
    actions: {
      addRule: RulesApp.#onAddRule,
      removeRule: RulesApp.#onRemoveRule
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/rules.hbs`, scrollable: [".rules-body"]}
  };

  /** The rows being edited; null: read from the setting on the next render */
  #rows = null;

  #read() {
    this.#rows ??= (game.settings.get(MODULE_ID, "rules") ?? []).map(priceRule).filter(Boolean);
    return this.#rows;
  }

  /** @override */
  async _prepareContext() {
    const levels = game.settings.get(MODULE_ID, "systemLevels") ?? {};
    const races = await adapter.races?.() ?? [];
    const professions = await adapter.professions?.() ?? [];
    const choices = (dimension, value) => {
      const list = dimension === "race" ? races : professions;
      return keyChoices(list, value, [{key: "*", label: _loc("DEWARIM_MERCHANTS.Rules.Anyone")}]);
    };
    return {
      rules: this.#read().map((r, index) => ({...r, index,
        merchants: choices(r.dimension, r.merchant),
        buyers: choices(r.dimension, r.buyer),
        dimensions: DIMENSIONS.map(d => ({value: d, label: _loc(`DEWARIM_MERCHANTS.Dimension.${d}`), selected: d === r.dimension}))})),
      brackets: brackets().join(", "),
      unit: adapter.unit?.label ?? "",
      systemLevels: (adapter.levelSettings?.() ?? []).map(s => ({...s, value: levels[s.key] ?? s.default}))
    };
  }

  /** Keep what was typed before a row is added or removed. */
  #collect() {
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.element).object);
    const rows = Object.entries(data.rules ?? {}).sort(([a], [b]) => Number(a) - Number(b)).map(([, v]) => v);
    // A row switched between race and profession starts over with "*": the old keys mean nothing there
    this.#rows = this.#read().map((r, i) => {
      const row = {...r, ...rows[i]};
      return row.dimension === r.dimension ? row : {...row, merchant: "*", buyer: "*"};
    });
    return data;
  }

  /** @override - the merchant and buyer lists follow a row's dimension */
  _onRender() {
    for ( const select of this.element.querySelectorAll("select[name$='.dimension']") ) {
      select.addEventListener("change", () => {
        this.#collect();
        this.render();
      });
    }
  }

  static #onAddRule(event, target) {
    this.#collect();
    this.#rows.push({dimension: target.dataset.dimension, merchant: "*", buyer: "*", percent: 0});
    this.render();
  }

  static #onRemoveRule(event, target) {
    this.#collect();
    this.#rows.splice(Number(target.closest("[data-index]").dataset.index), 1);
    this.render();
  }

  static async #onSubmit() {
    const data = this.#collect();
    // A row without a buyer is dropped (priceRule); "*" means anyone
    await game.settings.set(MODULE_ID, "rules", this.#rows.map(priceRule).filter(Boolean));
    const parsed = parseBrackets(data.brackets);
    if ( parsed.length ) await game.settings.set(MODULE_ID, "brackets", parsed);
    const levels = {};
    for ( const s of adapter.levelSettings?.() ?? [] ) {
      const n = Number(data.systemLevels?.[s.key]);
      if ( Number.isFinite(n) && (n !== s.default) ) levels[s.key] = n;
    }
    await game.settings.set(MODULE_ID, "systemLevels", levels);
    this.#rows = null;
    ui.notifications.info("DEWARIM_MERCHANTS.Rules.Saved", {localize: true});
    this.render();
  }
}
