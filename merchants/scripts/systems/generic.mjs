// The fallback for systems without an adapter: price, money, level, race and quantity are data paths the
// GM sets in the module settings (all empty by default). Without a money path the shop lists the stock and
// its prices, and the GM hands items out by hand; trades need both a price and a money path.
import {MODULE_ID} from "../merchant.mjs";

const path = key => String(game.settings.get(MODULE_ID, `generic.${key}`) ?? "").trim();
const read = (doc, key) => (path(key) ? foundry.utils.getProperty(doc, path(key)) : undefined);
const number = value => Number(value) || 0;

export function register({registerAdapter}) {
  registerAdapter({
    id: "generic",
    actorType: Actor.TYPES.find(t => t !== "base"),
    itemTypes: () => Item.TYPES.filter(t => t !== "base").map(id => ({id, label: _loc(CONFIG.Item.typeLabels[id] ?? id)})),
    sellable: entry => !!entry?.type,
    get indexFields() {
      return ["price", "quantity"].map(path).filter(Boolean);
    },
    filterFields: {},
    get quantityPath() {
      return path("quantity") || null;
    },
    unit: {label: "", value: 1},
    basePrice: entry => number(read(entry, "price")),
    formatPrice: amount => Number(amount).toLocaleString(game.i18n.lang),
    systemLevel: () => null,
    levelSettings: () => [],
    stackable: () => false,
    buyer: actor => ({
      level: number(read(actor, "level")) || 1,
      race: String(read(actor, "race") ?? "").toLowerCase(),
      profession: String(read(actor, "profession") ?? "").toLowerCase()
    }),
    races: async () => [],
    professions: async () => [],
    partyLevel: () => null,
    funds: actor => (path("money") ? number(read(actor, "money")) : null),
    async pay(actor, amount) {
      if ( !path("money") ) return false;
      const funds = number(read(actor, "money"));
      if ( funds < amount ) return false;
      await actor.update({[path("money")]: funds - amount});
      return true;
    },
    async receive(actor, amount) {
      if ( path("money") ) await actor.update({[path("money")]: number(read(actor, "money")) + amount});
    },
    defaultSources: () => [],
    templates: () => []
  });
}
