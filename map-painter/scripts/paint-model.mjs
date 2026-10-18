// The pure half of the texture brush: which cells hold which texture, what a stroke changes, how the
// painted cells of a chunk become rectangles to fill. No Foundry globals: test/paint-model.test.mjs.
//
// State (kept in a scene flag): {textures: [{src, repeat, blocks?}], cells: {"col,row": textureIndex}}. A
// texture entry is the image, how many grid cells one repeat of it covers, and whether it blocks view
// (walls along the outline of its cells); the same image painted at two scales is two entries. The baked
// chunk images and the walls are derived from this and can always be rebuilt.

/** Cells per chunk side: one baked image (and one tile) per chunk. */
export const CHUNK = 16;

export function cellKey({col, row}) {
  return `${col},${row}`;
}

export function parseKey(key) {
  const [col, row] = key.split(",").map(Number);
  return {col, row};
}

/** An empty paint state, or a copy of one from a flag (repaired: unknown texture indices dropped). */
export function readState(data) {
  const textures = Array.isArray(data?.textures)
    ? data.textures.filter(t => typeof t?.src === "string").map(t => entry(t))
    : [];
  const cells = {};
  for ( const [key, index] of Object.entries(data?.cells ?? {}) ) {
    if ( Number.isInteger(index) && textures[index] && /^-?\d+,-?\d+$/.test(key) ) cells[key] = index;
  }
  return {textures, cells};
}

/** A texture entry as stored: `blocks` only when set, so older states compare equal. */
function entry({src, repeat, blocks}) {
  const out = {src, repeat: Math.max(1, Number(repeat) || 1)};
  if ( blocks ) out.blocks = true;
  return out;
}

const sameEntry = (a, b) => (a.src === b.src) && (a.repeat === b.repeat) && (!!a.blocks === !!b.blocks);

/** The square brush: `size` cells on a side around a center cell (an even size leans up-left). */
export function brushCells(center, size) {
  const shift = Math.floor((size - 1) / 2);
  const cells = [];
  for ( let r = 0; r < size; r++ ) {
    for ( let c = 0; c < size; c++ ) cells.push({col: center.col - shift + c, row: center.row - shift + r});
  }
  return cells;
}

/** Every cell of the rectangle spanned by two cells, both included. */
export function rectCells(a, b) {
  const cells = [];
  for ( let row = Math.min(a.row, b.row); row <= Math.max(a.row, b.row); row++ ) {
    for ( let col = Math.min(a.col, b.col); col <= Math.max(a.col, b.col); col++ ) cells.push({col, row});
  }
  return cells;
}

/**
 * Paint (or erase, texture null) cells.
 * @param {{textures: object[], cells: object}} state
 * @param {{col: number, row: number}[]} cells
 * @param {{src: string, repeat: number, blocks?: boolean}|null} texture
 * @returns {{state: object, changes: {key: string, before: (object|null), after: (object|null)}[]}}
 *   a new state; changes name textures by entry ({src, repeat}), not by index, so they can be applied
 *   to a state whose texture list has changed since
 */
export function paint(state, cells, texture) {
  const next = {textures: [...state.textures], cells: {...state.cells}};
  let index = null;
  if ( texture ) {
    index = next.textures.findIndex(t => sameEntry(t, texture));
    if ( index < 0 ) index = next.textures.push(entry(texture)) - 1;
  }
  const changes = [];
  const seen = new Set();
  for ( const cell of cells ) {
    const key = cellKey(cell);
    if ( seen.has(key) ) continue;
    seen.add(key);
    const was = next.cells[key];
    if ( (was ?? null) === index ) continue;
    changes.push({key, before: (was === undefined) ? null : next.textures[was], after: texture ? entry(texture) : null});
    if ( index === null ) delete next.cells[key];
    else next.cells[key] = index;
  }
  return {state: compact(next), changes};
}

/** Take changes back: every changed cell gets its `before` again. */
export function revert(state, changes) {
  let next = state;
  for ( const {key, before} of [...changes].reverse() ) next = paint(next, [parseKey(key)], before).state;
  return next;
}

/** Drop texture entries no cell uses any more (indices are renumbered). */
export function compact(state) {
  const used = [...new Set(Object.values(state.cells))].sort((a, b) => a - b);
  if ( used.length === state.textures.length ) return state;
  const map = new Map(used.map((old, i) => [old, i]));
  const cells = {};
  for ( const [key, index] of Object.entries(state.cells) ) cells[key] = map.get(index);
  return {textures: used.map(i => state.textures[i]), cells};
}

/** The chunk a cell is in. */
export function chunkOf({col, row}, size = CHUNK) {
  return {cx: Math.floor(col / size), cy: Math.floor(row / size)};
}

