// What the game system contributes: prices and money, levels, races and professions, which items can be
// sold. Set once in `init` by the system's file (systems/dnd5e.mjs) or the generic fallback
// (systems/generic.mjs). Every function works on documents and on compendium index entries alike.
//
//   id                        the adapter's name ("dnd5e", "generic")
//   actorType                 the actor type a new merchant gets
//   itemTypes()               -> [{id, label}] the item types that can be traded
//   sellable(entry)           -> bool: a physical item that can change hands
//   indexFields               compendium index fields the functions below read
//   filterFields              condition keys for the stock filter: {key: {path} | {get(entry)}}
//   quantityPath              where an item keeps its quantity (null: one item is one piece)
//   unit                      {label, value}: the main currency unit (dnd5e: gp = 100 cp); brackets and
//                             custom stock prices are written in it
//   basePrice(entry)          -> the value of one piece in the smallest unit
//   formatPrice(amount)       -> "12 gp 5 sp"
//   systemLevel(entry)        -> the system's own level for an item (dnd5e: by rarity), or null
//   stackable(entry)          -> bool: offered in random quantities (ammunition, potions)
//   buyer(actor)              -> {level, race, profession} - race and profession as rule keys
//   races() / professions()   -> Promise<[{key, label}]> - the keys rules can name
//   partyLevel()              -> the party's level, or null
//   funds(actor)              -> the actor's money in the smallest unit, or null if the system has none
//   pay(actor, amount)        -> Promise<bool> - false if the actor cannot pay
//   receive(actor, amount)    -> Promise
//   defaultSources()          -> compendium ids the stock comes from when a merchant names none
//   templates()               -> [{id, label, itemTypes, filter, sources?}] - kinds of merchant
//   levelSettings()           -> [{key, label, default}] - item levels the GM can change (dnd5e rarities)

export const adapter = {};

export function registerAdapter(support) {
  // Descriptors, not values: a getter (dnd5e's `unit`) must be read when used, after localization - not
  // once in `init`, before it
  Object.defineProperties(adapter, Object.getOwnPropertyDescriptors(support));
}
