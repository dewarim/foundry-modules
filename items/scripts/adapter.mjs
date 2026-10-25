// What the game system contributes to item variants. Set once in `init` by the system's file
// (systems/dnd5e.mjs) or the generic fallback (systems/generic.mjs).
//
//   id                    the adapter's name ("dnd5e", "generic")
//   aspectKinds           the aspect kinds it can apply (variant-model.mjs ASPECT_KINDS, or fewer)
//   apply(data, plan)     -> {data, potent, ratio}: a variant's plan applied to a copy of the base's data
//   summary(data)         -> {formulas, price, weight, rarity}: texts for the preview table
//   presets()             -> [{id, label, template}]: ready-made templates the GM starts from
//   rowLabels()           -> {name, price, weight, img, note}: column labels of rows mode (pasting matches them)
//   priceUnit             the unit prices in rows are written in ("gp")
//   abilities()           -> [{key, label}] for a rider's save
//   conditions()          -> [{key, label}] a rider can apply
//   rarities()            -> [{key, label}]
//   riderFrom(item)       -> a rider read from an item with a save (Potion of Poison), or null

export const adapter = {};

export function registerAdapter(support) {
  // Descriptors, not values: a getter must be read when used, after localization - not once in `init`
  Object.defineProperties(adapter, Object.getOwnPropertyDescriptors(support));
}
