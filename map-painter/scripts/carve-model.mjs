// The pure half of carving: a scene covered in rock, with cells carved open. No Foundry globals:
// test/carve-model.test.mjs.
//
// State (scene flag "carve"): {rock: {src, repeat}, blocks, open: {"col,row": 1}}. rock.src null is plain
// black. The rock is baked into chunk tiles over the whole scene (above the paint, below the props) with
// the open cells left transparent - they show the painted floor or the scene's background below. With
// `blocks`, walls follow the outline of the open cells.
import {CHUNK, blockingOutline, cellKey, parseKey} from "./paint-model.mjs";

/** No carving on the scene yet, or a copy of the flag (repaired). */
export function readCarve(data) {
  if ( !data || (typeof data !== "object") ) return null;
  const rock = {src: (typeof data.rock?.src === "string") ? data.rock.src : null, repeat: Math.max(1, Number(data.rock?.repeat) || 1)};
  const open = {};
  for ( const key of Object.keys(data.open ?? {}) ) if ( /^-?\d+,-?\d+$/.test(key) ) open[key] = 1;
  return {rock, blocks: data.blocks !== false, open};
}

/** A fresh carving: all rock. */
export function newCarve({src = null, repeat = 4, blocks = true} = {}) {
  return {rock: {src, repeat: Math.max(1, repeat)}, blocks, open: {}};
}

/**
 * Carve cells open (or fill them with rock again).
 * @returns {{state: object, changes: {key: string, before: boolean, after: boolean}[]}}  before/after: open
 */
export function carve(state, cells, open) {
  const next = {...state, open: {...state.open}};
  const changes = [];
  const seen = new Set();
  for ( const cell of cells ) {
    const key = cellKey(cell);
    if ( seen.has(key) ) continue;
    seen.add(key);
    const was = !!next.open[key];
    if ( was === open ) continue;
    changes.push({key, before: was, after: open});
    if ( open ) next.open[key] = 1;
    else delete next.open[key];
  }
  return {state: next, changes};
}

/** Take changes back. */
export function revertCarve(state, changes) {
  const open = {...state.open};
  for ( const {key, before} of changes ) {
    if ( before ) open[key] = 1;
    else delete open[key];
  }
  return {...state, open};
}

/**
 * The cells the scene covers, as a range: the rock fills exactly these.
 * @param {{x: number, y: number, width: number, height: number}} sceneRect  in pixels (canvas coordinates)
 * @param {number} gridSize
 */
export function sceneCells(sceneRect, gridSize) {
  return {
    col0: Math.floor(sceneRect.x / gridSize), row0: Math.floor(sceneRect.y / gridSize),
    col1: Math.ceil((sceneRect.x + sceneRect.width) / gridSize) - 1,
    row1: Math.ceil((sceneRect.y + sceneRect.height) / gridSize) - 1
  };
}

/** Every chunk that has rock: the chunks over the scene's cells, as keys "cx,cy". */
export function rockChunks(range, size = CHUNK) {
  const keys = [];
  for ( let cy = Math.floor(range.row0 / size); cy <= Math.floor(range.row1 / size); cy++ ) {
    for ( let cx = Math.floor(range.col0 / size); cx <= Math.floor(range.col1 / size); cx++ ) keys.push(`${cx},${cy}`);
  }
  return keys;
}

/** The chunks a list of changes touches. */
export function carvedChunks(changes, size = CHUNK) {
  return [...new Set(changes.map(c => {
    const {col, row} = parseKey(c.key);
    return `${Math.floor(col / size)},${Math.floor(row / size)}`;
  }))];
}

/**
 * Inside one chunk: the rock rectangle (the chunk clipped to the scene's cells) and the open cells to cut
 * out of it, in cells relative to the chunk's corner.
 * @returns {{rock: ({col, row, width, height}|null), holes: {col: number, row: number}[]}}
 */
export function chunkRock(state, {cx, cy}, range, size = CHUNK) {
  const c0 = Math.max(cx * size, range.col0), c1 = Math.min(((cx + 1) * size) - 1, range.col1);
  const r0 = Math.max(cy * size, range.row0), r1 = Math.min(((cy + 1) * size) - 1, range.row1);
  if ( (c0 > c1) || (r0 > r1) ) return {rock: null, holes: []};
  const holes = [];
  for ( let row = r0; row <= r1; row++ ) {
    for ( let col = c0; col <= c1; col++ ) {
      if ( state.open[`${col},${row}`] ) holes.push({col: col - (cx * size), row: row - (cy * size)});
    }
  }
  const area = (c1 - c0 + 1) * (r1 - r0 + 1);
  return {
    rock: (holes.length === area) ? null : {col: c0 - (cx * size), row: r0 - (cy * size), width: c1 - c0 + 1, height: r1 - r0 + 1},
    holes
  };
}

/** Walls along the edges of the carved area (when the rock blocks view): the outline of the open cells. */
export function carveOutline(state, gridSize) {
  if ( !state?.blocks ) return [];
  return blockingOutline({textures: [{src: "rock", repeat: 1, blocks: true}],
    cells: Object.fromEntries(Object.keys(state.open).map(k => [k, 0]))}, gridSize);
}
