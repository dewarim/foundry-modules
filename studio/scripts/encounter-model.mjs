// The pure half of the encounter editor: token names, where tokens go, which token gets which loot.
// No Foundry globals, so `node --test` covers it (test/encounter-model.test.mjs).

/**
 * A token name from a pattern: {name} is the actor's name, {n} the running number within the row.
 * @param {string} pattern  e.g. "{name} {n}"
 * @param {{name: string, n: number}} values
 */
export function expandName(pattern, {name, n}) {
  const out = (pattern || "{name}").replaceAll("{name}", name).replaceAll("{n}", String(n)).trim();
  return out || name;
}

/**
 * Names for named creatures (each its own actor): a comma-separated list is used in order, the pattern
 * fills up the rest - "Grimtooth, Snaga" with count 3 gives Grimtooth, Snaga, Goblin 3.
 * @param {string} pattern
 * @param {number} count
 * @param {string} name   the base actor's name
 * @returns {string[]}
 */
export function namesFor(pattern, count, name) {
  const list = String(pattern ?? "").includes(",")
    ? pattern.split(",").map(s => s.trim()).filter(Boolean) : [];
  const fallback = list.length ? "{name} {n}" : pattern;
  return Array.from({length: count}, (_, i) => list[i] ?? expandName(fallback, {name, n: i + 1}));
}

/** The default pattern: numbered only when there is more than one. */
export function defaultPattern(count) {
  return count > 1 ? "{name} {n}" : "{name}";
}

/**
 * Positions along the bottom edge of the scene, left to right, wrapping upwards: a staging row the GM
 * drags from. Positions are top-left corners in pixels, grid-aligned.
 * @param {{x: number, y: number, width: number, height: number}} rect  the scene rectangle
 * @param {number} grid  grid size in pixels
 * @param {{w: number, h: number}[]} footprints  token sizes in grid units
 * @returns {{x: number, y: number}[]}
 */
export function stagingPositions(rect, grid, footprints) {
  const positions = [];
  const right = rect.x + rect.width;
  let x = rect.x;
  let bottom = rect.y + rect.height;
  let rowHeight = 0;
  for ( const {w, h} of footprints ) {
    if ( (x + (w * grid) > right) && (x > rect.x) ) {
      bottom -= rowHeight * grid;
      x = rect.x;
      rowHeight = 0;
    }
    positions.push({x, y: Math.max(rect.y, bottom - (h * grid))});
    x += w * grid;
    rowHeight = Math.max(rowHeight, h);
  }
  return positions;
}

/**
 * Positions in a square-ish block starting at a clicked point (snapped to the grid cell it is in).
 * @param {{x: number, y: number}} origin
 * @param {number} grid
 * @param {{w: number, h: number}[]} footprints
 * @returns {{x: number, y: number}[]}
 */
export function clusterPositions(origin, grid, footprints) {
  const perRow = Math.max(1, Math.ceil(Math.sqrt(footprints.length)));
  const x0 = Math.floor(origin.x / grid) * grid;
  const y0 = Math.floor(origin.y / grid) * grid;
  const positions = [];
  let x = x0;
  let y = y0;
  let rowHeight = 0;
  footprints.forEach(({w, h}, i) => {
    if ( (i > 0) && (i % perRow === 0) ) {
      y += rowHeight * grid;
      x = x0;
      rowHeight = 0;
    }
    positions.push({x, y});
    x += w * grid;
    rowHeight = Math.max(rowHeight, h);
  });
  return positions;
}

/**
 * Who gets which loot. Tokens are numbered in order: all tokens of mob row 0, then row 1 ...
 * A loot row's target is "chest", "each:<row>" (every token of that mob row) or "first:<row>".
 * @param {{count: number}[]} mobs
 * @param {{target: string}[]} loot
 * @returns {{tokens: number[][], chest: number[]}}  loot row indices per token, and for the chest
 */
