# Changelog

## 0.1.0 (2026-10-25)

- First release. Item templates: a base item, aspects that change it, and variants of it - a rolled
  range of strengths, fixed tiers (Shoddy / Fine / Masterwork, Strong / Potent / Mighty), or rows typed
  or pasted from a spreadsheet for quick mundane items.
- Aspects: strength of heal and damage dice, price, weight, rarity (fixed or by price), any data path,
  and riders - a save that guards a side effect: a healing potion that heals more but poisons on a
  failed Constitution save. A rider can be taken from an item that has one (Potion of Poison).
- Preview before generating; re-generating replaces the items with their ids kept, so merchants' stock
  and links stay valid.
- Normal tiers (the plain item) in the quality and potion presets, and failed potions at 10 % strength -
  a formula the dice cannot follow is multiplied whole and does at least 1.
- Names in one language: in a German world, the SRD's mundane items and potions get German names with
  the tier words declined to match (*Gutes Langschwert*, *Starker Heiltrank*); items the list does not
  know keep English words.
- dnd5e adapter with the rider's save rolled automatically; a generic fallback (name, price, weight,
  data paths) for other systems. `api.vary` gives *Dewarim: Merchants* its crafters' variants.
