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
 * The four walls around a tile: its rectangle, turned around its anchor by the tile's rotation.
 * @param {{x: number, y: number, width: number, height: number, rotation?: number,
 *   texture?: {anchorX?: number, anchorY?: number}}} tile
 * @returns {number[][]}  [x1, y1, x2, y2], integers
 */
export function tileOutline({x, y, width, height, rotation = 0, texture = {}}) {
  const [ax, ay] = [(texture.anchorX ?? 0.5) * width, (texture.anchorY ?? 0.5) * height];
  const rad = (rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
  const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([cx, cy]) => [
    Math.round(x + (cos * (cx - ax)) - (sin * (cy - ay))),
    Math.round(y + (sin * (cx - ax)) + (cos * (cy - ay)))
  ]);
  return corners.map((p, i) => [...p, ...corners[(i + 1) % 4]]);
}
