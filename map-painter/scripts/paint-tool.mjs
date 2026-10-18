// The texture brush on the canvas: paints whole grid cells with a repeating texture. Drag paints, Ctrl+drag
// fills a rectangle, Alt erases. The painted cells are kept in a scene flag (paint-model.mjs); each chunk of
// 16x16 cells with paint is baked into one webp image (worlds/<world>/map-painter/<scene>/) shown as a
// locked tile below all other tiles - so stamped props stay on top. The texture pattern is anchored to the
// grid origin, so chunks meet without seams. Square grids only.
// Undo is the brush's own (a stroke changes the flag and several tiles): its tile changes stay out of
// Foundry's tile history (isUndo), and Ctrl+Z is the brush's only while nothing newer is in that history -
// a tile deleted with the Delete key after a stroke is Foundry's to bring back.
const MODULE_ID = "dewarim-map-painter";
import {cellAt, cellsBetween} from "./stamp-model.mjs";
import {CHUNK, brushCells, chunkRects, paint, parseKey, readState, rectCells, revert, touchedChunks} from "./paint-model.mjs";
import {tileDefaults} from "./stamp-tool.mjs";
import {isBlocking, syncPaintWalls} from "./blocking.mjs";

const UNDO_DEPTH = 20;
/** Below every tile the GM places (Tile sort starts at 0 and grows) */
const PAINT_SORT = -100000;

export class PaintTool {
  /**
   * @param {{onChange?: () => void}} [options]  onChange: armed state or settings changed (re-render the palette)
   */
  constructor({onChange} = {}) {
    this.onChange = onChange ?? (() => {});
    // brush: cells on a side; repeat: grid cells one repeat of the texture covers
    this.settings = {src: null, brush: 1, repeat: 4};
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
    return !!this.settings.src && this.#listening;
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
    this.settings.src = src;
    this.#texture = await foundry.canvas.loadTexture(src);
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
    const texture = stroke.erase ? null
      : {src: this.settings.src, repeat: this.settings.repeat, blocks: isBlocking(this.settings.src)};
    await this.#apply(canvas.scene, [...stroke.cells.values()], texture);
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

  /** Take the last stroke on this scene back. */
  undo() {
    const scene = canvas.scene;
    const index = this.#undo.findLastIndex(u => u.sceneId === scene?.id);
    if ( index < 0 ) return;
    const [entry] = this.#undo.splice(index, 1);
    return this.#run(async () => {
      const state = revert(readState(scene.getFlag(MODULE_ID, "paint")), entry.changes);
      await saveState(scene, state);
      await bake(scene, state, touchedChunks(entry.changes));
      await syncPaintWalls(scene, state);
      this.onChange();
    });
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
    if ( this.#stroke.erase || !this.#texture ) g.beginFill(0xd04040, 0.35);
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

/**
 * Re-bake chunks of a scene from the state: draw, upload, create or update the chunk's tile - or delete
 * it when nothing is painted there any more.
 * @param {Scene} scene
 * @param {{textures: object[], cells: object}} state
 * @param {string[]} chunks  "cx,cy"
 */
export async function bake(scene, state, chunks) {
  const size = scene.grid.size;
  const px = CHUNK * size;
  const tiles = new Map(scene.tiles.filter(t => t.getFlag(MODULE_ID, "chunk")).map(t => [t.getFlag(MODULE_ID, "chunk"), t]));
  const images = new Map();
  const image = async index => {
    if ( !images.has(index) ) {
      const texture = await foundry.canvas.loadTexture(state.textures[index].src);
      images.set(index, texture?.baseTexture?.resource?.source ?? null);
    }
    return images.get(index);
  };
  const folder = await bakeFolder(scene);
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const create = [], update = [], remove = [];
  for ( const key of chunks ) {
    const {col: cx, row: cy} = parseKey(key);
    const rects = chunkRects(state, {cx, cy});
    const tile = tiles.get(key);
    if ( !rects.size ) {
      if ( tile ) remove.push(tile.id);
      continue;
    }
    const [ox, oy] = [cx * px, cy * px];
    const el = document.createElement("canvas");
    el.width = el.height = px;
    const ctx = el.getContext("2d");
    for ( const [index, list] of rects ) {
      const source = await image(index);
      if ( !source ) continue;
      const pattern = ctx.createPattern(source, "repeat");
      const scale = (state.textures[index].repeat * size) / source.width;
      // Anchored to the grid origin, not the chunk: neighbouring chunks continue the same pattern
      pattern.setTransform(new DOMMatrix().translateSelf(-ox, -oy).scaleSelf(scale, scale));
      ctx.fillStyle = pattern;
      for ( const r of list ) ctx.fillRect(r.col * size, r.row * size, r.width * size, r.height * size);
    }
    const blob = await new Promise(resolve => el.toBlob(resolve, "image/webp", 0.88));
    const name = `chunk_${cx}_${cy}.webp`.replace(/-/g, "m");
    const result = await FilePicker.upload("data", folder, new File([blob], name, {type: "image/webp"}), {}, {notify: false});
    // A new query string per bake: the same file name, but every client loads the new image
    const src = `${result?.path ?? `${folder}/${name}`}?v=${Date.now()}`;
    const data = {
      x: ox + (px / 2), y: oy + (px / 2), width: px, height: px, rotation: 0, sort: PAINT_SORT, locked: true,
      texture: {src, anchorX: 0.5, anchorY: 0.5, scaleX: 1, scaleY: 1}
    };
    if ( tile ) update.push({_id: tile.id, ...data});
    else create.push(foundry.utils.mergeObject(tileDefaults(), {...data, flags: {[MODULE_ID]: {chunk: key}}}));
  }
  // isUndo: not into Foundry's tile history - the brush has its own undo, and Foundry's would leave the
  // flag behind
  // flag behind. A fresh options object per call: Foundry writes the operation into it.
  if ( create.length ) await scene.createEmbeddedDocuments("Tile", create, {isUndo: true});
  if ( update.length ) await scene.updateEmbeddedDocuments("Tile", update, {isUndo: true});
  if ( remove.length ) await scene.deleteEmbeddedDocuments("Tile", remove, {isUndo: true});
}
