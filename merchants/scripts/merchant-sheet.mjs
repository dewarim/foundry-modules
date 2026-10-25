// The merchant's sheet. Opened from a placed token it is the shop: that token's stock with prices for
// the chosen character, and what the merchant would pay for the character's things. GMs also get the
// *Merchant* tab - the whole configuration, custom stock and the merchant's own price rules. Opened from
// the actor in the sidebar there is no stock to show: the configuration only.
import {adapter} from "./adapter.mjs";
import {DIMENSIONS, keyChoices} from "./config-model.mjs";
import {
  DEFAULT_IMG, MODULE_ID, accepts, baseActor, config, configure, isMerchant, quantityOf, stockItems
} from "./merchant.mjs";
import {isDue, restock, stateOf} from "./stock.mjs";
import {askingPrice, canTrade, factorFor, offeredPrice, request} from "./trade.mjs";

const {HandlebarsApplicationMixin} = foundry.applications.api;
const {ActorSheetV2} = foundry.applications.sheets;

export class MerchantSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["dewarim-merchants", "merchant-sheet"],
    position: {width: 720, height: 680},
    window: {icon: "fa-solid fa-store", resizable: true},
    form: {handler: MerchantSheet.#onSubmit, submitOnChange: true, closeOnSubmit: false},
    actions: {
      showTab: MerchantSheet.#onShowTab,
      buy: MerchantSheet.#onBuy,
      sell: MerchantSheet.#onSell,
      restock: MerchantSheet.#onRestock,
      openItem: MerchantSheet.#onOpenItem,
      addRule: MerchantSheet.#onAddRule,
      removeRule: MerchantSheet.#onRemoveRule,
      removeFixed: MerchantSheet.#onRemoveFixed,
      addCraft: MerchantSheet.#onAddCraft,
      removeCraft: MerchantSheet.#onRemoveCraft,
      addPack: MerchantSheet.#onAddPack,
      systemSheet: MerchantSheet.#onSystemSheet
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/merchant-sheet.hbs`, scrollable: [".merchant-body"]}
  };

  #tab = "shop";
  #buyerUuid = null;
  #busy = false;

  get title() {
    return this.document.name;
  }

  /** The placed token, if this sheet belongs to one. */
  get token() {
    return this.document.isToken ? this.document.token : null;
  }

  /** Characters this user may shop for: own ones (GM: the players'), a controlled token's first. */
  #buyers() {
    // A GM owns everything: the players' characters, and characters at all (a GM testing, an NPC party)
    const owned = a => a && !isMerchant(a) && a.isOwner && (!game.user.isGM || a.hasPlayerOwner || (a.type === "character"));
    const controlled = (canvas.tokens?.controlled ?? []).map(t => t.actor).filter(a => a && !isMerchant(a) && a.isOwner);
    const list = [...controlled, game.user.character, ...game.actors.filter(owned)].filter(Boolean);
    return [...new Map(list.map(a => [a.uuid, a])).values()];
  }

  #buyer(buyers) {
    return buyers.find(a => a.uuid === this.#buyerUuid) ?? buyers[0] ?? null;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const cfg = config(actor);
    const gm = game.user.isGM;
    const token = this.token;
    if ( !token ) this.#tab = gm ? "config" : "none";
    else if ( !gm ) this.#tab = "shop";
    const races = await adapter.races?.() ?? [];
    const professions = await adapter.professions?.() ?? [];
    const label = (list, key) => list.find(e => e.key === key)?.label ?? key;
    Object.assign(context, {
      gm,
      tab: this.#tab,
      token: !!token,
      img: actor.img || DEFAULT_IMG,
      subtitle: [label(races, cfg.race), label(professions, cfg.profession),
        _loc("DEWARIM_MERCHANTS.LevelN", {level: cfg.level})].filter(Boolean).join(" · "),
      shop: (this.#tab === "shop") && token ? this.#shopContext(actor, cfg, token) : null,
      config: gm && (this.#tab === "config") ? this.#configContext(cfg, races, professions) : null
    });
    return context;
  }

  #shopContext(actor, cfg, token) {
    const buyers = this.#buyers();
    const buyer = this.#buyer(buyers);
    const {factor, race, profession} = factorFor(actor, buyer);
    const funds = buyer ? adapter.funds?.(buyer) : null;
    const percent = n => `${n > 0 ? "+" : ""}${n}%`;
    const notes = [];
    if ( cfg.markup ) notes.push(_loc("DEWARIM_MERCHANTS.Shop.Markup", {percent: percent(cfg.markup)}));
    if ( race ) notes.push(_loc("DEWARIM_MERCHANTS.Shop.RaceRule", {percent: percent(race)}));
    if ( profession ) notes.push(_loc("DEWARIM_MERCHANTS.Shop.ProfessionRule", {percent: percent(profession)}));
    const stock = stockItems(actor).map(item => {
      const flag = item.flags[MODULE_ID].stock;
      const price = askingPrice(actor, item, factor);
      return {
        id: item.id, name: item.name, img: item.img, level: flag.fixed ? "" : flag.level,
        fixed: !!flag.fixed, unlimited: !!flag.unlimited, quantity: flag.unlimited ? "∞" : quantityOf(item),
        price: adapter.formatPrice(price), affordable: (funds === null) || (funds >= price), sort: flag.fixed ? -1 : (Number(flag.level) || 0)
      };
    }).sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name, game.i18n.lang));
    const sell = buyer ? buyer.items.filter(i => accepts(cfg, i)).map(item => {
      const price = offeredPrice(actor, item, factor);
      return {id: item.id, name: item.name, img: item.img, quantity: quantityOf(item) || 1, price: adapter.formatPrice(price), worth: price > 0};
    }).filter(i => i.worth).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang)) : [];
    const state = stateOf(token);
    return {
      canTrade: canTrade() && (funds !== null),
      noGm: !canTrade(),
      noMoney: canTrade() && buyer && (funds === null),
      buyers: buyers.map(a => ({uuid: a.uuid, name: a.name, selected: a === buyer})),
      buyer: buyer ? {name: buyer.name, funds: funds === null ? "–" : adapter.formatPrice(funds)} : null,
      notes: notes.join(" · "),
      stock,
      empty: !stock.length,
      sell,
      purse: (cfg.purse !== null) && game.user.isGM ? adapter.formatPrice(state?.purse ?? cfg.purse) : null,
      lastRestock: state?.last?.real ? new Date(state.last.real).toLocaleString(game.i18n.lang) : "–",
      due: isDue(token),
      busy: this.#busy
    };
  }

  #configContext(cfg, races, professions) {
    const packs = game.packs.filter(p => (p.documentName === "Item") && p.visible)
      .map(p => ({id: p.collection, label: `${p.title} · ${p.metadata.packageName}`}))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
    const sourceLabel = id => {
      const pack = game.packs.get(id);
      if ( pack ) return `${pack.title} · ${pack.metadata.packageName}`;
      const doc = fromUuidSync(id, {strict: false});
      return doc ? `${doc.name} (${_loc(doc.constructor.metadata.label)})` : _loc("DEWARIM_MERCHANTS.Config.Missing");
    };
    const unit = adapter.unit?.label ?? "";
    const none = [{key: "", label: "–"}];
    const anyone = [{key: "*", label: _loc("DEWARIM_MERCHANTS.Rules.Anyone")}];
    return {
      ...cfg,
      unit,
      raceChoices: keyChoices(races, cfg.race, none),
      professionChoices: keyChoices(professions, cfg.profession, none),
      types: (adapter.itemTypes?.() ?? []).map(t => ({...t, checked: cfg.itemTypes.includes(t.id)})),
      sourcesText: cfg.sources.join("\n"),
      sourceLabels: cfg.sources.map(sourceLabel),
      defaultSources: (adapter.defaultSources?.() ?? []).map(sourceLabel).join(", ") || "–",
      packs,
      clocks: ["real", "game"].map(c => ({value: c, label: _loc(`DEWARIM_MERCHANTS.Config.Clock.${c}`), selected: c === cfg.restock.clock})),
      fixed: cfg.fixed.map((f, index) => {
        const doc = fromUuidSync(f.uuid, {strict: false});
        return {...f, index, name: doc?.name ?? f.name ?? f.uuid, img: doc?.img ?? "icons/svg/item-bag.svg", missing: !doc,
          unlimited: f.quantity === null};
      }),
      rules: cfg.rules.map((r, index) => ({...r, index,
        buyers: keyChoices(r.dimension === "race" ? races : professions, r.buyer, anyone),
        dimensions: DIMENSIONS.map(d => ({value: d, label: _loc(`DEWARIM_MERCHANTS.Dimension.${d}`), selected: d === r.dimension}))})),
      filterKeys: ["type", "level", "price", ...Object.keys(adapter.filterFields ?? {})].join(", "),
      craft: cfg.craft.map((c, index) => ({...c, index})),
      hasItems: !!game.modules.get("dewarim-items")?.active,
      purse: cfg.purse === null ? "" : cfg.purse / (adapter.unit?.value || 1)
    };
  }

  /** @override - only the configuration is the GM's to lock; the shop's controls stay usable for players */
  _toggleDisabled(disabled) {
    for ( const el of this.element.querySelectorAll(".merchant-config :is(input, select, textarea, button)") ) el.disabled = disabled;
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    // A visit restocks a merchant who is due (on the GM's side)
    const token = this.token;
    if ( token && isDue(token) && canTrade() ) {
      request("restockIfDue", {sceneId: token.parent.id, tokenId: token.id})
        .then(message => { if ( message ) this.render(); })
        .catch(err => console.warn(`${MODULE_ID} | restock on visit`, err));
    }
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const html = this.element;
    // The shop's fields are not configuration: they must not submit the form
    html.querySelector(".merchant-shop")?.addEventListener("change", event => {
      event.stopPropagation();
      if ( event.target.name === "buyer" ) {
        this.#buyerUuid = event.target.value;
        this.render();
      }
    });
    for ( const zone of html.querySelectorAll("[data-drop]") ) {
      zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", e => {
        zone.classList.remove("drag-over");
        e.stopPropagation();
        this.#onConfigDrop(e, zone.dataset.drop);
      });
    }
  }

  /** @override - dropping an item on the shop is not giving it to the merchant */
  async _onDrop(event) {
    event.preventDefault();
  }

  /** Items dropped on the custom stock, items or folders on the sources. */
  async #onConfigDrop(event, target) {
    event.preventDefault();
    if ( !game.user.isGM ) return;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const doc = data.uuid ? await fromUuid(data.uuid) : null;
    const cfg = config(this.document);
    if ( (target === "fixed") && (doc instanceof Item) && !doc.parent ) {
      if ( cfg.fixed.some(f => f.uuid === doc.uuid) ) return;
      await configure(this.document, {fixed: [...cfg.fixed, {uuid: doc.uuid, name: doc.name, quantity: 1, replenish: true}]});
    }
    else if ( (target === "sources") && ((doc instanceof Item && !doc.parent) || (doc instanceof Folder && doc.type === "Item")) ) {
      if ( cfg.sources.includes(doc.uuid) ) return;
      await configure(this.document, {sources: [...cfg.sources, doc.uuid]});
    }
    else return ui.notifications.warn("DEWARIM_MERCHANTS.Config.DropHint", {localize: true});
    this.render();
  }

  /** The configuration form: every field of the *Merchant* tab. */
  static async #onSubmit(event, form, formData) {
    if ( !game.user.isGM ) return;
    const data = foundry.utils.expandObject(formData.object);
    if ( !data.config ) return;
    const cfg = config(this.document);
    const unit = adapter.unit?.value || 1;
    const rows = obj => Object.entries(obj ?? {}).sort(([a], [b]) => Number(a) - Number(b)).map(([, v]) => v);
    const fixedRows = rows(data.fixed);
    const ruleRows = rows(data.rules);
    const craftRows = rows(data.craft);
    const patch = {
      ...data.config,
      itemTypes: Object.entries(data.types ?? {}).filter(([, on]) => on).map(([id]) => id),
      sources: String(data.sources ?? "").split("\n").map(s => s.trim()).filter(Boolean),
      purse: (data.config.purse === null) || (data.config.purse === "") ? null : Math.round(Number(data.config.purse) * unit),
      fixed: cfg.fixed.map((f, i) => {
        const row = fixedRows[i] ?? {};
        return {...f, quantity: row.unlimited ? null : (row.quantity ?? 1), price: row.price ?? null, exact: !!row.exact,
          replenish: !!row.replenish};
      }),
      craft: cfg.craft.map((c, i) => ({...c, ...craftRows[i]})),
      // A rule switched between race and profession starts over with anyone: the old key means nothing there
      rules: cfg.rules.map((r, i) => {
        const row = {...r, ...ruleRows[i]};
        return row.dimension === r.dimension ? row : {...row, buyer: "*"};
      })
    };
    await configure(this.document, patch);
    const base = baseActor(this.document);
    if ( data.img && (data.img !== base.img) ) {
      const update = {img: data.img};
      // The token image follows while it is still the portrait or the default
      if ( [base.img, DEFAULT_IMG].includes(base.prototypeToken.texture.src) ) update["prototypeToken.texture.src"] = data.img;
      await base.update(update);
    }
    this.render();
  }

  static #onShowTab(event, target) {
    this.#tab = target.dataset.tab;
    this.render();
  }

  async #trade(kind, target) {
    if ( this.#busy ) return;
    const row = target.closest("[data-item-id]");
    const quantity = Number(row.querySelector("input[data-quantity]")?.value) || 1;
    const buyer = this.#buyer(this.#buyers());
    const token = this.token;
    if ( !buyer || !token ) return;
    this.#busy = true;
    this.render();
    try {
      const message = await request("trade", {kind, sceneId: token.parent.id, tokenId: token.id, buyerUuid: buyer.uuid,
        itemId: row.dataset.itemId, quantity});
      ui.notifications.info(message);
    } catch(err) {
      ui.notifications.warn(err.message);
    } finally {
      this.#busy = false;
      this.render();
    }
  }

  static #onBuy(event, target) {
    return this.#trade("buy", target);
  }

  static #onSell(event, target) {
    return this.#trade("sell", target);
  }

  static async #onRestock() {
    const token = this.token;
    if ( !token || !game.user.isGM ) return;
    const result = await restock(token, {force: true});
    if ( result ) ui.notifications.info(_loc("DEWARIM_MERCHANTS.RestockedCounts", {name: token.name, ...result}));
    this.render();
  }

  static #onOpenItem(event, target) {
    const id = target.closest("[data-item-id]").dataset.itemId;
    const item = this.document.items.get(id) ?? this.#buyer(this.#buyers())?.items.get(id);
    item?.sheet.render({force: true});
  }

  static async #onAddRule(event, target) {
    const cfg = config(this.document);
    const dimension = target.dataset.dimension;
    await configure(this.document, {rules: [...cfg.rules, {dimension, buyer: "*", percent: 0}]});
    this.render();
  }

  static async #onRemoveRule(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    const cfg = config(this.document);
    await configure(this.document, {rules: cfg.rules.filter((r, i) => i !== index)});
    this.render();
  }

  static async #onRemoveFixed(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    const cfg = config(this.document);
    await configure(this.document, {fixed: cfg.fixed.filter((f, i) => i !== index)});
    this.render();
  }

  static async #onAddCraft() {
    const cfg = config(this.document);
    await configure(this.document, {craft: [...cfg.craft, {filter: "", min: 5, max: 20, price: 10}]});
    this.render();
  }

  static async #onRemoveCraft(event, target) {
    const index = Number(target.closest("[data-index]").dataset.index);
    const cfg = config(this.document);
    await configure(this.document, {craft: cfg.craft.filter((c, i) => i !== index)});
    this.render();
  }

  static async #onAddPack() {
    const select = this.element.querySelector("select[data-pack]");
    const id = select?.value;
    const cfg = config(this.document);
    if ( !id || cfg.sources.includes(id) ) return;
    await configure(this.document, {sources: [...cfg.sources, id]});
    this.render();
  }

  /** The system's own sheet, for everything that is not trading. */
  static #onSystemSheet() {
    const actor = this.document;
    const Sheet = CONFIG.Actor.sheetClasses[actor.type]
      && Object.values(CONFIG.Actor.sheetClasses[actor.type]).find(s => s.default)?.cls;
    if ( Sheet ) new Sheet({document: actor}).render({force: true});
  }
}
