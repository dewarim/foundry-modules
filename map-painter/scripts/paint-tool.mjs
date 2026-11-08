// The brush on the canvas: a stroke says "these cells are floor" - or wall, which is the same slot and
// therefore the same tool, with a texture that blocks view (slot-model.mjs). Drag paints, Ctrl+drag fills a
// rectangle, Alt makes the cells solid again. Taking the slot is part of the stroke: the painter's own
// floors and walls in the cells it paints are deleted, so nothing opaque is left over fresh paint - which
// is what made painted floors turn up invisible under tiles stamped earlier.
// On a world that was filled with material the stroke opens the material where it paints, so one gesture
// does what used to need two modes (ROADMAP step 5; floor-model.mjs
// holds the rule). The painted cells are kept in a scene flag (paint-model.mjs); each chunk of
// 16x16 cells with paint is baked into one webp image (worlds/<world>/map-painter/<scene>/) shown as a
// locked tile below all other tiles - so stamped props stay on top. The texture pattern is anchored to the
// grid origin, so chunks meet without seams. Square grids only.
// Undo is the brush's own (a stroke changes the flag and several tiles): its tile changes stay out of
// Foundry's tile history (isUndo), and Ctrl+Z is the brush's only while nothing newer is in that history -
// a tile deleted with the Delete key after a stroke is Foundry's to bring back.
// Filling the world (step 4) is an action, not a mode: the scene is covered in material (black or a
// texture, carve-model.mjs) which the floor strokes then open. The rock is baked like the paint, one layer
// above it, and the cells a floor stroke opens are cut out of it - so what shows there is the floor painted
// below, or the scene's background.
// A stamped floor or wall carves its cells out of the material in the same way (flag `opens`,
// blocking.mjs) - it *is* the floor of those cells, so the material has to go there and the rock is
// really gone and not just hidden behind the tile: syncOpenings re-bakes the rock
// after such a tile arrives, moves or goes. Which chunks that takes is answered by the digest each rock
// tile carries (carve-model.mjs: rockDigest) rather than by remembering what changed - so a reload, a
// second GM or a bake that failed half way cannot leave an image that lies about the rock.
const MODULE_ID = "dewarim-map-painter";
import {cellAt, cellsBetween} from "./stamp-model.mjs";
import {CHUNK, brushCells, chunkRects, paint, parseKey, readState, rectCells, revert, touchedChunks} from "./paint-model.mjs";
import {chunkRock, newCarve, readCarve, revertCarve, rockChunks, rockDigest, sceneCells} from "./carve-model.mjs";
import {floorStroke} from "./floor-model.mjs";
import {releaseCanvas, takeCanvas} from "./canvas-tool.mjs";
import {tileDefaults} from "./stamp-tool.mjs";
import {openedCarve, syncCarveWalls, syncPaintWalls} from "./blocking.mjs";
import {KIND, PAINT_SORT, ROCK_SORT, blocksFor} from "./slot-model.mjs";
import {announceReplaced, replacedIn} from "./slot.mjs";

const UNDO_DEPTH = 20;

