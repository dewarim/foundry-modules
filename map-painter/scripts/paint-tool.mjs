// The texture brush on the canvas: paints whole grid cells with a repeating texture. Drag paints, Ctrl+drag
// fills a rectangle, Alt erases. The painted cells are kept in a scene flag (paint-model.mjs); each chunk of
// 16x16 cells with paint is baked into one webp image (worlds/<world>/map-painter/<scene>/) shown as a
// locked tile below all other tiles - so stamped props stay on top. The texture pattern is anchored to the
// grid origin, so chunks meet without seams. Square grids only.
// Undo is the brush's own (a stroke changes the flag and several tiles): its tile changes stay out of
// Foundry's tile history (isUndo), and Ctrl+Z is the brush's only while nothing newer is in that history -
// a tile deleted with the Delete key after a stroke is Foundry's to bring back.
// Kind "carve" (step 4) is the same brush on a different layer: the scene is covered in rock (black or a
// texture, carve-model.mjs), and the brush carves cells open - they show the paint or the scene's
// background below; Alt fills rock back in. The rock is baked like the paint, one layer above it.
const MODULE_ID = "dewarim-map-painter";
import {cellAt, cellsBetween} from "./stamp-model.mjs";
import {CHUNK, brushCells, chunkRects, paint, parseKey, readState, rectCells, revert, touchedChunks} from "./paint-model.mjs";
import {carve, carvedChunks, chunkRock, newCarve, readCarve, revertCarve, rockChunks, sceneCells} from "./carve-model.mjs";
import {tileDefaults} from "./stamp-tool.mjs";
import {isBlocking, syncCarveWalls, syncPaintWalls} from "./blocking.mjs";

const UNDO_DEPTH = 20;
/** Below every tile the GM places (Tile sort starts at 0 and grows): the paint, the rock just above it */
const PAINT_SORT = -100000;
const ROCK_SORT = -99999;

export class PaintTool {
  /**
   * @param {{onChange?: () => void, kind?: "paint"|"carve"}} [options]  onChange: armed state or settings
   *   changed (re-render the palette); kind: paint textures, or carve the rock
   */
  constructor({onChange, kind = "paint"} = {}) {
    this.onChange = onChange ?? (() => {});
    this.kind = kind;
    // brush: cells on a side; repeat: grid cells one repeat of the texture covers; src: the texture (carve:
    // the rock's, null = black); rockBlocks: carve - walls along the carved edges
    this.settings = {src: null, brush: 1, repeat: 4, rockBlocks: true};
    this.#onPointerDown = this.#pointerDown.bind(this);
    this.#onPointerMove = this.#pointerMove.bind(this);
    this.#onPointerUp = this.#pointerUp.bind(this);
    this.#onKey = this.#key.bind(this);
  }

  #onPointerDown;
  #onPointerMove;
  #onPointerUp;
  #onKey;
  #listening = false;
  /** Outline of the brush under the pointer, and the cells of a stroke in progress */
  #cursor = null;
  #preview = null;
  #texture = null;
  /** {erase, rect, start, last, cells: Map<key, cell>} */
  #stroke = null;
  #undo = [];
  /** Bakes run one after another: a fast second stroke must not race the first one's upload */
  #queue = Promise.resolve();

  get armed() {
    return this.#listening && ((this.kind === "carve") || !!this.settings.src);
  }

  get canUndo() {
    return this.#undo.some(u => u.sceneId === canvas.scene?.id);
  }

