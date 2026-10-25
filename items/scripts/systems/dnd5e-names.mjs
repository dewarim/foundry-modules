// Names of generated items in one language. dnd5e's own compendiums name their items in English, so a
// German tier word in front of them read "Guter Longsword". This list carries German names for the SRD's
// mundane items and potions (by `system.identifier`, with grammatical gender, and whether the name starts
// with an adjective), and the tier words as adjectives declined to match: "Gutes Langschwert", "Gute
// leichte Armbrust", "Starker Heiltrank". A base without an entry keeps English words, so a name is never
// half one language and half the other. The names are this module's own wording, not a book's.
// No Foundry globals - covered by test/dnd5e-names.test.mjs.
import {itemName} from "../variant-model.mjs";

/** Tier and pattern words: English, and the German adjective stem. "Normal" is the plain item: no word. */
export const WORDS = {
  normal: {en: "", de: ""},
  failed: {en: "Failed", de: "fehlerhaft"},
  shoddy: {en: "Shoddy", de: "schäbig"},
  fine: {en: "Fine", de: "gut"},
  masterwork: {en: "Masterwork", de: "meisterhaft"},
  strong: {en: "Strong", de: "stark"},
  potent: {en: "Potent", de: "kräftig"},
  mighty: {en: "Mighty", de: "mächtig"},
  wild: {en: "Wild", de: "wild"},
  rusty: {en: "Rusty", de: "rostig"},
  crude: {en: "Crude", de: "grob"},
  superior: {en: "Superior", de: "erlesen"}
};

/** Endings of an adjective without article (strong declension), nominative. */
const ENDINGS = {m: "er", f: "e", n: "es", pl: "e"};

