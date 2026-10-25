// The fallback for systems without an adapter: name, price and weight (data paths set in the module
// settings, empty by default) and data paths. Potency and riders need a system's rules.
import {itemName, percentText} from "../variant-model.mjs";

const MODULE_ID = "dewarim-items";

const path = key => String(game.settings.get(MODULE_ID, `generic.${key}`) ?? "").trim();

function scale(data, key, factor, value) {
  const p = path(key);
  if ( !p ) return;
  if ( value !== null ) foundry.utils.setProperty(data, p, value);
  else if ( factor !== 1 ) {
    const n = Number(foundry.utils.getProperty(data, p)) || 0;
    foundry.utils.setProperty(data, p, Math.round(n * factor * 100) / 100);
  }
}

export function register({registerAdapter}) {
  registerAdapter({
    id: "generic",
    aspectKinds: ["price", "weight", "set"],
    apply(data, plan) {
      scale(data, "price", plan.price.factor, plan.price.value);
      scale(data, "weight", plan.weight.factor, plan.weight.value);
      for ( const {path: p, value} of plan.sets ) foundry.utils.setProperty(data, p, value);
      if ( plan.img ) data.img = plan.img;
      data.name = itemName(plan.pattern, {...plan.nameParts, percent: percentText(plan.factor)});
      foundry.utils.setProperty(data, `flags.${MODULE_ID}`, {key: plan.key, factor: plan.factor, ratio: plan.factor, riders: []});
      return {data, potent: null, ratio: plan.factor};
    },
    summary: data => ({
      formulas: "",
      price: path("price") ? String(foundry.utils.getProperty(data, path("price")) ?? "") : "",
      weight: path("weight") ? String(foundry.utils.getProperty(data, path("weight")) ?? "") : "",
      rarity: ""
    }),
    presets: () => [
      {id: "quality", label: _loc("DEWARIM_ITEMS.Preset.Quality"), template: {
        variance: {mode: "tiers", tiers: [{name: _loc("DEWARIM_ITEMS.Tier.Shoddy"), percent: -50},
          {name: _loc("DEWARIM_ITEMS.Tier.Fine"), percent: 100}, {name: _loc("DEWARIM_ITEMS.Tier.Masterwork"), percent: 400}]},
        aspects: [{kind: "price", percent: 0, follow: true}]
      }},
      {id: "rows", label: _loc("DEWARIM_ITEMS.Preset.Rows"), template: {variance: {mode: "rows", rows: []}}}
    ],
    rowLabels: () => Object.fromEntries(["Name", "Price", "Weight", "Img", "Note"].map(k => [k.toLowerCase(), _loc(`DEWARIM_ITEMS.Rows.${k}`)])),
    priceUnit: "",
    abilities: () => [],
    conditions: () => [],
    rarities: () => [],
    riderFrom: () => null
  });
}
