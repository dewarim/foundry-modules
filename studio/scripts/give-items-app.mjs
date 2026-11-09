// Give an item to the actors picked in a table, without opening a single actor sheet. The studio edits
// document fields, not an actor's items, so this was the one thing a table still sent the GM to the
// system's sheet for - one actor at a time (ROADMAP step 3/7).
//
// The window keeps the actors it was opened for: the table's selection can move on while it is open, and
// a picker that quietly changes its targets under the GM is how twelve actors get the wrong sword. It
// stays open after a give, because handing out a sword, a shield and three potions is one task.
import {MODULE_ID} from "./project.mjs";
import {SOURCE_PANEL_TEMPLATE, SourcePanel} from "./source-panel.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/** Names listed in full before the rest becomes "… and N more". */
const NAMES_SHOWN = 8;

export class GiveItemsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dewarim-studio-give-items",
    classes: ["dewarim-studio", "dewarim-studio-give-items"],
    window: {title: "DEWARIM_STUDIO.Give.Title", icon: "fa-solid fa-hand-holding-heart", resizable: true},
    position: {width: 460, height: 620}
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/give-items.hbs`, templates: [SOURCE_PANEL_TEMPLATE]}
  };

  /**
   * @param {Actor[]} actors                                   who gets it - kept as they were at opening
   * @param {object} options
   * @param {(item: Item, quantity: number) => Promise<*>} options.onGive  does the giving, and the undo
   *   bookkeeping, in the window that opened this one
   */
  constructor(actors, {onGive, ...options} = {}) {
    super(options);
    this.actors = actors;
    this.#onGive = onGive;
    this.#sources = new SourcePanel(this, {
      types: ["Item"],
      onAdd: async uuid => this.#give(await fromUuid(uuid)),
      addHint: "DEWARIM_STUDIO.Give.AddHint",
      key: "give-items"
    });
  }

  #onGive;
  #sources;
  #quantity = 1;

  /** @override */
  async _prepareContext() {
    const names = this.actors.map(a => a.name);
    return {
      count: this.actors.length,
      names: names.slice(0, NAMES_SHOWN).join(", "),
      more: Math.max(0, names.length - NAMES_SHOWN),
      quantity: this.#quantity,
      source: await this.#sources.context()
    };
  }

  /** @override */
  _onRender(context, options) {
    this.#sources.activate(this.element, options);
    this.element.querySelector("[name=quantity]")?.addEventListener("change", event => {
      this.#quantity = Math.max(1, Math.round(Number(event.target.value) || 1));
      event.target.value = this.#quantity;
    });
  }

  /** The + of a source row: that item to every actor this window was opened for. */
  async #give(item) {
    if ( !item ) throw new Error(_loc("DEWARIM_STUDIO.Give.ItemGone"));
    // An actor deleted while the window was open is skipped rather than failing the whole give
    const actors = this.actors.filter(a => game.actors.has(a.id));
    if ( !actors.length ) throw new Error(_loc("DEWARIM_STUDIO.Give.ActorsGone"));
    await this.#onGive(item, this.#quantity, actors);
  }
}