/** identifier -> [German name, gender (m, f, n, pl), 1 if the name starts with an adjective] */
export const NAMES_DE = {
  // Weapons
  "battleaxe": ["Streitaxt", "f"], "flail": ["Flegel", "m"], "glaive": ["Glefe", "f"], "greataxe": ["Zweihandaxt", "f"],
  "greatsword": ["Zweihandschwert", "n"], "halberd": ["Hellebarde", "f"], "lance": ["Lanze", "f"],
  "longsword": ["Langschwert", "n"], "maul": ["Zweihandhammer", "m"], "morningstar": ["Morgenstern", "m"],
  "pike": ["Pike", "f"], "rapier": ["Rapier", "n"], "scimitar": ["Krummsäbel", "m"], "shortsword": ["Kurzschwert", "n"],
  "trident": ["Dreizack", "m"], "warhammer": ["Kriegshammer", "m"], "war-pick": ["Kriegspicke", "f"],
  "whip": ["Peitsche", "f"], "blowgun": ["Blasrohr", "n"], "hand-crossbow": ["Handarmbrust", "f"],
  "heavy-crossbow": ["Schwere Armbrust", "f", 1], "longbow": ["Langbogen", "m"], "musket": ["Muskete", "f"],
  "pistol": ["Pistole", "f"], "club": ["Knüppel", "m"], "dagger": ["Dolch", "m"], "greatclub": ["Zweihandknüppel", "m"],
  "handaxe": ["Handaxt", "f"], "javelin": ["Wurfspeer", "m"], "light-hammer": ["Leichter Hammer", "m", 1],
  "mace": ["Streitkolben", "m"], "quarterstaff": ["Kampfstab", "m"], "sickle": ["Sichel", "f"], "spear": ["Speer", "m"],
  "staff": ["Stab", "m"], "wooden-staff": ["Holzstab", "m"], "dart": ["Wurfpfeil", "m"],
  "light-crossbow": ["Leichte Armbrust", "f", 1], "shortbow": ["Kurzbogen", "m"], "sling": ["Schleuder", "f"],
  // Armor
  "chain-mail": ["Kettenpanzer", "m"], "plate-armor": ["Plattenpanzer", "m"], "ring-mail": ["Ringpanzer", "m"],
  "splint-armor": ["Schienenpanzer", "m"], "leather-armor": ["Lederrüstung", "f"],
  "padded-armor": ["Gepolsterte Rüstung", "f", 1], "studded-leather-armor": ["Beschlagene Lederrüstung", "f", 1],
  "breastplate": ["Brustplatte", "f"], "chain-shirt": ["Kettenhemd", "n"], "half-plate-armor": ["Halbplattenpanzer", "m"],
  "hide-armor": ["Fellrüstung", "f"], "scale-mail": ["Schuppenpanzer", "m"], "shield": ["Schild", "m"],
  // Ammunition
  "arrow": ["Pfeil", "m"], "arrows": ["Pfeile", "pl"], "blowgun-needle": ["Blasrohrnadel", "f"],
  "needles": ["Blasrohrnadeln", "pl"], "bolts": ["Bolzen", "pl"], "crossbow-bolt": ["Armbrustbolzen", "m"],
  "bullets-sling": ["Schleuderkugeln", "pl"], "sling-bullet": ["Schleuderkugel", "f"], "bullets-firearm": ["Kugeln", "pl"],
  // Food and drink
  "rations": ["Rationen", "pl"], "feed": ["Futter", "n"], "waterskin": ["Wasserschlauch", "m"],
  // Poisons and alchemy
  "antitoxin": ["Gegengift", "n"], "basic-poison": ["Einfaches Gift", "n", 1], "poison-basic": ["Einfaches Gift", "n", 1],
  "assassins-blood": ["Assassinenblut", "n"], "serpent-venom": ["Schlangengift", "n"], "wyvern-poison": ["Wyverngift", "n"],
  "purple-worm-poison": ["Purpurwurmgift", "n"], "truth-serum": ["Wahrheitsserum", "n"],
  "midnight-tears": ["Mitternachtstränen", "pl"], "acid": ["Säure", "f"], "acid-vial": ["Säurephiole", "f"],
  "alchemists-fire": ["Alchemistenfeuer", "n"], "holy-water": ["Weihwasser", "n"], "flask-of-holy-water": ["Weihwasserflasche", "f"],
  "oil": ["Öl", "n"], "oil-flask": ["Ölflasche", "f"],
  // Potions and oils
  "potion-of-healing": ["Heiltrank", "m"],
  "greater-potion-of-healing": ["Großer Heiltrank", "m", 1], "potion-of-greater-healing": ["Großer Heiltrank", "m", 1],
  "superior-potion-of-healing": ["Überlegener Heiltrank", "m", 1], "potion-of-superior-healing": ["Überlegener Heiltrank", "m", 1],
  "supreme-potion-of-healing": ["Höchster Heiltrank", "m", 1], "potion-of-supreme-healing": ["Höchster Heiltrank", "m", 1],
  "elixir-of-health": ["Elixier der Gesundheit", "n"], "potion-of-poison": ["Gifttrank", "m"],
  "potion-of-resistance": ["Trank der Resistenz", "m"], "potion-of-acid-resistance": ["Trank der Säureresistenz", "m"],
  "potion-of-cold-resistance": ["Trank der Kälteresistenz", "m"], "potion-of-fire-resistance": ["Trank der Feuerresistenz", "m"],
  "potion-of-force-resistance": ["Trank der Energieresistenz", "m"],
  "potion-of-lightning-resistance": ["Trank der Blitzresistenz", "m"],
  "potion-of-poison-resistance": ["Trank der Giftresistenz", "m"],
  "potion-of-thunder-resistance": ["Trank der Donnerresistenz", "m"],
  "potion-of-animal-friendship": ["Trank der Tierfreundschaft", "m"], "potion-of-clairvoyance": ["Trank des Hellsehens", "m"],
  "potion-of-climbing": ["Trank des Kletterns", "m"], "potion-of-diminution": ["Trank der Verkleinerung", "m"],
  "potion-of-flying": ["Trank des Fliegens", "m"], "potion-of-gaseous-form": ["Trank der Gasgestalt", "m"],
  "potion-of-growth": ["Trank des Wachstums", "m"], "potion-of-heroism": ["Trank des Heldenmuts", "m"],
  "potion-of-invisibility": ["Trank der Unsichtbarkeit", "m"], "potion-of-invulnerability": ["Trank der Unverwundbarkeit", "m"],
  "potion-of-longevity": ["Trank der Langlebigkeit", "m"], "potion-of-mind-reading": ["Trank des Gedankenlesens", "m"],
  "potion-of-speed": ["Trank der Schnelligkeit", "m"], "potion-of-vitality": ["Trank der Lebenskraft", "m"],
  "potion-of-water-breathing": ["Trank der Wasseratmung", "m"], "potion-of-giant-strength": ["Trank der Riesenstärke", "m"],
  "potion-of-hill-giant-strength": ["Trank der Hügelriesenstärke", "m"],
  "potion-of-stone-giant-strength": ["Trank der Steinriesenstärke", "m"],
  "potion-of-frost-giant-strength": ["Trank der Frostriesenstärke", "m"],
  "potion-of-fire-giant-strength": ["Trank der Feuerriesenstärke", "m"],
  "potion-of-cloud-giant-strength": ["Trank der Wolkenriesenstärke", "m"],
  "potion-of-storm-giant-strength": ["Trank der Sturmriesenstärke", "m"],
  "hill-potion-of-giant-strength": ["Trank der Hügelriesenstärke", "m"],
  "stone-potion-of-giant-strength": ["Trank der Steinriesenstärke", "m"],
  "frost-potion-of-giant-strength": ["Trank der Frostriesenstärke", "m"],
  "fire-potion-of-giant-strength": ["Trank der Feuerriesenstärke", "m"],
  "cloud-potion-of-giant-strength": ["Trank der Wolkenriesenstärke", "m"],
  "storm-potion-of-giant-strength": ["Trank der Sturmriesenstärke", "m"],
  "oil-of-etherealness": ["Öl der Körperlosigkeit", "n"], "oil-of-sharpness": ["Öl der Schärfe", "n"],
  "oil-of-slipperiness": ["Öl der Glätte", "n"], "philter-of-love": ["Liebestrank", "m"],
  "spell-scroll": ["Zauberschriftrolle", "f"], "sup-basic-scroll": ["Schriftrolle", "f"],
  // Adventuring gear
  "candle": ["Kerze", "f"], "torch": ["Fackel", "f"], "lamp": ["Lampe", "f"],
  "bullseye-lantern": ["Blendlaterne", "f"], "lantern-bullseye": ["Blendlaterne", "f"],
  "hooded-lantern": ["Abblendbare Laterne", "f", 1], "lantern-hooded": ["Abblendbare Laterne", "f", 1],
  "caltrops": ["Krähenfüße", "pl"], "ball-bearings": ["Stahlkugeln", "pl"], "chain": ["Kette", "f"],
  "climbers-kit": ["Kletterausrüstung", "f"], "healers-kit": ["Heilertasche", "f"], "rope": ["Seil", "n"],
  "hempen-rope-50-ft": ["Hanfseil", "n"], "silk-rope-50-ft": ["Seidenseil", "n"], "hunting-trap": ["Jagdfalle", "f"],
  "ink": ["Tinte", "f"], "iron-spike": ["Eisendorn", "m"], "spikes-iron": ["Eisendornen", "pl"], "key": ["Schlüssel", "m"],
  "lock": ["Schloss", "n"], "manacles": ["Handschellen", "pl"], "piton": ["Kletterhaken", "m"],
  "portable-ram": ["Tragbarer Rammbock", "m", 1], "ram-portable": ["Tragbarer Rammbock", "m", 1], "gem": ["Edelstein", "m"],
  "block-and-tackle": ["Flaschenzug", "m"], "grappling-hook": ["Wurfhaken", "m"], "ink-pen": ["Schreibfeder", "f"],
  "net": ["Netz", "n"], "signal-whistle": ["Signalpfeife", "f"], "tinderbox": ["Zunderkästchen", "n"],
  "amulet": ["Amulett", "n"], "bell": ["Glocke", "f"], "crystal": ["Kristall", "m"], "emblem": ["Emblem", "n"],
  "orb": ["Kugel", "f"], "reliquary": ["Reliquiar", "n"], "totem": ["Totem", "n"], "wand": ["Zauberstab", "m"],
  "yew-wand": ["Eibenstab", "m"], "rod": ["Stab", "m"], "sprig-of-mistletoe": ["Mistelzweig", "m"],
  "abacus": ["Abakus", "m"], "bedroll": ["Schlafsack", "m"], "blanket": ["Decke", "f"], "book": ["Buch", "n"],
  "censer": ["Weihrauchgefäß", "n"], "chalk": ["Kreide", "f"], "crowbar": ["Brecheisen", "n"],
  "fishing-tackle": ["Angelzeug", "n"], "ladder": ["Leiter", "f"], "ladder-10-foot": ["Leiter", "f"],
  "magnifying-glass": ["Vergrößerungsglas", "n"], "map": ["Karte", "f"], "mirror": ["Spiegel", "m"],
  "steel-mirror": ["Stahlspiegel", "m"], "paper": ["Papier", "n"], "parchment": ["Pergament", "n"],
  "perfume": ["Parfüm", "n"], "pole": ["Stange", "f"], "shovel": ["Schaufel", "f"], "spyglass": ["Fernrohr", "n"],
  "string": ["Schnur", "f"], "string-10-ft": ["Schnur", "f"], "tent": ["Zelt", "n"], "two-person-tent": ["Zweipersonenzelt", "n"],
  "hammer": ["Hammer", "m"], "hourglass": ["Sanduhr", "f"], "ink-bottle": ["Tintenfass", "n"],
  "merchants-scale": ["Händlerwaage", "f"], "mess-kit": ["Essgeschirr", "n"], "miners-pick": ["Spitzhacke", "f"],
  "prayer-book": ["Gebetbuch", "n"], "sealing-wax": ["Siegelwachs", "n"], "signet-ring": ["Siegelring", "m"],
  "sledgehammer": ["Vorschlaghammer", "m"], "small-knife": ["Kleines Messer", "n", 1], "soap": ["Seife", "f"],
  "spellbook": ["Zauberbuch", "n"], "whetstone": ["Wetzstein", "m"], "block-of-incense": ["Weihrauchblock", "m"],
  "stick-of-incense": ["Räucherstäbchen", "n"], "bag-of-sand": ["Sandsack", "m"], "trinket": ["Tand", "m"],
  "holy-symbol-varies": ["Heiliges Symbol", "n", 1], "arcane-focus-varies": ["Arkaner Fokus", "m", 1],
  "druidic-focus-varies": ["Druidenfokus", "m"],
  // Containers and packs
  "backpack": ["Rucksack", "m"], "barrel": ["Fass", "n"], "basket": ["Korb", "m"], "bottle-glass": ["Glasflasche", "f"],
  "glass-bottle": ["Glasflasche", "f"], "bucket": ["Eimer", "m"], "chest": ["Truhe", "f"],
  "component-pouch": ["Komponentenbeutel", "m"], "flask": ["Flasche", "f"], "iron-pot": ["Eisentopf", "m"],
  "pot-iron": ["Eisentopf", "m"], "jug": ["Krug", "m"], "map-case": ["Kartenköcher", "m"],
  "case-map-or-scroll": ["Kartenköcher", "m"], "map-or-scroll-case": ["Kartenköcher", "m"],
  "scroll-case": ["Schriftrollenköcher", "m"], "pitcher": ["Kanne", "f"], "pouch": ["Beutel", "m"], "quiver": ["Köcher", "m"],
  "sack": ["Sack", "m"], "saddlebags": ["Satteltaschen", "pl"], "tankard": ["Humpen", "m"], "vial": ["Phiole", "f"],
  "crossbow-bolt-case": ["Bolzenköcher", "m"], "case-crossbow-bolt": ["Bolzenköcher", "m"],
  "burglars-pack": ["Einbrecherausrüstung", "f"], "diplomats-pack": ["Diplomatenausrüstung", "f"],
  "dungeoneers-pack": ["Gewölbeausrüstung", "f"], "entertainers-pack": ["Gauklerausrüstung", "f"],
  "explorers-pack": ["Entdeckerausrüstung", "f"], "priests-pack": ["Priesterausrüstung", "f"],
  "scholars-pack": ["Gelehrtenausrüstung", "f"],
  // Clothing and tack
  "clothes-fine": ["Edle Kleidung", "f", 1], "fine-clothes": ["Edle Kleidung", "f", 1],
  "clothes-travelers": ["Reisekleidung", "f"], "travelers-clothes": ["Reisekleidung", "f"],
  "common-clothes": ["Gewöhnliche Kleidung", "f", 1], "costume": ["Kostüm", "n"], "costume-clothes": ["Kostüm", "n"],
  "robe": ["Robe", "f"], "robes": ["Roben", "pl"], "vestments": ["Gewänder", "pl"], "riding-saddle": ["Reitsattel", "m"],
  "military-saddle": ["Kriegssattel", "m"], "pack-saddle": ["Packsattel", "m"], "exotic-saddle": ["Exotischer Sattel", "m", 1],
  "bit-and-bridle": ["Zaumzeug", "n"],
  // Tools, games and instruments
  "alchemists-supplies": ["Alchemistenausrüstung", "f"], "brewers-supplies": ["Brauerausrüstung", "f"],
  "calligraphers-supplies": ["Kalligrafenausrüstung", "f"], "carpenters-tools": ["Zimmermannswerkzeug", "n"],
  "cartographers-tools": ["Kartografenwerkzeug", "n"], "cobblers-tools": ["Schusterwerkzeug", "n"],
  "cooks-utensils": ["Kochutensilien", "pl"], "glassblowers-tools": ["Glasbläserwerkzeug", "n"],
  "jewelers-tools": ["Juwelierwerkzeug", "n"], "leatherworkers-tools": ["Lederarbeiterwerkzeug", "n"],
  "masons-tools": ["Steinmetzwerkzeug", "n"], "painters-supplies": ["Malerausrüstung", "f"],
  "potters-tools": ["Töpferwerkzeug", "n"], "smiths-tools": ["Schmiedewerkzeug", "n"], "tinkers-tools": ["Tüftlerwerkzeug", "n"],
  "weavers-tools": ["Weberwerkzeug", "n"], "woodcarvers-tools": ["Holzschnitzerwerkzeug", "n"],
  "disguise-kit": ["Verkleidungsausrüstung", "f"], "forgery-kit": ["Fälscherausrüstung", "f"],
  "herbalism-kit": ["Kräuterkundeausrüstung", "f"], "navigators-tools": ["Navigationswerkzeug", "n"],
  "poisoners-kit": ["Giftmischerausrüstung", "f"], "thieves-tools": ["Diebeswerkzeug", "n"],
  "chess-set": ["Schachspiel", "n"], "dice": ["Würfelspiel", "n"], "dice-set": ["Würfelspiel", "n"],
  "playing-cards": ["Spielkarten", "pl"], "playing-cards-set": ["Spielkarten", "pl"], "bagpipes": ["Dudelsack", "m"],
  "drum": ["Trommel", "f"], "dulcimer": ["Hackbrett", "n"], "flute": ["Flöte", "f"], "horn": ["Horn", "n"],
  "lute": ["Laute", "f"], "lyre": ["Leier", "f"], "pan-flute": ["Panflöte", "f"], "shawm": ["Schalmei", "f"], "viol": ["Gambe", "f"]
};

