// The market: the merchants on the current scene, for players and GM - a click opens a shop. The GM also
// sets the scene's level (what the stock is chosen for) and restocks them all.
import {adapter} from "./adapter.mjs";
import {MODULE_ID, config, merchantTokens, sceneLevel, setSceneLevel, stockItems} from "./merchant.mjs";
import {isDue, restockAll, stateOf} from "./stock.mjs";
import {stockLevel} from "./stock-model.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

export class MarketApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dewarim-merchants-market",
    classes: ["dewarim-merchants", "merchant-market"],
    window: {title: "DEWARIM_MERCHANTS.Market.Title", icon: "fa-solid fa-store", resizable: true},
    position: {width: 460, height: "auto"},
    actions: {
      open: MarketApp.#onOpen,
      restockAll: MarketApp.#onRestockAll,
      rules: () => game.modules.get(MODULE_ID).api.openRules()
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/market.hbs`}
  };

  /** @override */
  async _prepareContext() {
    const scene = canvas.scene;
    const level = sceneLevel(scene);
    const party = adapter.partyLevel?.() ?? null;
    return {
      scene: scene?.name ?? "–",
      gm: game.user.isGM,
      level: level ?? "",
      levelPlaceholder: party ? _loc("DEWARIM_MERCHANTS.Market.PartyLevel", {level: party}) : _loc("DEWARIM_MERCHANTS.Market.MerchantLevel"),
      merchants: merchantTokens(scene).map(t => {
        const cfg = config(t.actor);
        return {
          id: t.id, name: t.name, img: t.texture.src || t.actor.img, hidden: t.hidden,
          count: stockItems(t.actor).length,
          level: stateOf(t)?.level ?? stockLevel(cfg.level, level, party),
          due: game.user.isGM && isDue(t)
        };
      }).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
    };
  }

  /** @override */
  _onRender() {
    this.element.querySelector("input[name=level]")?.addEventListener("change", async event => {
      await setSceneLevel(canvas.scene, event.target.value);
      this.render();
    });
  }

  static #onOpen(event, target) {
    canvas.scene?.tokens.get(target.closest("[data-token-id]").dataset.tokenId)?.actor?.sheet.render({force: true});
  }

  static async #onRestockAll() {
    const count = await restockAll(merchantTokens(canvas.scene), {force: true});
    ui.notifications.info(_loc("DEWARIM_MERCHANTS.Market.Restocked", {count}));
    this.render();
  }
}