export class PaintTool {
  /**
   * @param {{onChange?: () => void}} [options]  onChange: armed state or settings changed (re-render the
   *   palette)
   */
  constructor({onChange} = {}) {
    this.onChange = onChange ?? (() => {});
    // brush: cells on a side; repeat: grid cells one repeat of the texture covers; src: the texture,
    // null = open the material without changing the floor below; kind: what the mode says a stroke means -
    // "floor" or "wall", the two that share the cell's one slot (slot-model.mjs). A wall blocks view, a
    // floor does not, and the same texture can be either from one stroke to the next.
    this.settings = {src: null, brush: 1, repeat: 4, kind: KIND.FLOOR};
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
  /** {id (the pointer drawing it), erase, rect, start, last, cells: Map<key, cell>} */
  #stroke = null;
  #undo = [];
  /** Bakes run one after another: a fast second stroke must not race the first one's upload */
  #queue = Promise.resolve();

  /** Armed with a texture, or - on a filled world - with nothing, which opens the rock as it is. */
  get armed() {
    return this.#listening && (!!this.settings.src || hasRock(canvas.scene));
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
      window.addEventListener("pointercancel", this.#onPointerUp, true);
      document.addEventListener("keydown", this.#onKey, true);
      this.#listening = true;
      // A drag on the canvas is the brush's alone while it is armed (canvas-tool.mjs)
      takeCanvas();
    }
    this.#cursor ??= canvas.controls.addChild(new PIXI.Graphics());
    this.#preview ??= canvas.controls.addChild(new PIXI.Graphics());
    this.onChange();
  }

  disarm() {
    const was = this.#listening;
    if ( was ) {
      const view = canvas.app?.canvas ?? canvas.app?.view;
      view?.removeEventListener("pointerdown", this.#onPointerDown, true);
      view?.removeEventListener("pointermove", this.#onPointerMove, true);
      window.removeEventListener("pointerup", this.#onPointerUp, true);
      window.removeEventListener("pointercancel", this.#onPointerUp, true);
      document.removeEventListener("keydown", this.#onKey, true);
      this.#listening = false;
    }
    for ( const g of [this.#cursor, this.#preview] ) g?.destroy();
    this.#cursor = this.#preview = null;
    this.#stroke = null;
    this.settings.src = null;
    this.onChange();
    // Nothing armed: Foundry's own tile tools have the canvas back. Last, because handing the tool back
    // comes round to disarmAll() - by now there is nothing left to disarm.
    if ( was ) releaseCanvas();
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
    // preventDefault keeps the focus where it was - in a palette field, which would then take Ctrl+Z
    releaseFocus();
    // Every move of *this* pointer, and its release, come to the canvas now - wherever the pointer goes,
    // and whatever the browser says about which buttons are down. The stroke used to end as soon as a
    // move reported no button, which cut it off after its first cell.
    try { this.#view.setPointerCapture(event.pointerId); }
    catch(err) { /* no capture to be had: the stroke still runs, it just ends with the release */ }
    const cell = this.#cellAt(event);
    this.#stroke = {id: event.pointerId, erase: event.altKey, rect: event.ctrlKey || event.metaKey,
      start: cell, last: cell, cells: new Map()};
    this.#extend(cell);
  }

  #pointerMove(event) {
    if ( !this.armed ) return;
    const cell = this.#cellAt(event);
    this.#drawCursor(cell, event.altKey || this.#stroke?.erase);
    // Only the pointer that began the stroke grows it; a second one (a touch, a pen) is not part of it
    if ( !this.#stroke || (event.pointerId !== this.#stroke.id) ) return;
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

  /** The release of the pointer that drew the stroke - or its cancellation (the browser took it away). */
  async #pointerUp(event) {
    if ( !this.#stroke || (event.pointerId !== this.#stroke.id) ) return;
    const stroke = this.#stroke;
    this.#stroke = null;
    event.stopImmediatePropagation();
    this.#preview?.clear();
    await this.#apply(canvas.scene, [...stroke.cells.values()], stroke.erase);
  }

  /* -------------------------------------------- */
  /*  Strokes, undo                               */
  /* -------------------------------------------- */

  /**
   * One stroke of the brush: what it changes of the two states is written, baked and remembered as *one*
   * undo entry, because a floor is both of them (floor-model.mjs) - and the tiles it takes the cells'
   * slot from are part of that same entry.
   * @param {Scene} scene
   * @param {{col: number, row: number}[]} cells
   * @param {boolean} erase  make the cells solid again
   */
  #apply(scene, cells, erase) {
    return this.#run(async () => {
      const stored = readCarve(scene.getFlag(MODULE_ID, "carve"));
      const texture = this.settings.src
        ? {src: this.settings.src, repeat: this.settings.repeat, blocks: blocksFor(this.settings.kind)} : null;
      const out = floorStroke({paint: readState(scene.getFlag(MODULE_ID, "paint")), carve: stored}, cells,
        {texture, erase});
      // The slot: this stroke says what its cells are, so the painter's own floors and walls in them go
      // (slot-model.mjs) - painting, so that nothing opaque is left over what it paints, and erasing,
      // because a stamped floor sits *above* the material and would otherwise stay in plain sight on a
      // cell that is solid rock again. The painted floor is a different matter and stays either way: it
      // is not a document, nothing can be in its way, and it shows again as soon as the cells are opened.
      // The one stroke that claims nothing is *Open only* (no texture, not erasing): it means "show what
      // is below here", and a stamped floor above those cells is already what is there.
      const replaced = (texture || erase) ? replacedIn(scene, cells) : [];
      if ( !out.paint && !out.carve && !replaced.length ) return;
      if ( out.paint ) await saveState(scene, out.paint.state);
      if ( out.carve ) await saveCarve(scene, out.carve.state);
      // isUndo: these tiles are this stroke's to put back (undo below), not Foundry's
      if ( replaced.length ) await scene.deleteEmbeddedDocuments("Tile", replaced.map(t => t._id), {isUndo: true});
      this.#undo = [...this.#undo, {sceneId: scene.id, paint: out.paint?.changes, carve: out.carve?.changes,
        tiles: replaced, history: tileHistory()}].slice(-UNDO_DEPTH);
      // The rock's bake sees the stamped ways as open too, or this stroke would fill them in again
      if ( out.paint ) await bake(scene, out.paint.state, touchedChunks(out.paint.changes));
      if ( out.carve ) await bakeOpenedRock(scene, out.carve.state, stored);
      if ( out.paint ) await syncPaintWalls(scene, out.paint.state);
      if ( out.carve ) await syncCarveWalls(scene, out.carve.state);
      announceReplaced(replaced.length);
      this.onChange();
    });
  }

  /**
   * Fill the world with material, or change the material it is filled with: the whole scene is covered, and
   * floor strokes open it again. An action rather than a mode - the material is picked for the world, and
   * no stroke adopts it by accident.
   * @param {Scene} scene
   * @param {{src: string|null, repeat: number, blocks: boolean}} material
   */
  fillWorld(scene, material) {
    return this.#run(async () => {
      const stored = readCarve(scene.getFlag(MODULE_ID, "carve"));
      const state = stored
        ? {...stored, rock: {src: material.src, repeat: Math.max(1, material.repeat)}, blocks: material.blocks}
        : newCarve(material);
      await saveCarve(scene, state);
      this.#undo = [...this.#undo, {sceneId: scene.id, kind: "world", before: stored,
        history: tileHistory()}].slice(-UNDO_DEPTH);
      // Every chunk's digest changes with the material, so the whole layer is baked again by itself
      await bakeOpenedRock(scene, state, stored);
      await syncCarveWalls(scene, state);
      this.onChange();
    });
  }

  /** Take the last stroke on this scene back. */
  undo() {
    const scene = canvas.scene;
    const index = this.#undo.findLastIndex(u => u.sceneId === scene?.id);
    if ( index < 0 ) return;
    const [entry] = this.#undo.splice(index, 1);
    if ( entry.kind === "world" ) return this.#undoWorld(scene, entry);
    return this.#run(async () => {
      const paintState = entry.paint ? revert(readState(scene.getFlag(MODULE_ID, "paint")), entry.paint) : null;
      const current = readCarve(scene.getFlag(MODULE_ID, "carve"));
      const carveState = (entry.carve && current) ? revertCarve(current, entry.carve) : null;
      if ( paintState ) await saveState(scene, paintState);
      if ( carveState ) await saveCarve(scene, carveState);
      // The tiles the stroke took the cells' slot from come back under their own ids, so the walls they
      // own and the ways they keep open in the material are the same ones again (the createTile hook,
      // map-painter.mjs). isUndo keeps both halves of the pair out of Foundry's own tile history.
      if ( entry.tiles?.length ) {
        await scene.createEmbeddedDocuments("Tile", entry.tiles, {keepId: true, isUndo: true});
      }
      if ( paintState ) await bake(scene, paintState, touchedChunks(entry.paint));
      if ( carveState ) await bakeOpenedRock(scene, carveState, current);
      if ( paintState ) await syncPaintWalls(scene, paintState);
      if ( carveState ) await syncCarveWalls(scene, carveState);
      this.onChange();
    });
  }

  /** Filling the world back out: the first fill on a scene takes the whole layer with it. */
  #undoWorld(scene, entry) {
    return this.#run(async () => {
      if ( !entry.before ) return removeRock(scene);
      const current = readCarve(scene.getFlag(MODULE_ID, "carve")) ?? entry.before;
      const state = {...current, rock: entry.before.rock, blocks: entry.before.blocks};
      await saveCarve(scene, state);
      await bakeOpenedRock(scene, state, current);
      await syncCarveWalls(scene, state);
      this.onChange();
    });
  }

  /** Remove the scene's rock layer: its tiles, its walls, the flag. */
  removeRock(scene = canvas.scene) {
    this.#undo = this.#undo.filter(u => !((u.sceneId === scene.id) && (u.kind === "world")));
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
    if ( !this.armed || typingIn(event.target) ) return;
    const handled = () => { event.preventDefault(); event.stopPropagation(); };
    if ( event.key === "Escape" ) { handled(); return this.disarm(); }
    // By the letter, not the key position (Foundry's KeyZ is the Y key on a German keyboard)
    if ( (event.key?.toLowerCase() === "z") && (event.ctrlKey || event.metaKey) && !event.shiftKey ) {
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

  /** The stroke so far: the floor texture at its scale, half see-through. */
  #drawPreview() {
    const g = this.#preview;
    if ( !g || !this.#stroke ) return;
    const size = canvas.grid.size;
    g.clear();
    // Solid again: black where there is material to fill back in, red where the floor itself is erased
    if ( this.#stroke.erase ) g.beginFill(hasRock(canvas.scene) ? 0x000000 : 0xd04040, 0.6);
    // No texture: the stroke opens the rock and leaves the floor below, so green rather than a fill
    else if ( !this.#texture ) g.beginFill(0x40c080, 0.35);
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

/** Whether the world is filled with material, so a stroke has rock to open. */
function hasRock(scene) {
  return !!scene?.getFlag(MODULE_ID, "carve");
}

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
  const {ForcedDeletion} = foundry.data.operators;
  await scene.update({[`flags.${MODULE_ID}.carve`]: new ForcedDeletion()});
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
 * @param {(chunk: {cx, cy}) => object} [layer.note]  further flags for the tile: what the image was made
 *   from, so the next bake can tell whether it is still current
 * @param {string[]} chunks  "cx,cy"
 */
async function bakeLayer(scene, {flag, prefix, sort, draw, note}, chunks) {
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
    // A refused upload answers false and has put the server's reason on screen already (FilePicker.upload
    // notifies whatever `notify` says). Without the image there is nothing to show, so the stroke fails
    // here rather than pointing a tile at a file that was never written.
    if ( !result?.path ) throw new Error(_loc("DEWARIM_MAP.UploadFailed", {name}));
    // A new query string per bake: the same file name, but every client loads the new image
    const src = `${result.path}?v=${Date.now()}`;
    const data = {
      x: ox + (px / 2), y: oy + (px / 2), width: px, height: px, rotation: 0, sort, locked: true,
      texture: {src, anchorX: 0.5, anchorY: 0.5, scaleX: 1, scaleY: 1},
      flags: {[MODULE_ID]: {[flag]: key, ...note?.({cx, cy})}}
    };
    if ( tile ) update.push({_id: tile.id, ...data});
    else create.push(foundry.utils.mergeObject(tileDefaults(), data));
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
  return bakeLayer(scene, {flag: "rock", prefix: "rock", sort: ROCK_SORT,
    note: chunk => ({baked: rockDigest(state, chunk, range)}),
    draw: async (ctx, chunk, {ox, oy}) => {
      const {rock, holes} = chunkRock(state, chunk, range);
      if ( !rock ) return false;
      const source = state.rock.src ? await image(state.rock.src) : null;
      ctx.fillStyle = source ? gridPattern(ctx, source, state.rock.repeat, size, ox, oy) : "#000000";
      ctx.fillRect(rock.col * size, rock.row * size, rock.width * size, rock.height * size);
      for ( const h of holes ) ctx.clearRect(h.col * size, h.row * size, size, size);
      return true;
    }}, chunks);
}

/* -------------------------------------------- */
/*  Ways stamped through the rock               */
/* -------------------------------------------- */

/** Rock bakes run one after another: a carve stroke and a stamped way must not upload one chunk at once. */
let rockChain = Promise.resolve();
function queuedRock(task) {
  const result = rockChain.then(task);
  rockChain = result.catch(() => {});   // the chain carries on; the failure goes to whoever asked
  return result;
}

/**
 * The chunks whose baked image is not what the state asks for - those, and only those, are baked. Read from
 * the tiles rather than from what changed, so a stroke, a stamp, a reload and a second GM all agree.
 */
function staleRock(scene, state) {
  const range = sceneCells(scene.dimensions.sceneRect, scene.grid.size);
  const tiles = new Map(scene.tiles.filter(t => t.getFlag(MODULE_ID, "rock"))
    .map(t => [t.getFlag(MODULE_ID, "rock"), t]));
  return rockChunks(range).filter(key => {
    const {col: cx, row: cy} = parseKey(key);
    return rockDigest(state, {cx, cy}, range) !== (tiles.get(key)?.getFlag(MODULE_ID, "baked") ?? null);
  });
}

/**
 * Rock baked before this module recorded what went into an image: there was no way stamped through it
 * then, so the image is the stored state - which is written down rather than baked again. (A bake that
 * failed half way back then is taken at its word here; it said so at the time.)
 */
async function adoptRock(scene, state) {
  if ( !state ) return;   // no rock on the scene before this: no image to take at its word
  const range = sceneCells(scene.dimensions.sceneRect, scene.grid.size);
  const updates = [];
  for ( const tile of scene.tiles ) {
    const key = tile.getFlag(MODULE_ID, "rock");
    if ( !key || (tile.getFlag(MODULE_ID, "baked") !== undefined) ) continue;
    const {col: cx, row: cy} = parseKey(key);
    const digest = rockDigest(state, {cx, cy}, range);
    // No rock in that chunk any more (a scene made smaller): leave it undigested, so the bake removes it
    if ( digest !== null ) updates.push({_id: tile.id, [`flags.${MODULE_ID}.baked`]: digest});
  }
  if ( updates.length ) await scene.updateEmbeddedDocuments("Tile", updates, {isUndo: true});
}

/**
 * Bake a scene's rock from `state`, with the stamped ways counted as carved open.
 * @param {object} [was]  the state the images on the scene were baked from, when it is not `state` itself:
 *   a stroke changes the state, and what is on the scene is still the rock from before it.
 */
function bakeOpenedRock(scene, state, was = state) {
  return queuedRock(async () => {
    await adoptRock(scene, was);
    const opened = openedCarve(scene, state);
    return bakeRock(scene, opened, staleRock(scene, opened));
  });
}

/**
 * A tile that opens the rock arrived, moved or went: cut the rock where the ways are now and run the rock's
 * walls along what is left. Debounced - a drag places a dozen tiles in one operation and every one of them
 * fires its own hook, while only the end state matters, and that is read from the scene rather than from
 * the hook, so it does not matter which of them gets here.
 */
let soon = null;
export function syncOpenings(scene) {
  if ( !scene?.getFlag(MODULE_ID, "carve") ) return;   // no rock on this scene: nothing to cut or wall off
  soon ??= foundry.utils.debounce(s => {
    const state = readCarve(s.getFlag(MODULE_ID, "carve"));
    if ( !state ) return;
    bakeOpenedRock(s, state).catch(err => {
      console.error(`${MODULE_ID} | rock`, err);
      ui.notifications.error(`${_loc("DEWARIM_MAP.PaintFailed")}: ${err.message}`);
    });
    syncCarveWalls(s, state);
  }, 50);
  soon(scene);
}

/** Whether a key goes into a text field (which keeps its own Ctrl+Z) - not a checkbox or a button. */
function typingIn(target) {
  if ( target?.isContentEditable || target?.closest?.("textarea, select") ) return true;
  return (target?.tagName === "INPUT") && !["checkbox", "radio", "button", "range", "color"].includes(target.type);
}

/** A stroke on the canvas: take the focus out of whatever form field had it. */
function releaseFocus() {
  const active = document.activeElement;
  if ( active && (active !== document.body) && active.closest?.("input, textarea, select, button") ) active.blur();
}