const BY_GERMAN_NAME = new Map(Object.values(NAMES_DE).map(e => [e[0].toLowerCase(), e]));

const capitalize = s => (s ? s[0].toLocaleUpperCase("de") + s.slice(1) : s);

/** The key of a known word, in either language and any German ending ("Starker", "stark", "Strong"). */
export function wordKey(text) {
  const t = String(text ?? "").trim().toLocaleLowerCase("de");
  if ( !t ) return null;
  if ( ["normal", "normale", "normaler", "normales"].includes(t) ) return "normal";
  for ( const [key, w] of Object.entries(WORDS) ) {
    if ( !w.de ) continue;
    if ( (t === w.en.toLowerCase()) || (t === w.de) || ["er", "e", "es", "en", "em"].some(e => t === w.de + e) ) return key;
  }
  return null;
}

/** A German adjective before a noun of that gender, without article: "gut", "n" -> "Gutes". */
export const decline = (stem, gender) => (stem ? capitalize(stem + (ENDINGS[gender] ?? "")) : "");

/**
 * The German base of an item: from the list by identifier when the item comes from dnd5e's own compendiums
 * (so it is named in English), else by its name when it already has a German name from the list.
 * @returns {{name: string, gender: string, adjective: boolean}|null}
 */
export function germanBase({identifier, name, systemItem}) {
  const entry = (systemItem && NAMES_DE[identifier]) || BY_GERMAN_NAME.get(String(name ?? "").toLowerCase());
  return entry ? {name: entry[0], gender: entry[1], adjective: !!entry[2]} : null;
}

