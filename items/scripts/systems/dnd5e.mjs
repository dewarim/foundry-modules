// dnd5e adapter: variants applied by dnd5e-model.mjs, presets (quality tiers, potion strengths, the
// powerful draught), and the rider automation - after an item's drinking activity is used, the drinker rolls
// the rider's save and gets its effect on a failure. dnd5e 6.0.6 lets the chat card offer the effect but
// leaves applying it to the GM; without this module (an exported adventure) that is what remains.
import {applyPlan, formulasOf, parseThresholds, riderEffect} from "./dnd5e-model.mjs";
import {localName} from "./dnd5e-names.mjs";

const MODULE_ID = "dewarim-items";

const T = (key, data) => _loc(`DEWARIM_ITEMS.Dnd5e.${key}`, data);

/** Copper per coin, from dnd5e's conversion rates (coins per gp). */
function coins() {
  const currencies = CONFIG.DND5E.currencies;
  const smallest = Math.max(...Object.values(currencies).map(c => c.conversion));
  return Object.fromEntries(Object.entries(currencies).map(([key, c]) => [key, Math.round(smallest / c.conversion)]));
}

function condition(id) {
  const c = CONFIG.DND5E.conditionTypes[id];
  return {name: c ? _loc(c.name ?? c.label) : id, img: c?.img ?? c?.icon ?? "icons/svg/aura.svg"};
}

const unitLabel = (units, value) => _loc(`DEWARIM_ITEMS.Units.${units}`, {n: value});

function riderText(rider) {
  return T("RiderText", {
    dc: rider.dc,
    ability: _loc(CONFIG.DND5E.abilities[rider.ability]?.label ?? rider.ability),
    condition: condition(rider.condition).name,
    duration: rider.duration.value ? unitLabel(rider.duration.units, rider.duration.value) : T("Instant")
  });
}

function context() {
  return {
    coins: coins(),
    thresholds: parseThresholds(game.settings.get(MODULE_ID, "rarityThresholds")),
    randomId: () => foundry.utils.randomID(),
    slugify: name => name.slugify({strict: true}),
    condition,
    riderText,
    potencyText: percent => T("PotencyText", {percent}),
    // dnd5e's compendiums name items in English: a German world gets German names where the list has them
    name: (pattern, parts, data) => localName(pattern, parts, {
      lang: game.i18n.lang,
      identifier: data.system?.identifier ?? "",
      systemItem: String(data._stats?.compendiumSource ?? "").startsWith("Compendium.dnd5e.")
    })
  };
}

/** A rider read from an item with a save that applies an effect (the SRD's Potion of Poison). */
function riderFrom(item) {
  const activities = item.system.activities?.contents ?? Object.values(item.system.activities ?? {});
  const save = activities.find(a => a.type === "save");
  if ( !save ) return null;
  const abilities = save.save?.ability;
  const ability = abilities instanceof Set ? [...abilities][0] : (Array.isArray(abilities) ? abilities[0] : abilities);
  const dc = Number(save.save?.dc?.value ?? save.save?.dc?.formula) || 13;
  const effectId = save.effects?.[0]?._id ?? save.effects?.[0]?.effect?.id;
  const effect = item.effects.get(effectId) ?? item.effects.contents[0];
  const status = effect ? [...(effect.statuses ?? [])][0] : null;
  let duration = {value: 1, units: "hour"};
  const d = effect?.duration;
  if ( d?.value && (d.units === "rounds") ) duration = {value: d.value, units: "round"};
  else if ( d?.value && (d.units === "seconds") ) {
    duration = d.value % 86400 === 0 ? {value: d.value / 86400, units: "day"}
      : (d.value % 3600 === 0 ? {value: d.value / 3600, units: "hour"} : {value: Math.ceil(d.value / 60), units: "minute"});
  }
  else if ( save.duration?.value && ["minute", "hour", "day", "round"].includes(save.duration.units) ) {
    duration = {value: Number(save.duration.value) || 1, units: save.duration.units};
  }
  return {kind: "rider", ability: ability || "con", dc, condition: status || "poisoned", duration, percent: 0};
}