export function planLoot(mobs, loot) {
  const firstToken = [];
  let total = 0;
  for ( const mob of mobs ) {
    firstToken.push(total);
    total += Math.max(0, mob.count);
  }
  const tokens = Array.from({length: total}, () => []);
  const chest = [];
  loot.forEach(({target}, index) => {
    const [kind, row] = String(target).split(":");
    const mob = Number(row);
    const count = Math.max(0, mobs[mob]?.count ?? 0);
    if ( (kind === "each") && count ) {
      for ( let t = 0; t < count; t++ ) tokens[firstToken[mob] + t].push(index);
    }
    else if ( (kind === "first") && count ) tokens[firstToken[mob]].push(index);
    else chest.push(index);     // "chest", or a row that no longer exists
  });
  return {tokens, chest};
}

/**
 * Parse the HP cell: "" -> keep the actor's, "roll" -> roll its formula, a number -> fixed.
 * @param {string} raw
 * @returns {{mode: "default"}|{mode: "roll"}|{mode: "fixed", value: number}|{error: string}}
 */
export function parseHp(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if ( !s ) return {mode: "default"};
  if ( ["roll", "würfeln", "w"].includes(s) ) return {mode: "roll"};
  const n = Number(s);
  return (Number.isInteger(n) && (n > 0)) ? {mode: "fixed", value: n} : {error: `not a hit point value: ${raw}`};
}

/**
 * The XP the creature rows are worth: count times each one's XP. Rows that do not count (friendly, no XP
 * known) add nothing.
 * @param {{count: number, xp: (number|null), counted: boolean}[]} rows
 */
export function encounterXp(rows) {
  return rows.reduce((sum, r) => sum + ((r.counted && (r.xp > 0)) ? Math.max(0, r.count) * r.xp : 0), 0);
}

/**
 * Like stagingPositions, but skipping cells already taken (by tokens placed earlier), so repeated drops
 * line up instead of piling on one spot.
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {number} grid
 * @param {{x: number, y: number, w: number, h: number}[]} occupied  in pixels / grid units
 * @param {{w: number, h: number}[]} footprints
 * @returns {{x: number, y: number}[]}
 */
export function freeStagingPositions(rect, grid, occupied, footprints) {
  const taken = new Set();
  const mark = (x, y, w, h) => {
    for ( let i = 0; i < w; i++ ) for ( let j = 0; j < h; j++ ) taken.add(`${x + (i * grid)},${y + (j * grid)}`);
  };
  const isFree = (x, y, w, h) => {
    for ( let i = 0; i < w; i++ ) for ( let j = 0; j < h; j++ ) if ( taken.has(`${x + (i * grid)},${y + (j * grid)}`) ) return false;
    return true;
  };
  for ( const o of occupied ) {
    mark(Math.floor(o.x / grid) * grid, Math.floor(o.y / grid) * grid, Math.max(1, Math.ceil(o.w)), Math.max(1, Math.ceil(o.h)));
  }
  const cols = Math.max(1, Math.floor(rect.width / grid));
  const rows = Math.max(1, Math.floor(rect.height / grid));
  const positions = [];
  for ( const {w, h} of footprints ) {
    let found = null;
    // Bottom row first, left to right, then the row above
    for ( let r = rows - h; (r >= 0) && !found; r-- ) {
      for ( let c = 0; (c + w <= cols) && !found; c++ ) {
        const x = rect.x + (c * grid);
        const y = rect.y + (r * grid);
        if ( isFree(x, y, w, h) ) found = {x, y};
      }
    }
    found ??= {x: rect.x, y: rect.y + rect.height - (h * grid)};   // full scene: stack on the corner
    mark(found.x, found.y, w, h);
    positions.push(found);
  }
  return positions;
}

/* -------------------------------------------- */
/*  Drafts                                      */
/* -------------------------------------------- */

const MOB_FIELDS = ["uuid", "name", "img", "count", "kind", "pattern", "hp", "hidden", "disposition"];
const LOOT_FIELDS = ["uuid", "name", "img", "quantity", "target"];
const KINDS = ["group", "named", "unique"];

const pick = (row, fields) => Object.fromEntries(fields.filter(f => row[f] !== undefined).map(f => [f, row[f]]));