/**
 * The name of a generated item, all in one language.
 * - English (any other game language, or a dnd5e compendium item without a German name): known words in
 *   English, the base as it is.
 * - German: the base's German name, known words declined for its gender ("Gutes Langschwert"); an adjective
 *   at the start of the base drops to lower case behind a word ("Gute leichte Armbrust"). A base whose
 *   gender is not known (an own item) gets its words behind it: "Wurzelsud (stark)".
 * `{~word}` in a pattern is such a word; a tier is one too.
 * @param {string} pattern
 * @param {{base: string, tier: string, percent: string, name: string}} parts
 * @param {{lang: string, identifier: string, systemItem: boolean}} item
 */
export function localName(pattern, parts, {lang, identifier, systemItem}) {
  const german = lang === "de" ? germanBase({identifier, name: parts.base, systemItem}) : null;
  const englishBase = systemItem && !german;
  if ( (lang !== "de") || englishBase ) {
    const word = w => WORDS[wordKey(w)]?.en ?? w;  // "Normal" -> "": the plain name
    return itemName(pattern, {...parts, tier: parts.tier ? word(parts.tier) : ""}, word);
  }
  const stemOf = w => WORDS[wordKey(w)]?.de ?? String(w).trim().toLocaleLowerCase("de");
  if ( !german ) {
    // Gender unknown: the words go behind the name
    const stems = [];
    const collect = w => {
      if ( stemOf(w) ) stems.push(stemOf(w));
      return "";
    };
    const name = itemName(pattern, {...parts, tier: parts.tier ? collect(parts.tier) : ""}, collect);
    return stems.length ? `${name} (${stems.join(", ")})` : name;
  }
  const word = w => decline(stemOf(w), german.gender);
  const before = /\{(tier|~[^}]+)\}[^{]*\{base\}/.test(pattern) && (!!word(parts.tier ?? "") || pattern.includes("{~"));
  const base = german.adjective && before ? german.name[0].toLocaleLowerCase("de") + german.name.slice(1) : german.name;
  return itemName(pattern, {...parts, base, tier: parts.tier ? word(parts.tier) : ""}, word);
}
