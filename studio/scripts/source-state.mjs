// What a source panel remembers between sessions: the picks (document type, scope, subtype), not the
// typing. The filter field starts empty like the commander's columns do - a condition left over from
// yesterday would hide most of the list while looking like an empty panel.
// No Foundry globals, so `node --test` covers it (test/source-state.test.mjs).

/** The part of a panel's state that is stored. */
export function storedState(state) {
  return {type: state.type, scope: state.scope, subtype: state.subtype ?? ""};
}

/** True when a change touches something stored - a filter keystroke must not write a setting. */
export function statePersisted(change) {
  return ["type", "scope", "subtype"].some(key => key in change);
}

/**
 * The state a panel opens with: what was stored, as far as it still exists. A stored type the panel no
 * longer offers, a subtype the system dropped or a scope whose compendium is gone all fall back.
 * @param {object} options
 * @param {string[]} options.types                  document names the panel offers
 * @param {object} [options.saved]                  what was stored for this panel
 * @param {(type: string, scope: string) => string} options.validScope  a scope that still works
 * @param {(type: string) => string[]} options.subtypesOf               the type's subtypes
 * @returns {{type: string, scope: string, subtype: string, filter: string}}
 */
export function restoredState({types, saved = {}, validScope, subtypesOf}) {
  const type = types.includes(saved?.type) ? saved.type : types[0];
  const subtype = subtypesOf(type).includes(saved?.subtype) ? saved.subtype : "";
  return {type, scope: validScope(type, saved?.scope), subtype, filter: ""};
}
