# Dewarim: Item templates

**Requires:** nothing beyond Foundry v14 — system-agnostic, with an adapter for dnd5e 6 (recommended);
*Dewarim: Merchants* and *Dewarim: Studio* recommended.

Make items from templates instead of one by one: variants of a base item, quick mundane items, and
items that combine rules.

*Item templates* is in the Items sidebar (GMs) and in the module settings.

## A template

- **Base**: drop an item from the sidebar or a compendium. Every item made is a copy of it.
- **Variants**:
  - *one item*: the base, changed by the aspects.
  - *a rolled range*: "+50 % … +100 %, 3 items" - each item rolls its own strength. The same seed rolls the
    same; *Reroll* gives a new seed. Items whose strengths round to the same dice are made once.
  - *tiers*: one item per tier with its strength - *Shoddy* −50 %, *Normal* ±0 % (the plain item, named
    without a word), *Fine* +100 %, *Masterwork* +400 %; potions from *Failed* −90 % to *Mighty* +100 %.
  - *rows (quick items)*: one item per row, like the base but with the row's name, price, weight, image and
    note, plus columns for any data path (`system.material`). Type them in, or *paste from a spreadsheet*
    (a header row of `name, price, weight, img, note` or data paths); *copy* gives them back.
- **Aspects**:
  - *Strength*: the heal and/or damage dice, about the average times the strength, in the same dice:
    2d4 + 2 at +50 % is 3d4 + 3, at +100 % 4d4 + 4, at +10 % 2d4 + 3. Where the dice cannot follow (a
    failed potion at 10 %), the formula is multiplied whole and does at least 1: `max(1, floor((2d4 + 2) * 0.1))`.
  - *Price* and *Weight*: a change of their own (+10 %), optionally times the strength (*follows strength*),
    or a fixed value.
  - *Rarity*: as the base, fixed, or by price (*Rarity by price* in the settings; never below the base's,
    and only for magic items).
  - *Data path*: any field, such as `system.properties = mgc, fin`.
  - *Rider*: a save that guards a side effect. "DC 13 Constitution or Poisoned for an hour" - the healing
    always happens, the save only decides the side effect. Drop an item with a save (*Potion of Poison*) on
    the rider to take its save and effect. A price change makes the drawback cheaper.
- **Names**: `{base}`, `{tier}`, `{percent}` (the strength the dice really have, +14 %), `{name}` (a row's),
  `{~word}` (a word that follows the item's language, see below).
- **Preview** shows each item's name, dice, price, weight and rarity before *Generate* writes them.

**Presets** (dnd5e): quality tiers (shoddy, normal, fine, masterwork), potion strengths (failed, normal,
strong, potent, mighty), brewed potions (a range), the *powerful draught* (a range with a poison rider), a
*skilled crafter* (+5–20 % for +10 % price), quick items. A preset becomes an
editable template.

## Names in one language (dnd5e)

dnd5e's compendiums name their items in English. In a German world the adapter uses its own list of German
names for the SRD's mundane items, ammunition, potions, oils, poisons, gear, clothing and tools (by the
item's identifier, with gender), and declines the tier words to match: *Gutes Langschwert*, *Gute leichte
Armbrust*, *Starker Heiltrank*, *Schäbige Pfeile*. An item the list does not know (a magic weapon) keeps its
English name with English words - *Fine Flame Tongue*, never *Gute Flame Tongue*. An own item with a German
name gets the words declined if the list knows the name, else behind it: *Wurzelsud (stark)*. Known words:
normal (no word: the plain name), failed, shoddy, fine, masterwork, strong, potent, mighty, wild, rusty,
crude, superior - in either language, any ending. Generated items keep the base's identifier (rows get their own), so dnd5e still finds them by it.

## Generating

*Generate* writes world items into the template's folder (a new one, *Items · name*, unless chosen).
Generating again **replaces** the items it made before, keeping their ids, so a merchant's custom stock,
a source folder or an `@UUID` link still finds them; items the template no longer makes are listed and
deleted only after asking.

## Riders in play (dnd5e)

dnd5e lets the chat card offer the rider's effect but applies it by hand. With *Roll riders' saves* (on by
default) the module does it: after the drinking activity is used, the drinker - the user's own targets, or
else the item's owner - rolls the save, and on a failure gets the effect. Without the module (an
exported adventure) the card still offers the effect, and the description names the save.

## With other modules

- **Merchants**: a template's folder is a source like any item folder; single items go into custom stock.
  A merchant's *Craft* (on his sheet) stocks variants: "+5 … +20 % stronger, +10 % price" turns a plain
  Potion of Healing into a *Potion of Healing (+14%)* at 55 gp - an alchemist better than the rest.
- **Studio**: *Item templates* in the studio window writes into the active project's folder, so the items
  are part of the built adventure.

## Other systems

Without an adapter: name, price and weight (data paths in the module settings), data paths and rows.
Strength and riders need a system's rules.

## API

`game.modules.get("dewarim-items").api`: `templates()`, `getTemplate(id)`, `saveTemplate(t)`,
`deleteTemplate(id)`, `generate(t, {folder, removeStale})`, `preview(t)`, `vary(itemData, rule, rng)`
(one variant for a rule `{pattern, aspects, variance}`; null when its strength changes nothing),
`presets()`, `open({folder, template})`.