/**
 * The editor's state as a draft to keep on the scene (flag `dewarim-studio.encounters`).
 * @param {{name: string, placement: string, chestName: string, mobs: object[], loot: object[]}} state
 * @param {string} id
 */
export function toDraft({name, placement, chestName, mobs, loot}, id) {
  return {
    id,
    name: String(name ?? "").trim(),
    placement: placement === "click" ? "click" : "staging",
    chestName: String(chestName ?? "").trim(),
    mobs: mobs.map(m => pick(m, MOB_FIELDS)),
    loot: loot.map(l => pick(l, LOOT_FIELDS))
  };
}

/**
 * A stored draft back as editor state, with defaults for anything missing or broken - drafts outlive
 * code versions. Rows without a uuid are dropped; loot aimed at a row that is gone goes to the chest.
 * @param {object} draft
 * @returns {{name: string, placement: string, chestName: string, mobs: object[], loot: object[]}}
 */
export function fromDraft(draft) {
  const mobs = (Array.isArray(draft?.mobs) ? draft.mobs : []).filter(m => typeof m?.uuid === "string").map(m => {
    const count = Math.max(0, Math.min(100, parseInt(m.count) || 0));
    return {
      uuid: m.uuid,
      name: String(m.name ?? ""),
      img: String(m.img ?? ""),
      count,
      kind: KINDS.includes(m.kind) ? m.kind : "group",
      pattern: typeof m.pattern === "string" ? m.pattern : defaultPattern(count),
      hp: String(m.hp ?? ""),
      hidden: m.hidden !== false,
      disposition: Number.isInteger(m.disposition) ? m.disposition : -1
    };
  });
  const loot = (Array.isArray(draft?.loot) ? draft.loot : []).filter(l => typeof l?.uuid === "string").map(l => {
    const [kind, row] = String(l.target ?? "chest").split(":");
    const valid = (kind === "chest") || (["each", "first"].includes(kind) && (Number(row) >= 0) && (Number(row) < mobs.length));
    return {
      uuid: l.uuid,
      name: String(l.name ?? ""),
      img: String(l.img ?? ""),
      quantity: Math.max(1, parseInt(l.quantity) || 1),
      target: valid ? String(l.target ?? "chest") : "chest"
    };
  });
  return {
    name: String(draft?.name ?? ""),
    placement: draft?.placement === "click" ? "click" : "staging",
    chestName: String(draft?.chestName ?? ""),
    mobs,
    loot
  };
}

/** The draft list with `draft` in it: replaced by id, or added; sorted by name. */
export function upsertDraft(list, draft) {
  const rest = (list ?? []).filter(d => d.id !== draft.id);
  return [...rest, draft].sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether the editor state differs from the stored draft (for the "unsaved" mark). */
export function draftChanged(state, stored) {
  if ( !stored ) return (state.mobs.length + state.loot.length) > 0;
  return JSON.stringify(toDraft(state, stored.id)) !== JSON.stringify(toDraft(fromDraft(stored), stored.id));
}

/* -------------------------------------------- */
/*  Chests                                      */
/* -------------------------------------------- */

/**
 * Items going into an actor that has some already: an item of the same name and type stacks (its
 * quantity goes up), anything else is new. Without quantities (no system support) everything is new.
 * @param {{id: string, name: string, type: string, quantity: number}[]} existing
 * @param {{name: string, type: string, quantity: number}[]} incoming
 * @param {boolean} hasQuantity
 * @returns {{updates: {id: string, quantity: number}[], create: number[]}}  create: indices into incoming
 */
export function stackItems(existing, incoming, hasQuantity) {
  const quantities = new Map(existing.map(e => [e.id, e.quantity ?? 1]));
  const create = [];
  for ( const [i, item] of incoming.entries() ) {
    const same = hasQuantity && existing.find(e => (e.name === item.name) && (e.type === item.type));
    if ( same ) quantities.set(same.id, quantities.get(same.id) + (item.quantity ?? 1));
    else create.push(i);
  }
  const updates = existing.filter(e => quantities.get(e.id) !== (e.quantity ?? 1)).map(e => ({id: e.id, quantity: quantities.get(e.id)}));
  return {updates, create};
}
