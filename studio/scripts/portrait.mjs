// The Foundry half of the portrait enricher: resolve the UUID and build the `<img>`. The parsing and the
// attributes are in portrait-model.mjs, which has Node tests.
//
// `@Portrait[Actor.xxx]{Marvin}` in any journal page (or anywhere else Foundry enriches text) shows that
// actor's picture, read when the page is rendered. Nothing is copied into the page, so there is nothing to
// keep in step: change the actor's portrait and every page that names it shows the new one.
//
// Two things fall out of using a plain `<img>`: Foundry's journal sheet pops out every image that has no
// `.nopopout` class, so the thumbnail is click-to-enlarge without a line of our own code; and the studio's
// build walks text for UUIDs (refs.mjs), so a page that shows an actor pulls that actor into the project.
import {MODULE_ID} from "./project.mjs";
import {PORTRAIT_PATTERN, parsePortrait, portraitAttrs, portraitSrc} from "./portrait-model.mjs";

/** Said in the page where the picture would have been, rather than leaving a hole or throwing. */
function broken(message) {
  const span = document.createElement("span");
  span.classList.add("broken", "dewarim-portrait-broken");
  const icon = document.createElement("i");
  icon.classList.add("fa-solid", "fa-circle-exclamation");
  icon.inert = true;
  span.append(icon, message);
  return span;
}

/**
 * Turn one match into an element. A missing document is the normal case after a journal has been imported
 * without its actor, so it says which UUID is missing instead of failing the whole page.
 * @param {RegExpMatchArray} match
 * @param {object} [options]  enrichment options; `relativeTo` resolves relative UUIDs
 * @returns {Promise<HTMLElement>}
 */
export async function enrichPortrait(match, options = {}) {
  const config = parsePortrait(match.groups?.config, match.groups?.label);
  if ( config.error ) return broken(game.i18n.localize("DEWARIM_STUDIO.Portrait.NoUuid"));
  let doc = null;
  try {
    doc = await foundry.utils.fromUuid(config.uuid, {relative: options.relativeTo});
  }
  catch ( err ) {
    // A UUID that cannot even be parsed throws; that is the same mistake as one that resolves to nothing.
    console.debug(`${MODULE_ID} | portrait:`, err);
  }
  if ( !doc ) return broken(game.i18n.format("DEWARIM_STUDIO.Portrait.Missing", {uuid: config.uuid}));
  const src = portraitSrc(doc, config);
  if ( !src ) return broken(game.i18n.format("DEWARIM_STUDIO.Portrait.NoImage", {name: doc.name ?? config.uuid}));
  const img = document.createElement("img");
  for ( const [key, value] of Object.entries(portraitAttrs(config, {src, name: doc.name})) ) {
    img.setAttribute(key, value);
  }
  return img;
}

/** Called once at init. */
export function registerPortraitEnricher() {
  CONFIG.TextEditor.enrichers.push({
    id: `${MODULE_ID}-portrait`,
    pattern: PORTRAIT_PATTERN,
    enricher: enrichPortrait
  });
}
