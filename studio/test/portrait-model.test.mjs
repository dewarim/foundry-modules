import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_WIDTH, PORTRAIT_PATTERN, npcPageContent, npcPageData, parsePortrait, portraitAttrs,
  portraitSrc, portraitText, shouldSeedPage} from "../scripts/portrait-model.mjs";

const A = "a".repeat(16);

/** What the enricher does with a piece of text: every match, parsed. */
function parseAll(text) {
  return [...text.matchAll(PORTRAIT_PATTERN)].map(m => parsePortrait(m.groups.config, m.groups.label));
}

test("the plain form: a UUID, and the name comes from the document", () => {
  const [config] = parseAll(`<p>@Portrait[Actor.${A}] lives here.</p>`);
  assert.equal(config.uuid, `Actor.${A}`);
  assert.equal(config.label, null);
  assert.equal(config.token, false);
  assert.equal(config.error, null);
  assert.deepEqual(portraitAttrs(config, {src: "a/b.webp", name: "Marvin"}),
    {src: "a/b.webp", class: "dewarim-portrait", title: "Marvin", width: String(DEFAULT_WIDTH)});
});

test("a label is the popout's window title, because a text page has no page name to fall back on", () => {
  const [config] = parseAll(`@Portrait[Actor.${A}]{Marvin der Wirt}`);
  assert.equal(config.label, "Marvin der Wirt");
  assert.equal(portraitAttrs(config, {src: "a/b.webp", name: "Marvin"}).title, "Marvin der Wirt");
});

test("flags and key=value, in any order, with quotes", () => {
  const [config] = parseAll(`@Portrait[token width=120 align=left uuid=Actor.${A} label="A goblin"]`);
  assert.deepEqual(config, {uuid: `Actor.${A}`, label: "A goblin", token: true, width: 120, height: null,
    align: "left", error: null});
  const attrs = portraitAttrs(config, {src: "t.webp", name: "Goblin"});
  assert.equal(attrs.width, "120");
  assert.equal(attrs.class, "dewarim-portrait dewarim-portrait-left");
  assert.equal(attrs.height, undefined);
});

test("a height alone is kept, and does not get the default width as well", () => {
  const [config] = parseAll(`@Portrait[Actor.${A} height=90]`);
  const attrs = portraitAttrs(config, {src: "a.webp", name: "N"});
  assert.equal(attrs.height, "90");
  assert.equal(attrs.width, undefined);
});

test("nonsense is ignored rather than refused: unknown keys, bad numbers, a bad alignment", () => {
  const [config] = parseAll(`@Portrait[Actor.${A} width=-5 height=wide align=sideways frobnicate=7]`);
  assert.equal(config.uuid, `Actor.${A}`);
  assert.equal(config.error, null);
  assert.equal(config.align, null);
  assert.equal(portraitAttrs(config, {src: "a.webp"}).width, String(DEFAULT_WIDTH));
});

test("no UUID: an error the enricher can say out loud", () => {
  const [config] = parseAll("@Portrait[token width=120]");
  assert.equal(config.uuid, null);
  assert.equal(config.error, "noUuid");
});

test("several in one page, and a compendium UUID", () => {
  const configs = parseAll(`@Portrait[Actor.${A}] and @Portrait[Compendium.dewarim-x.actors.Actor.${A} token]`);
  assert.equal(configs.length, 2);
  assert.equal(configs[1].uuid, `Compendium.dewarim-x.actors.Actor.${A}`);
  assert.equal(configs[1].token, true);
});

test("token asks for the token picture, and falls back to the portrait when there is none", () => {
  const actor = {img: "portrait.webp", prototypeToken: {texture: {src: "token.webp"}}};
  const item = {img: "item.webp"};
  const [plain] = parseAll(`@Portrait[Actor.${A}]`);
  const [token] = parseAll(`@Portrait[Actor.${A} token]`);
  assert.equal(portraitSrc(actor, plain), "portrait.webp");
  assert.equal(portraitSrc(actor, token), "token.webp");
  assert.equal(portraitSrc(item, token), "item.webp");
  assert.equal(portraitSrc(null, plain), null);
  assert.equal(portraitSrc({img: ""}, plain), null);
});

test("the pattern leaves other enrichers alone", () => {
  assert.equal(parseAll(`@UUID[Actor.${A}]{Marvin} @Embed[Actor.${A} statblock]`).length, 0);
});

/* -------------------------------------------- */
/*  Writing a page                              */
/* -------------------------------------------- */

test("portraitText is the other direction of the pattern: what it writes, it reads back", () => {
  const text = portraitText(`Actor.${A}`, {label: "Marvin", token: true, width: 120, align: "right"});
  const [config] = parseAll(text);
  assert.deepEqual(config, {uuid: `Actor.${A}`, label: "Marvin", token: true, width: 120, height: null,
    align: "right", error: null});
});

test("a name with no label and no options is the shortest form", () => {
  assert.equal(portraitText(`Actor.${A}`), `@Portrait[Actor.${A}]`);
});

test("the page content: picture, link, room to write - and the system's extra between them", () => {
  const actor = {uuid: `Actor.${A}`, name: "Marvin"};
  const content = npcPageContent(actor, [`@Embed[Actor.${A} statblock]`]);
  assert.equal(content,
    `<p>@Portrait[Actor.${A} right]{Marvin}</p>`
    + `<p>@UUID[Actor.${A}]{Marvin}</p>`
    + `<p>@Embed[Actor.${A} statblock]</p>`
    + "<p></p>");
  // The page is found again by the UUID in its text, so the text must carry it even without extras.
  assert.ok(npcPageContent(actor).includes(`Actor.${A}`));
});

test("the page data has no flags: the module half owns those", () => {
  const data = npcPageData({uuid: `Actor.${A}`, name: "Marvin"});
  assert.equal(data.name, "Marvin");
  assert.equal(data.type, "text");
  assert.equal(data.text.format, 1);
  assert.equal(data.flags, undefined);
});

/* -------------------------------------------- */
/*  Seeding a page with the actor               */
/* -------------------------------------------- */

const SEED = {enabled: true, isGM: true, self: true, member: true, imported: false, hasPage: false};

test("the happy case: the GM who made it, in the project, with the setting on", () => {
  assert.equal(shouldSeedPage(SEED), true);
});

test("every condition on its own is enough to say no", () => {
  const no = {enabled: false, isGM: false, self: false, member: false, imported: true, hasPage: true};
  for ( const key of Object.keys(SEED) ) {
    assert.equal(shouldSeedPage({...SEED, [key]: no[key]}), false, `${key} should have stopped it`);
  }
});

test("an import is the case this exists for: 28 actors at once, not one page", () => {
  // Nothing imported can be a project member either - the build strips the studio's flags on export -
  // so both guards say no, and the test holds even if one of them is ever loosened.
  assert.equal(shouldSeedPage({...SEED, imported: true, member: false}), false);
});

test("nothing at all is not a yes", () => {
  assert.equal(shouldSeedPage(), false);
  assert.equal(shouldSeedPage({}), false);
});
