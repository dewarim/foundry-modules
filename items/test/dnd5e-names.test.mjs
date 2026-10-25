import {test} from "node:test";
import assert from "node:assert/strict";
import {NAMES_DE, WORDS, decline, localName, wordKey} from "../scripts/systems/dnd5e-names.mjs";

const SRD = {lang: "de", systemItem: true};

test("every entry has a name and a gender", () => {
  for ( const [id, [name, gender, adj]] of Object.entries(NAMES_DE) ) {
    assert.ok(name && ["m", "f", "n", "pl"].includes(gender), id);
    assert.ok(adj === undefined || adj === 1, id);
  }
});

test("words are found in either language and any ending", () => {
  assert.equal(wordKey("Strong"), "strong");
  assert.equal(wordKey("stark"), "strong");
  assert.equal(wordKey("Starker"), "strong");
  assert.equal(wordKey("Gutes"), "fine");
  assert.equal(wordKey("Meisterhafte"), "masterwork");
  assert.equal(wordKey("Glowing"), null);
  assert.equal(decline("gut", "n"), "Gutes");
  assert.equal(decline("schäbig", "pl"), "Schäbige");
  for ( const w of Object.values(WORDS) ) assert.equal(w.de, w.de.toLowerCase());
});

test("German: the list's name, the words declined for its gender", () => {
  assert.equal(localName("{tier} {base}", {base: "Longsword", tier: "Gut"}, {...SRD, identifier: "longsword"}), "Gutes Langschwert");
  assert.equal(localName("{tier} {base}", {base: "Potion of Healing", tier: "Stark"}, {...SRD, identifier: "potion-of-healing"}),
    "Starker Heiltrank");
  assert.equal(localName("{tier} {base}", {base: "Battleaxe", tier: "Fine"}, {...SRD, identifier: "battleaxe"}), "Gute Streitaxt");
  assert.equal(localName("{tier} {base}", {base: "Arrows", tier: "Shoddy"}, {...SRD, identifier: "arrows"}), "Schäbige Pfeile");
  assert.equal(localName("{~wild} {base} ({percent})", {base: "Potion of Healing", percent: "+64%"}, {...SRD, identifier: "potion-of-healing"}),
    "Wilder Heiltrank (+64%)");
  assert.equal(localName("{base} ({percent})", {base: "Potion of Healing", percent: "+14%"}, {...SRD, identifier: "potion-of-healing"}),
    "Heiltrank (+14%)");
});

test("an adjective at the start of the base drops to lower case behind a word", () => {
  assert.equal(localName("{tier} {base}", {base: "Light Crossbow", tier: "Fine"}, {...SRD, identifier: "light-crossbow"}),
    "Gute leichte Armbrust");
  assert.equal(localName("{base} ({percent})", {base: "Light Crossbow", percent: "+5%"}, {...SRD, identifier: "light-crossbow"}),
    "Leichte Armbrust (+5%)");
});

test("never half one language: English words for an English base, and in an English world", () => {
  assert.equal(localName("{tier} {base}", {base: "Flame Tongue", tier: "Gut"}, {...SRD, identifier: "flame-tongue"}), "Fine Flame Tongue");
  assert.equal(localName("{~wild} {base}", {base: "Potion of Healing"}, {lang: "en", systemItem: true, identifier: "potion-of-healing"}),
    "Wild Potion of Healing");
  assert.equal(localName("{tier} {base}", {base: "Longsword", tier: "Meisterhaft"}, {lang: "en", systemItem: true, identifier: "longsword"}),
    "Masterwork Longsword");
});

test("own German items: by name from the list, else the words behind the name", () => {
  assert.equal(localName("{tier} {base}", {base: "Heiltrank", tier: "Stark"}, {lang: "de", systemItem: false, identifier: ""}),
    "Starker Heiltrank");
  assert.equal(localName("{tier} {base}", {base: "Wurzelsud", tier: "Stark"}, {lang: "de", systemItem: false, identifier: ""}),
    "Wurzelsud (stark)");
  assert.equal(localName("{name}", {base: "Dagger", name: "Fleischermesser"}, {...SRD, identifier: "dagger"}), "Fleischermesser");
});

test("Normal is the plain item, Failed a word like the others", () => {
  assert.equal(wordKey("Normal"), "normal");
  assert.equal(wordKey("Fehlerhafter"), "failed");
  assert.equal(localName("{tier} {base}", {base: "Longsword", tier: "Normal"}, {...SRD, identifier: "longsword"}), "Langschwert");
  assert.equal(localName("{tier} {base}", {base: "Light Crossbow", tier: "Normal"}, {...SRD, identifier: "light-crossbow"}),
    "Leichte Armbrust");
  assert.equal(localName("{tier} {base}", {base: "Potion of Healing", tier: "Fehlerhaft"}, {...SRD, identifier: "potion-of-healing"}),
    "Fehlerhafter Heiltrank");
  assert.equal(localName("{tier} {base}", {base: "Potion of Healing", tier: "Normal"}, {lang: "en", systemItem: true, identifier: ""}),
    "Potion of Healing");
  assert.equal(localName("{tier} {base}", {base: "Potion of Healing", tier: "Failed"}, {lang: "en", systemItem: true, identifier: ""}),
    "Failed Potion of Healing");
  assert.equal(localName("{tier} {base}", {base: "Wurzelsud", tier: "Normal"}, {lang: "de", systemItem: false, identifier: ""}), "Wurzelsud");
});
