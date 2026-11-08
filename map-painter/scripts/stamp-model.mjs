// The pure half of the map painter: which grid cells a stroke covers, where a stamp's tile goes, how the
// stamp settings change. No Foundry globals, so `node --test` covers it (test/stamp-model.test.mjs).

/** Image extensions the palette lists (Foundry's image types; video tiles are left out on purpose). */
export const IMAGE_EXTENSIONS = ["apng", "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "tiff", "webp"];

/** Whether a path is an image the palette can stamp. */
export function isImage(path) {
  const clean = String(path).replace(/[?#].*$/, "");
  const dot = clean.lastIndexOf(".");
  return (dot > 0) && IMAGE_EXTENSIONS.includes(clean.slice(dot + 1).toLowerCase());
}

/**
 * The grid cell under a point (square grids): column and row.
 * @param {{x: number, y: number}} point
 * @param {number} size  grid size in pixels
 */
export function cellAt({x, y}, size) {
  return {col: Math.floor(x / size), row: Math.floor(y / size)};
}

/**
 * Every cell on the straight line from one cell to another (Bresenham), both ends included - a fast
 * drag skips cells between two pointer events, the row of stamps should not.
 * @returns {{col: number, row: number}[]}
 */
export function cellsBetween(from, to) {
  const cells = [];
  let {col: c, row: r} = from;
  const dc = Math.abs(to.col - c);
  const dr = -Math.abs(to.row - r);
  const sc = c < to.col ? 1 : -1;
  const sr = r < to.row ? 1 : -1;
  let err = dc + dr;
  for ( ;; ) {
    cells.push({col: c, row: r});
    if ( (c === to.col) && (r === to.row) ) break;
    const e2 = 2 * err;
    if ( e2 >= dr ) { err += dr; c += sc; }
    if ( e2 <= dc ) { err += dc; r += sr; }
  }
  return cells;
}

/**
 * The tile's size for a stamp block: the block is cells x cells; an image that is not square keeps its
 * proportions, its long side fills the block. Whole pixels.
 * @param {number} block   block size in pixels (cells * grid size)
 * @param {number} aspect  image width / height
 */
export function stampSize(block, aspect = 1) {
  if ( !(aspect > 0) || !Number.isFinite(aspect) ) aspect = 1;
  return {
    width: Math.max(1, Math.round(block * Math.min(1, aspect))),
    height: Math.max(1, Math.round(block * Math.min(1, 1 / aspect)))
  };
}

/**
 * Tile data for one stamp, centered on its block. A v14 tile's x/y is its texture anchor, not its top-left
 * corner: the stamp sets the anchor to the center (whatever the tile defaults say) and places that. x/y are
 * integers, so on an odd size (75) the anchor is the rounded half, and x/y make up for the rotation turning
 * the tile around that point instead of its true center - a square tile covers exactly its cells.
 * @param {object} stamp
 * @param {string} stamp.src
 * @param {number} stamp.cells      size of the block in grid cells (square)
 * @param {number} stamp.rotation   degrees
 * @param {boolean} stamp.flip      mirrored horizontally
 * @param {number} [stamp.aspect]   image width / height (1 = square)
 * @param {{x: number, y: number}} origin  top-left corner of the block
 * @param {number} gridSize
 */
export function tileData({src, cells, rotation, flip, aspect = 1}, origin, gridSize) {
  const block = Math.max(1, cells) * gridSize;
  const {width, height} = stampSize(block, aspect);
  const [hx, hy] = [Math.round(width / 2), Math.round(height / 2)];
  rotation = ((rotation % 360) + 360) % 360;
  // The true center relative to the anchor (-0.5 on odd sizes), turned with the tile
  const [dx, dy] = [(width / 2) - hx, (height / 2) - hy];
  const rad = rotation * Math.PI / 180;
  const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
  return {
    texture: {src, scaleX: flip ? -1 : 1, scaleY: 1, anchorX: hx / width, anchorY: hy / height},
    x: Math.round(origin.x + (block / 2) - ((cos * dx) - (sin * dy))),
    y: Math.round(origin.y + (block / 2) - ((sin * dx) + (cos * dy))),
    width,
    height,
    rotation
  };
}

/** Top-left corner of a stamp centered on a point (placing without the grid). */
export function centeredOrigin(point, cells, gridSize) {
  const half = (Math.max(1, cells) * gridSize) / 2;
  return {x: point.x - half, y: point.y - half};
}

/**
 * Where a stroke places stamps, as cells: a stamp of n cells takes an n×n block, so along a drag the next
 * one goes only where it does not overlap one placed in the same stroke.
 * @param {{col: number, row: number}[]} placed  block origins of this stroke so far
 * @param {{col: number, row: number}} cell
 * @param {number} cells
 */
export function freeForStamp(placed, cell, cells) {
  return placed.every(p => (Math.abs(p.col - cell.col) >= cells) || (Math.abs(p.row - cell.row) >= cells));
}

/**
 * Tiles another tile makes pointless: the same place, the same image, the same look and the same flags,
 * with one of them above the other. Whatever the image's transparency, the upper one draws exactly the
 * pixels the lower one would, so the lower cannot be seen and cannot be clicked - it is a document whose
 * only effect is to be in the way. Stamping the same cell in two strokes is how they appear.
 *
 * Flags are part of the identity on purpose: two tiles alike but for `opens` are *not* interchangeable -
 * one of them holds a hole in the rock - so they are left alone rather than guessed about.
 *
 * Tiles that merely overlap, or sit under a *different* image, are not decidable from the documents: an
 * image with transparent parts shows what is below it, which is exactly what a prop is for. Those are
 * reported, never removed.
 * @param {object[]} tiles  tile data with id, x, y, width, height, rotation, sort, elevation, texture, flags
 * @param {string} [moduleId]  whose flags count towards identity
 * @returns {{remove: string[], overlapping: {id: string, under: string}[]}}
 */
export function redundantTiles(tiles, moduleId = "dewarim-map-painter") {
  const look = t => JSON.stringify([t.x, t.y, t.width, t.height, t.rotation ?? 0, t.elevation ?? 0,
    t.alpha ?? 1, !!t.hidden, t.sort, t.texture?.src ?? null, t.texture?.scaleX ?? 1, t.texture?.scaleY ?? 1,
    t.texture?.anchorX ?? 0.5, t.texture?.anchorY ?? 0.5, t.texture?.tint ?? null, t.texture?.fit ?? null,
    [...(t.levels ?? [])].sort(), t.flags?.[moduleId] ?? null]);
  const place = t => JSON.stringify([t.x, t.y, t.width, t.height, t.rotation ?? 0, t.elevation ?? 0]);
  const groups = new Map();
  for ( const t of tiles ) {
    // `sort` is in the key with the rest of the look, so two tiles only count as the same thing when one
    // is not above the other at all; `sort` differing is what tells us which of them is on top.
    const key = look({...t, sort: 0});
    if ( !groups.has(key) ) groups.set(key, []);
    groups.get(key).push(t);
  }
  const remove = [];
  for ( const list of groups.values() ) {
    if ( list.length < 2 ) continue;
    // Keep the top one: the highest sort, and among equals the last id, so the answer does not depend on
    // the order the tiles arrived in.
    const keep = list.reduce((a, b) => ((b.sort > a.sort) || ((b.sort === a.sort) && (b.id > a.id))) ? b : a);
    for ( const t of list ) if ( t.id !== keep.id ) remove.push(t.id);
  }
  const gone = new Set(remove);
  const overlapping = [];
  for ( const t of tiles ) {
    if ( gone.has(t.id) ) continue;
    const above = tiles.find(o => (o.id !== t.id) && !gone.has(o.id) && (o.sort > t.sort) && (place(o) === place(t)));
    if ( above ) overlapping.push({id: t.id, under: above.id});
  }
  return {remove, overlapping};
}

/** Stamp size steps: 1…10 cells. */
export function resize(cells, delta) {
  return Math.min(10, Math.max(1, cells + delta));
}

/** Rotation in 90° steps, kept within 0…359. */
export function rotate(rotation, steps) {
  return (((rotation + (90 * steps)) % 360) + 360) % 360;
}

/** The recently used list: newest first, no duplicates, at most `max`. */
export function remember(recent, src, max = 12) {
  return [src, ...(recent ?? []).filter(s => s !== src)].slice(0, max);
}

/**
 * A tile's four corners, turned around its anchor by its rotation: clockwise from the image's top-left
 * (a v14 tile's x/y is its texture anchor, not its corner).
 * @param {{x: number, y: number, width: number, height: number, rotation?: number,
 *   texture?: {anchorX?: number, anchorY?: number}}} tile
 * @returns {number[][]}  [x, y], integers
 */
export function tileCorners({x, y, width, height, rotation = 0, texture = {}}) {
  const [ax, ay] = [(texture.anchorX ?? 0.5) * width, (texture.anchorY ?? 0.5) * height];
  const rad = (rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
  return [[0, 0], [width, 0], [width, height], [0, height]].map(([cx, cy]) => [
    Math.round(x + (cos * (cx - ax)) - (sin * (cy - ay))),
    Math.round(y + (sin * (cx - ax)) + (cos * (cy - ay)))
  ]);
}

/**
 * The four walls around a tile: its rectangle, turned around its anchor by the tile's rotation.
 * @param {object} tile  as tileCorners takes it
 * @returns {number[][]}  [x1, y1, x2, y2], integers
 */
export function tileOutline(tile) {
  const corners = tileCorners(tile);
  return corners.map((p, i) => [...p, ...corners[(i + 1) % 4]]);
}

/**
 * The grid cells a tile covers: every cell whose center lies under it. By the center, because that is the
 * rule that makes neighbouring stamps meet - a cell belongs to the stamp over it, not to both. Rotation
 * counts, so a turned stamp covers the cells it looks like it covers; a stamp narrower than its block
 * (an image that is not square) covers only the cells it really reaches.
 * @param {object} tile  as tileCorners takes it
 * @param {number} gridSize
 * @returns {{col: number, row: number}[]}
 */
export function tileCells(tile, gridSize) {
  const corners = tileCorners(tile);
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
  const cells = [];
  for ( let row = Math.floor(Math.min(...ys) / gridSize); row <= (Math.ceil(Math.max(...ys) / gridSize) - 1); row++ ) {
    for ( let col = Math.floor(Math.min(...xs) / gridSize); col <= (Math.ceil(Math.max(...xs) / gridSize) - 1); col++ ) {
      if ( covers(corners, (col + 0.5) * gridSize, (row + 0.5) * gridSize) ) cells.push({col, row});
    }
  }
  return cells;
}

/** Whether a point lies in the (convex) quadrilateral: on the same side of all four edges. */
function covers(corners, px, py) {
  let left = false, right = false;
  for ( let i = 0; i < corners.length; i++ ) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % corners.length];
    const cross = ((bx - ax) * (py - ay)) - ((by - ay) * (px - ax));
    if ( cross > 0 ) right = true;
    else if ( cross < 0 ) left = true;
  }
  return !(left && right);
}