function presets() {
  const potency = {kind: "potency", applies: "heal", percent: 0, follow: true};
  const price = {kind: "price", percent: 0, follow: true};
  const auto = {kind: "rarity", value: "auto"};
  return [
    {id: "quality", label: T("Preset.Quality"), template: {
      variance: {mode: "tiers", tiers: [{name: T("Tier.Shoddy"), percent: -50}, {name: T("Tier.Normal"), percent: 0},
        {name: T("Tier.Fine"), percent: 100}, {name: T("Tier.Masterwork"), percent: 400}]},
      aspects: [price]
    }},
    {id: "potions", label: T("Preset.Potions"), template: {
      variance: {mode: "tiers", tiers: [{name: T("Tier.Failed"), percent: -90}, {name: T("Tier.Normal"), percent: 0},
        {name: T("Tier.Strong"), percent: 50}, {name: T("Tier.Potent"), percent: 75}, {name: T("Tier.Mighty"), percent: 100}]},
      aspects: [potency, price, auto]
    }},
    {id: "brew", label: T("Preset.Brew"), template: {
      variance: {mode: "range", min: 50, max: 100, count: 3, step: 5},
      aspects: [potency, price, auto]
    }},
    {id: "draught", label: T("Preset.Draught"), template: {
      pattern: "{~wild} {base} ({percent})",
      variance: {mode: "range", min: 50, max: 100, count: 3, step: 5},
      aspects: [potency, price, {kind: "rider", ability: "con", dc: 13, condition: "poisoned", duration: {value: 1, units: "hour"},
        percent: -20}, auto]
    }},
    {id: "craft", label: T("Preset.Craft"), template: {
      variance: {mode: "range", min: 5, max: 20, count: 1, step: 1},
      aspects: [{...potency, applies: "both"}, {kind: "price", percent: 10, follow: false}]
    }},
    {id: "rows", label: _loc("DEWARIM_ITEMS.Preset.Rows"), template: {variance: {mode: "rows", rows: []}}}
  ];
}

function summary(data) {
  const system = data.system ?? {};
  const c = CONFIG.DND5E;
  const price = system.price?.value ? `${system.price.value} ${_loc(c.currencies[system.price.denomination || "gp"]?.abbreviation ?? "")}` : "–";
  const w = system.weight;
  const weight = (w && (typeof w === "object") ? w.value : w) || "";
  const rarities = system.rarities?.length ? system.rarities : (system.rarity ? [system.rarity] : []);
  return {
    formulas: formulasOf(system).join(", "),
    price,
    weight: weight ? `${weight} ${w?.units ?? "lb"}` : "",
    rarity: rarities.map(r => _loc(c.itemRarity[r] ?? r)).join(", ")
  };
}

/* -------------------------------------------- */
/*  Rider automation                            */
/* -------------------------------------------- */

/** Who drank: the targets the user picked, if all are theirs; else the item's owner. */
function drinkers(actor) {
  const targets = [...game.user.targets].map(t => t.actor).filter(Boolean);
  return targets.length && targets.every(a => a.isOwner) ? targets : [actor];
}

async function resolveRiders(item, riders) {
  for ( const target of drinkers(item.actor) ) {
    for ( const rider of riders ) {
      const rolls = await target.rollSavingThrow({ability: rider.ability, target: rider.dc}, {configure: false},
        {data: {flavor: T("RiderFlavor", {item: item.name})}});
      const roll = rolls?.[0];
      if ( !roll || roll.isSuccess ) continue;
      const source = item.effects.get(rider.effect)?.toObject()
        ?? riderEffect(rider, {id: foundry.utils.randomID(), ...condition(rider.condition)});
      delete source._id;
      source.origin = item.uuid;
      source.transfer = false;
      await target.createEmbeddedDocuments("ActiveEffect", [source]);
      ui.notifications.info(T("RiderFailed", {name: target.name, condition: source.name}));
    }
  }
}

export function register({registerAdapter}) {
  registerAdapter({
    id: "dnd5e",
    aspectKinds: ["potency", "price", "weight", "rarity", "set", "rider"],
    apply: (data, plan) => applyPlan(data, plan, context()),
    summary,
    presets,
    rowLabels: () => Object.fromEntries(["Name", "Price", "Weight", "Img", "Note"].map(k => [k.toLowerCase(), _loc(`DEWARIM_ITEMS.Rows.${k}`)])),
    get priceUnit() {
      return _loc(CONFIG.DND5E.currencies.gp.abbreviation);
    },
    abilities: () => Object.entries(CONFIG.DND5E.abilities).map(([key, a]) => ({key, label: _loc(a.label)})),
    conditions: () => Object.entries(CONFIG.DND5E.conditionTypes).filter(([, c]) => !c.pseudo)
      .map(([key, c]) => ({key, label: _loc(c.name ?? c.label)})).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang)),
    rarities: () => Object.entries(CONFIG.DND5E.itemRarity).map(([key, label]) => ({key, label: _loc(label)})),
    riderFrom
  });

  // The rider's save, rolled by the client that used the item (the drinker's player or the GM)
  Hooks.on("dnd5e.postUseActivity", activity => {
    if ( !game.settings.get(MODULE_ID, "automateRiders") ) return;
    const item = activity.item;
    const riders = (item?.flags?.[MODULE_ID]?.riders ?? []).filter(r => r.activity === activity.id);
    if ( !riders.length || !item.actor ) return;
    resolveRiders(item, riders).catch(err => console.error(`${MODULE_ID} | rider of ${item.name}`, err));
  });
}