/** The chunks a list of changes touches, as keys "cx,cy". */
export function touchedChunks(changes, size = CHUNK) {
  return [...new Set(changes.map(c => {
    const {cx, cy} = chunkOf(parseKey(c.key), size);
    return `${cx},${cy}`;
  }))];
}

/**
 * What to fill in one chunk: per texture index, rectangles in cells relative to the chunk's corner.
 * Runs of a row are merged, then equal runs of consecutive rows - few rectangles, no overlaps.
 * @returns {Map<number, {col: number, row: number, width: number, height: number}[]>}  empty: nothing painted
 */
export function chunkRects(state, {cx, cy}, size = CHUNK) {
  const at = (c, r) => state.cells[`${(cx * size) + c},${(cy * size) + r}`];
  const rects = new Map();
  let open = new Map();   // "col,width,index" -> rect still growing downwards
  for ( let r = 0; r < size; r++ ) {
    const runs = [];
    for ( let c = 0; c < size; ) {
      const index = at(c, r);
      if ( index === undefined ) { c++; continue; }
      let end = c + 1;
      while ( (end < size) && (at(end, r) === index) ) end++;
      runs.push({col: c, width: end - c, index});
      c = end;
    }
    const still = new Map();
    for ( const run of runs ) {
      const id = `${run.col},${run.width},${run.index}`;
      const rect = open.get(id);
      if ( rect ) { rect.height++; still.set(id, rect); continue; }
      const created = {col: run.col, row: r, width: run.width, height: 1};
      if ( !rects.has(run.index) ) rects.set(run.index, []);
      rects.get(run.index).push(created);
      still.set(id, created);
    }
    open = still;
  }
  return rects;
}

/**
 * Walls for the blocking cells: the boundary between a cell whose texture blocks view and one that does
 * not (or is empty), merged into straight runs - one wall per run instead of one per cell side.
 * @param {{textures: object[], cells: object}} state
 * @param {number} gridSize  pixels per cell
 * @returns {number[][]}  [x1, y1, x2, y2] in pixels, sorted
 */
export function blockingOutline(state, gridSize) {
  const blocked = new Set(Object.entries(state.cells).filter(([, i]) => state.textures[i]?.blocks).map(([k]) => k));
  const horizontal = new Map();   // y -> [x...] unit edges starting at x
  const vertical = new Map();     // x -> [y...]
  const add = (map, line, start) => {
    if ( !map.has(line) ) map.set(line, []);
    map.get(line).push(start);
  };
  for ( const key of blocked ) {
    const {col, row} = parseKey(key);
    if ( !blocked.has(`${col},${row - 1}`) ) add(horizontal, row, col);
    if ( !blocked.has(`${col},${row + 1}`) ) add(horizontal, row + 1, col);
    if ( !blocked.has(`${col - 1},${row}`) ) add(vertical, col, row);
    if ( !blocked.has(`${col + 1},${row}`) ) add(vertical, col + 1, row);
  }
  const runs = (map, toWall) => {
    const out = [];
    for ( const [line, starts] of map ) {
      const sorted = [...new Set(starts)].sort((a, b) => a - b);
      let from = sorted[0], to = from + 1;
      for ( const s of sorted.slice(1) ) {
        if ( s === to ) { to++; continue; }
        out.push(toWall(line, from, to));
        from = s; to = s + 1;
      }
      if ( sorted.length ) out.push(toWall(line, from, to));
    }
    return out;
  };
  const g = gridSize;
  return [
    ...runs(horizontal, (y, a, b) => [a * g, y * g, b * g, y * g]),
    ...runs(vertical, (x, a, b) => [x * g, a * g, x * g, b * g])
  ].sort((a, b) => a.join(",").localeCompare(b.join(","), undefined, {numeric: true}));
}

/** A wall as a key that does not depend on its direction: "x1,y1,x2,y2" with the smaller point first. */
export function wallKey(c) {
  const [x1, y1, x2, y2] = c;
  return ((x1 < x2) || ((x1 === x2) && (y1 <= y2))) ? `${x1},${y1},${x2},${y2}` : `${x2},${y2},${x1},${y1}`;
}

/**
 * What to change so the existing walls become the wanted ones.
 * @param {{id: string, c: number[]}[]} existing
 * @param {number[][]} wanted
 * @returns {{create: number[][], remove: string[]}}  remove: ids
 */
export function diffWalls(existing, wanted) {
  const want = new Map(wanted.map(c => [wallKey(c), c]));
  const have = new Map();
  const remove = [];
  for ( const w of existing ) {
    const key = wallKey(w.c);
    if ( !want.has(key) || have.has(key) ) remove.push(w.id);
    else have.set(key, w.id);
  }
  return {create: [...want].filter(([k]) => !have.has(k)).map(([, c]) => c), remove};
}