  get #view() {
    return canvas.app.canvas ?? canvas.app.view;
  }

  async arm(src) {
    if ( !canvas.ready || !canvas.scene ) return ui.notifications.warn("DEWARIM_MAP.NoScene", {localize: true});
    if ( !canvas.grid.isSquare ) return ui.notifications.warn("DEWARIM_MAP.PaintSquareOnly", {localize: true});
    this.settings.src = src ?? null;
    this.#texture = src ? await foundry.canvas.loadTexture(src) : null;
    if ( !this.#listening ) {
      this.#view.addEventListener("pointerdown", this.#onPointerDown, true);
      this.#view.addEventListener("pointermove", this.#onPointerMove, true);
      window.addEventListener("pointerup", this.#onPointerUp, true);
      document.addEventListener("keydown", this.#onKey, true);
      this.#listening = true;
      canvas.tiles?.activate();
    }
    this.#cursor ??= canvas.controls.addChild(new PIXI.Graphics());
    this.#preview ??= canvas.controls.addChild(new PIXI.Graphics());
    this.onChange();
  }

  disarm() {
    if ( this.#listening ) {
      const view = canvas.app?.canvas ?? canvas.app?.view;
      view?.removeEventListener("pointerdown", this.#onPointerDown, true);
      view?.removeEventListener("pointermove", this.#onPointerMove, true);
      window.removeEventListener("pointerup", this.#onPointerUp, true);
      document.removeEventListener("keydown", this.#onKey, true);
      this.#listening = false;
    }
    for ( const g of [this.#cursor, this.#preview] ) g?.destroy();
    this.#cursor = this.#preview = null;
    this.#stroke = null;
    this.settings.src = null;
    this.onChange();
  }

  set(change) {
    Object.assign(this.settings, change);
    this.onChange();
  }

  /* -------------------------------------------- */
  /*  Pointer                                     */
  /* -------------------------------------------- */

  #cellAt(event) {
    return cellAt(canvas.canvasCoordinatesFromClient({x: event.clientX, y: event.clientY}), canvas.grid.size);
  }

  #pointerDown(event) {
    if ( (event.button !== 0) || !this.armed || (event.target !== this.#view) ) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    const cell = this.#cellAt(event);
    this.#stroke = {erase: event.altKey, rect: event.ctrlKey || event.metaKey, start: cell, last: cell, cells: new Map()};
    this.#extend(cell);
  }

  #pointerMove(event) {
    if ( !this.armed ) return;
    const cell = this.#cellAt(event);
    this.#drawCursor(cell, event.altKey || this.#stroke?.erase);
    if ( !this.#stroke ) return;
    // Without the left button down the stroke is over (a release that never arrived, another pointer)
    if ( !(event.buttons & 1) ) return this.#pointerUp(event);
    event.stopImmediatePropagation();
    event.preventDefault();
    this.#extend(cell);
  }

  /** Grow the stroke to a cell: the brush along the way, or the rectangle from the start. */
  #extend(cell) {
    const stroke = this.#stroke;
    if ( stroke.rect ) {
      stroke.cells = new Map(rectCells(stroke.start, cell).map(c => [`${c.col},${c.row}`, c]));
    } else {
      for ( const step of cellsBetween(stroke.last, cell) ) {
        for ( const c of brushCells(step, this.settings.brush) ) stroke.cells.set(`${c.col},${c.row}`, c);
      }
    }
    stroke.last = cell;
    this.#drawPreview();
  }

  async #pointerUp(event) {
    if ( !this.#stroke ) return;
    const stroke = this.#stroke;
    this.#stroke = null;
    event.stopImmediatePropagation();
    this.#preview?.clear();
    const cells = [...stroke.cells.values()];
    if ( this.kind === "carve" ) return this.#applyCarve(canvas.scene, cells, !stroke.erase);
    const texture = stroke.erase ? null
      : {src: this.settings.src, repeat: this.settings.repeat, blocks: isBlocking(this.settings.src)};
    await this.#apply(canvas.scene, cells, texture);
  }

  /* -------------------------------------------- */
  /*  Strokes, undo                               */
  /* -------------------------------------------- */

  /** Paint cells on a scene, save the state, bake what changed. */
  #apply(scene, cells, texture) {
    return this.#run(async () => {
      const result = paint(readState(scene.getFlag(MODULE_ID, "paint")), cells, texture);
      if ( !result.changes.length ) return;
      await saveState(scene, result.state);
      this.#undo = [...this.#undo, {sceneId: scene.id, changes: result.changes, history: tileHistory()}].slice(-UNDO_DEPTH);
      await bake(scene, result.state, touchedChunks(result.changes));
      await syncPaintWalls(scene, result.state);
      this.onChange();
    });
  }

  /**
   * Carve cells open (or fill them with rock). The first stroke on a scene lays the rock over all of it;
   * changed rock settings (texture, scale, walls) apply to the whole layer with the next stroke.
   */
  #applyCarve(scene, cells, open) {
    return this.#run(async () => {
      const stored = readCarve(scene.getFlag(MODULE_ID, "carve"));
      const wanted = {src: this.settings.src, repeat: this.settings.repeat, blocks: this.settings.rockBlocks};
      let state = stored ?? newCarve(wanted);
      const rockChanged = !!stored && ((stored.rock.src !== wanted.src) || (stored.rock.repeat !== wanted.repeat)
        || (stored.blocks !== wanted.blocks));
      if ( rockChanged ) state = {...state, rock: {src: wanted.src, repeat: wanted.repeat}, blocks: wanted.blocks};
      const result = carve(state, cells, open);
      if ( stored && !rockChanged && !result.changes.length ) return;
      await saveCarve(scene, result.state);
      this.#undo = [...this.#undo, {sceneId: scene.id, kind: "carve", changes: result.changes, before: stored,
        history: tileHistory()}].slice(-UNDO_DEPTH);
      const range = sceneCells(scene.dimensions.sceneRect, scene.grid.size);
      await bakeRock(scene, result.state, (!stored || rockChanged) ? rockChunks(range) : carvedChunks(result.changes));
      await syncCarveWalls(scene, result.state);
      this.onChange();
    });
  }

  /** Take the last stroke on this scene back. */
  undo() {
    const scene = canvas.scene;
    const index = this.#undo.findLastIndex(u => u.sceneId === scene?.id);
    if ( index < 0 ) return;
    const [entry] = this.#undo.splice(index, 1);
    if ( entry.kind === "carve" ) return this.#undoCarve(scene, entry);
    return this.#run(async () => {
      const state = revert(readState(scene.getFlag(MODULE_ID, "paint")), entry.changes);
      await saveState(scene, state);
      await bake(scene, state, touchedChunks(entry.changes));
      await syncPaintWalls(scene, state);
      this.onChange();
    });
  }

  /** A carve stroke back - the first one on a scene takes the whole rock layer with it. */
  #undoCarve(scene, entry) {
    return this.#run(async () => {
      if ( !entry.before ) return removeRock(scene);
      const current = readCarve(scene.getFlag(MODULE_ID, "carve")) ?? entry.before;
      const state = {...revertCarve(current, entry.changes), rock: entry.before.rock, blocks: entry.before.blocks};
      const rockChanged = (current.rock.src !== state.rock.src) || (current.rock.repeat !== state.rock.repeat)
        || (current.blocks !== state.blocks);
      await saveCarve(scene, state);
      const range = sceneCells(scene.dimensions.sceneRect, scene.grid.size);
      await bakeRock(scene, state, rockChanged ? rockChunks(range) : carvedChunks(entry.changes));
      await syncCarveWalls(scene, state);
      this.onChange();
    });
  }

  /** Remove the scene's rock layer: its tiles, its walls, the flag. */
  removeRock(scene = canvas.scene) {
    this.#undo = this.#undo.filter(u => !((u.sceneId === scene.id) && (u.kind === "carve")));
    return this.#run(() => removeRock(scene));
  }

  #run(task) {
    this.#queue = this.#queue.then(task).catch(err => {
      console.error(err);
      ui.notifications.error(`${_loc("DEWARIM_MAP.PaintFailed")}: ${err.message}`);
    });
    return this.#queue;
  }

  #key(event) {
    if ( !this.armed || event.target.closest?.("input, textarea, select, [contenteditable]") ) return;
    const handled = () => { event.preventDefault(); event.stopPropagation(); };
    if ( event.key === "Escape" ) { handled(); return this.disarm(); }
    if ( (event.key === "z") && (event.ctrlKey || event.metaKey) ) {
      // Something newer in Foundry's tile history (a deleted tile): Foundry's own undo goes first
      const last = this.#undo.findLast(u => u.sceneId === canvas.scene?.id);
      if ( !last || (tileHistory() > last.history) ) return;
      handled();
      return this.undo();
    }
    if ( event.ctrlKey || event.metaKey || event.altKey ) return;
    if ( event.key === "[" ) { handled(); return this.set({brush: Math.max(1, this.settings.brush - 1)}); }
    if ( event.key === "]" ) { handled(); return this.set({brush: Math.min(10, this.settings.brush + 1)}); }
  }

  /* -------------------------------------------- */
  /*  Overlay                                     */
  /* -------------------------------------------- */

  #drawCursor(cell, erase) {
    const g = this.#cursor;
    if ( !g ) return;
    const size = canvas.grid.size;
    const cells = this.#stroke?.rect ? [] : brushCells(cell, this.settings.brush);
    g.clear();
    if ( !cells.length ) return;
    const [first, n] = [cells[0], this.settings.brush];
    g.lineStyle(2, erase ? 0xd04040 : 0xffffff, 0.9).drawRect(first.col * size, first.row * size, n * size, n * size);
  }

  /** The stroke so far: the texture at its scale, half see-through; red for erasing. */
  #drawPreview() {
    const g = this.#preview;
    if ( !g || !this.#stroke ) return;
    const size = canvas.grid.size;
    g.clear();
    // Carving: open cells green, rock filled back in black
    if ( this.kind === "carve" ) g.beginFill(this.#stroke.erase ? 0x000000 : 0x40c080, this.#stroke.erase ? 0.6 : 0.35);
    else if ( this.#stroke.erase || !this.#texture ) g.beginFill(0xd04040, 0.35);
    else {
      const scale = (this.settings.repeat * size) / this.#texture.width;
      g.beginTextureFill({texture: this.#texture, alpha: 0.75, matrix: new PIXI.Matrix().scale(scale, scale)});
    }
    for ( const c of this.#stroke.cells.values() ) g.drawRect(c.col * size, c.row * size, size, size);
    g.endFill();
  }
}

/* -------------------------------------------- */
/*  Saving and baking                           */
/* -------------------------------------------- */

/** How many entries Foundry's tile history has: what the brush did is not among them. */
function tileHistory() {
  return canvas.tiles?.history?.length ?? 0;
}

/** Replace (not merge) the flag: erased cells must go. */
function saveState(scene, state) {
  const {ForcedReplacement} = foundry.data.operators;
  return scene.update({[`flags.${MODULE_ID}.paint`]: new ForcedReplacement(state)});
}

/** The folder of a scene's baked images, created on first use. */
async function bakeFolder(scene) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const parts = ["worlds", game.world.id, "map-painter", scene.id];
  for ( let i = 3; i <= parts.length; i++ ) {
    try { await FilePicker.createDirectory("data", parts.slice(0, i).join("/"), {notify: false}); }
    catch(err) { if ( !/EEXIST|exists/i.test(String(err.message)) ) throw err; }
  }
  return parts.join("/");
}

/** Replace the carve flag. */
function saveCarve(scene, state) {
  const {ForcedReplacement} = foundry.data.operators;
  return scene.update({[`flags.${MODULE_ID}.carve`]: new ForcedReplacement(state)});
}

/** The rock layer goes: tiles, walls, flag. */
async function removeRock(scene) {
  const ids = scene.tiles.filter(t => t.getFlag(MODULE_ID, "rock")).map(t => t.id);
  if ( ids.length ) await scene.deleteEmbeddedDocuments("Tile", ids, {isUndo: true});
  await syncCarveWalls(scene, null);
  await scene.update({[`flags.${MODULE_ID}.-=carve`]: null});
}

/** A texture's image (loaded once per bake), for canvas patterns. */
function imageLoader() {
  const images = new Map();
  return async src => {
    if ( !images.has(src) ) {
      const texture = await foundry.canvas.loadTexture(src);
      images.set(src, texture?.baseTexture?.resource?.source ?? null);
    }
    return images.get(src);
  };
}

/** A pattern of a texture at `repeat` cells per copy, anchored to the grid origin (chunks continue it). */
function gridPattern(ctx, source, repeat, size, ox, oy) {
  const pattern = ctx.createPattern(source, "repeat");
  const scale = (repeat * size) / source.width;
  pattern.setTransform(new DOMMatrix().translateSelf(-ox, -oy).scaleSelf(scale, scale));
  return pattern;
}

/**
 * Bake chunks of one layer: draw each, upload it, create or update its tile - or delete the tile when the
 * chunk is empty now.
 * @param {Scene} scene
 * @param {object} layer
 * @param {string} layer.flag     tile flag naming the chunk ("chunk": paint, "rock": carving)
 * @param {string} layer.prefix   image file prefix
 * @param {number} layer.sort
 * @param {(ctx: CanvasRenderingContext2D, chunk: {cx, cy}, origin: {ox, oy}) => Promise<boolean>} layer.draw
 *   draws the chunk; false: nothing there
 * @param {string[]} chunks  "cx,cy"
 */
async function bakeLayer(scene, {flag, prefix, sort, draw}, chunks) {
  const px = CHUNK * scene.grid.size;
  const tiles = new Map(scene.tiles.filter(t => t.getFlag(MODULE_ID, flag)).map(t => [t.getFlag(MODULE_ID, flag), t]));
  const folder = await bakeFolder(scene);
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const create = [], update = [], remove = [];
  for ( const key of chunks ) {
    const {col: cx, row: cy} = parseKey(key);
    const [ox, oy] = [cx * px, cy * px];
    const el = document.createElement("canvas");
    el.width = el.height = px;
    const ctx = el.getContext("2d");
    const tile = tiles.get(key);
    if ( !(await draw(ctx, {cx, cy}, {ox, oy})) ) {
      if ( tile ) remove.push(tile.id);
      continue;
    }
    const blob = await new Promise(resolve => el.toBlob(resolve, "image/webp", 0.88));
    const name = `${prefix}_${cx}_${cy}.webp`.replace(/-/g, "m");
    const result = await FilePicker.upload("data", folder, new File([blob], name, {type: "image/webp"}), {}, {notify: false});
    // A new query string per bake: the same file name, but every client loads the new image
    const src = `${result?.path ?? `${folder}/${name}`}?v=${Date.now()}`;
    const data = {
      x: ox + (px / 2), y: oy + (px / 2), width: px, height: px, rotation: 0, sort, locked: true,
      texture: {src, anchorX: 0.5, anchorY: 0.5, scaleX: 1, scaleY: 1}
    };
    if ( tile ) update.push({_id: tile.id, ...data});
    else create.push(foundry.utils.mergeObject(tileDefaults(), {...data, flags: {[MODULE_ID]: {[flag]: key}}}));
  }
  // isUndo: not into Foundry's tile history - the brush has its own undo, and Foundry's would leave the
  // flag behind. A fresh options object per call: Foundry writes the operation into it.
  if ( create.length ) await scene.createEmbeddedDocuments("Tile", create, {isUndo: true});
  if ( update.length ) await scene.updateEmbeddedDocuments("Tile", update, {isUndo: true});
  if ( remove.length ) await scene.deleteEmbeddedDocuments("Tile", remove, {isUndo: true});
}

/**
 * Re-bake paint chunks of a scene from the state.
 * @param {Scene} scene
 * @param {{textures: object[], cells: object}} state
 * @param {string[]} chunks  "cx,cy"
 */
export function bake(scene, state, chunks) {
  const size = scene.grid.size;
  const image = imageLoader();
  return bakeLayer(scene, {flag: "chunk", prefix: "chunk", sort: PAINT_SORT, draw: async (ctx, chunk, {ox, oy}) => {
    const rects = chunkRects(state, chunk);
    for ( const [index, list] of rects ) {
      const source = await image(state.textures[index].src);
      if ( !source ) continue;
      ctx.fillStyle = gridPattern(ctx, source, state.textures[index].repeat, size, ox, oy);
      for ( const r of list ) ctx.fillRect(r.col * size, r.row * size, r.width * size, r.height * size);
    }
    return rects.size > 0;
  }}, chunks);
}

/**
 * Re-bake rock chunks: the scene's area in rock (black or the texture), open cells cut out.
 * @param {Scene} scene
 * @param {object} state  carve state
 * @param {string[]} chunks
 */
export function bakeRock(scene, state, chunks) {
  const size = scene.grid.size;
  const range = sceneCells(scene.dimensions.sceneRect, size);
  const image = imageLoader();
  return bakeLayer(scene, {flag: "rock", prefix: "rock", sort: ROCK_SORT, draw: async (ctx, chunk, {ox, oy}) => {
    const {rock, holes} = chunkRock(state, chunk, range);
    if ( !rock ) return false;
    const source = state.rock.src ? await image(state.rock.src) : null;
    ctx.fillStyle = source ? gridPattern(ctx, source, state.rock.repeat, size, ox, oy) : "#000000";
    ctx.fillRect(rock.col * size, rock.row * size, rock.width * size, rock.height * size);
    for ( const h of holes ) ctx.clearRect(h.col * size, h.row * size, size, size);
    return true;
  }}, chunks);
}
