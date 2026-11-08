// The pure half of the portrait enricher: reading `@Portrait[...]` out of journal text and turning it into
// the attributes of an `<img>`. No Foundry globals, so `node --test` covers it (test/portrait-model.test.mjs).
// The Foundry half, which resolves the UUID and builds the element, is portrait.mjs.
//
// The point of the whole thing is that nothing is stored: the page holds a reference, the picture is read
// from the document every time the page is rendered. So changing an NPC's portrait changes every page that
// shows it, with no hook, no update and nothing that can fall out of step.

/** `@Portrait[Actor.xxx width=120 token]{Marvin}` - the config is read like core's `@Embed[...]`. */
export const PORTRAIT_PATTERN = /@Portrait\[(?<config>[^\]]+)](?:\{(?<label>[^}]+)})?/g;

/** Wide enough to recognise a face, small enough to read the text around it. Overridden with `width=`. */
export const DEFAULT_WIDTH = 200;

/** Where the picture may sit: with the text, or floated out of it. */
const ALIGNMENTS = ["left", "right", "center"];

/**
 * What a `@Portrait[...]` asks for.
 * @typedef {object} PortraitConfig
 * @property {string|null} uuid       the document to read the picture from
 * @property {string|null} label      `{...}`: the popout's window title, instead of the document's name
 * @property {boolean} token          the prototype token's picture instead of the portrait
 * @property {number|null} width      in pixels; `DEFAULT_WIDTH` when neither width nor height is given
 * @property {number|null} height     in pixels
 * @property {string|null} align      "left", "right" or "center"
 * @property {string|null} error      why this cannot be rendered, instead of a config
 */

/**
 * Read the text between the brackets. Bare words are flags (`token`), `key=value` sets a value, and the
 * first bare word that is not a known flag is the UUID - so `@Portrait[Actor.xxx]` needs no `uuid=`.
 * @param {string} raw        the config, without the brackets
 * @param {string} [label]    the `{...}` part, if there was one
 * @returns {PortraitConfig}
 */
export function parsePortrait(raw, label = null) {
  const config = {uuid: null, label: label?.trim() || null, token: false, width: null, height: null,
    align: null, error: null};
  for ( const part of String(raw ?? "").match(/(?:[^\s"]+|"[^"]*")+/g) ?? [] ) {
    const [key, ...rest] = part.split("=");
    const value = rest.length ? rest.join("=").replace(/(^"|"$)/g, "") : null;
    if ( value === null ) {
      if ( key === "token" ) config.token = true;
      else if ( ALIGNMENTS.includes(key) ) config.align = key;
      else config.uuid ??= key.replace(/(^"|"$)/g, "");
      continue;
    }
    switch ( key ) {
      case "uuid": config.uuid = value; break;
      case "label": config.label = value; break;
      case "token": config.token = value.toLowerCase() !== "false"; break;
      case "align": config.align = ALIGNMENTS.includes(value) ? value : null; break;
      case "width": case "height": {
        const size = Number(value);
        if ( Number.isFinite(size) && (size > 0) ) config[key] = Math.round(size);
        break;
      }
      // An unknown key is not worth refusing the picture over - say nothing and show the portrait.
    }
  }
  if ( !config.uuid ) config.error = "noUuid";
  return config;
}

/**
 * The attributes of the `<img>` to put in the page. `title` is not decoration: a text page has no page name
 * to fall back on, so Foundry's image popout takes its window title from exactly this attribute
 * (JournalEntrySheet#_onClickImage). Width and height stay attributes rather than a style, because that is
 * what the journal editor keeps when the GM edits the page around them.
 * @param {PortraitConfig} config  what the text asked for
 * @param {object} doc             the resolved document: its `src` and `name`
 * @returns {Record<string, string>}
 */
export function portraitAttrs(config, {src, name} = {}) {
  const attrs = {src, class: ["dewarim-portrait", config.align ? `dewarim-portrait-${config.align}` : null]
    .filter(Boolean).join(" ")};
  const title = config.label ?? name;
  if ( title ) attrs.title = title;
  if ( config.width ) attrs.width = String(config.width);
  if ( config.height ) attrs.height = String(config.height);
  if ( !config.width && !config.height ) attrs.width = String(DEFAULT_WIDTH);
  return attrs;
}

/**
 * Which picture of the document to show. A document without a prototype token (an Item, a page) has no token
 * picture, so `token` falls back to the portrait rather than showing nothing.
 * @param {object} doc         the resolved document
 * @param {PortraitConfig} config
 * @returns {string|null}
 */
export function portraitSrc(doc, config) {
  if ( !doc ) return null;
  const token = doc.prototypeToken?.texture?.src || null;
  const img = doc.img || doc.src || null;
  return (config.token ? (token ?? img) : img) || null;
}

/* -------------------------------------------- */
/*  Writing a page                              */
/* -------------------------------------------- */

/** The text that shows a document's picture: the other direction of PORTRAIT_PATTERN. */
export function portraitText(uuid, {label = null, token = false, width = null, align = null} = {}) {
  const config = [uuid, token ? "token" : null, align, width ? `width=${width}` : null].filter(Boolean).join(" ");
  return `@Portrait[${config}]${label ? `{${label}}` : ""}`;
}

/**
 * The first content of a journal page about an actor: the picture, a link to the sheet, and room to write.
 * Everything in it is ordinary text - the page is seeded, not owned, so the GM may move the portrait, drop
 * the link or rewrite the lot, and nothing here will put it back.
 * @param {object} actor            `uuid` and `name`
 * @param {string[]} [extra]        further paragraphs from the system adapter (dnd5e: the statblock embed)
 * @returns {string}  HTML
 */
export function npcPageContent({uuid, name}, extra = []) {
  return [
    `<p>${portraitText(uuid, {label: name, align: "right"})}</p>`,
    `<p>@UUID[${uuid}]{${name}}</p>`,
    ...extra.map(line => `<p>${line}</p>`),
    "<p></p>"
  ].join("");
}

/**
 * The page to create for an actor. Without flags: the caller owns those, because the flag scope is the
 * module's and this half knows nothing about modules.
 * @returns {{name: string, type: string, text: {content: string, format: number}}}
 */
export function npcPageData(actor, extra = []) {
  return {name: actor.name, type: "text", text: {content: npcPageContent(actor, extra), format: 1}};
}

/**
 * Whether a newly created actor should get a page without being asked. Every condition here is a trap
 * walked into by someone before: a compendium or adventure import creates actors in bulk and would spawn
 * a page for each (`imported`, and membership, which an import cannot have - the build strips the studio's
 * flags, so nothing imported belongs to a project until a GM says so); the hook runs on every connected
 * client, so without `self` four players make four pages; and a page that exists is never made twice.
 * @param {object} context
 * @param {boolean} context.enabled   the setting is on
 * @param {boolean} context.isGM      this client may create documents
 * @param {boolean} context.self      this client is the one that created the actor
 * @param {boolean} context.member    the actor belongs to the active project
 * @param {boolean} context.imported  the creation carried ids with it, as an import does
 * @param {boolean} context.hasPage   a page for this actor is there already
 * @returns {boolean}
 */
export function shouldSeedPage({enabled, isGM, self, member, imported, hasPage} = {}) {
  return !!enabled && !!isGM && !!self && !!member && !imported && !hasPage;
}

