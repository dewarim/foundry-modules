// The stamp tool on the canvas: while armed, a ghost of the image follows the pointer (snapped to the
// grid), a click places a tile, a drag places a row of them - created in one call when the button is
// released. Right-drag still pans, the wheel still zooms. Escape disarms. A stroke is one creation in
// Foundry's own tile history, so Ctrl+Z (Foundry's tile undo, caught by the letter so it works on any
// keyboard layout) takes it back - in order with everything else done to tiles, a deleted tile included.
//
// What a stroke places is the mode's business, not the tool's: a floor, a wall or a prop (slot-model.mjs).
// The first two take the cell's one slot, so they carry the hole they keep open in the material, sit in the
// slot's sort band and replace the painter's own floors and walls where they land; a prop lies above all of
// it and replaces nothing. The kind is written on every tile, because a stroke that cannot tell a stamped
// floor from a chest cannot replace anything.
import {releaseCanvas, takeCanvas} from "./canvas-tool.mjs";
import {cellAt, cellsBetween, centeredOrigin, freeForStamp, stampSize, tileCells, tileData} from "./stamp-model.mjs";
import {KIND, blocksFor, sortFor, takesSlot} from "./slot-model.mjs";
import {announceReplaced, replacedIn} from "./slot.mjs";

const MODULE_ID = "dewarim-map-painter";

export class StampTool {
  /**
   * @param {{onChange?: () => void}} [options]  onChange: armed state or settings changed (re-render the palette)
   */
  constructor({onChange} = {}) {
    this.onChange = onChange ?? (() => {});
    // aspect: the image's width / height, read when its texture loads - a stamp keeps its proportions.
    // kind: what the mode says this stroke places (slot-model.mjs) - a floor or a wall, which take the
    // cell's one slot and therefore replace what is in it, or a prop, which lies above it and replaces
    // nothing. blocks: whether a *prop* blocks view (a pillar, a pile of rocks); a wall always does and a
    // floor never, so the checkbox is only asked about props.
    this.stamp = {src: null, cells: 1, rotation: 0, flip: false, randomRotation: false, snap: true, aspect: 1,
      kind: KIND.PROP, blocks: false};
    this.#onPointerDown = this.#pointerDown.bind(this);
    this.#onPointerMove = this.#pointerMove.bind(this);
    this.#onPointerUp = this.#pointerUp.bind(this);
    this.#onKey = this.#key.bind(this);
  }

  #onPointerDown;
  #onPointerMove;
  #onPointerUp;
  #onKey;
  /** The ghost sprite, and the sprites of a stroke in progress */
  #ghost = null;
  #pending = [];
  /** Stroke in progress: the pointer drawing it, the placed cells and their tile data */
  #stroke = null;

  get armed() {
    return !!this.stamp.src && !!this.#view;
  }

  /** Foundry's tile history: the undo button takes back what Ctrl+Z would */
  get canUndo() {
    return !!canvas.tiles?.history?.length;
  }

  get #view() {
    return this.#listening ? (canvas.app?.canvas ?? canvas.app?.view) : null;
  }

  #listening = false;

  /** Arm with an image (or change the image while armed). */
  async arm(src) {
    if ( !canvas.ready || !canvas.scene ) return ui.notifications.warn("DEWARIM_MAP.NoScene", {localize: true});
    this.stamp.src = src;
    if ( !this.#listening ) {
      const view = canvas.app.canvas ?? canvas.app.view;
      view.addEventListener("pointerdown", this.#onPointerDown, true);
      view.addEventListener("pointermove", this.#onPointerMove, true);
      window.addEventListener("pointerup", this.#onPointerUp, true);
      window.addEventListener("pointercancel", this.#onPointerUp, true);
      document.addEventListener("keydown", this.#onKey, true);
      this.#listening = true;
      // Tiles are what we make, so their layer shows them - and a drag on it is the stamp's alone while
      // it is armed, not also Foundry's tile tool's (canvas-tool.mjs)
      takeCanvas();
    }
    await this.#makeGhost();
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
    this.#clearSprites();
    this.#stroke = null;
    this.stamp.src = null;
    this.onChange();
    // Last: handing the tool back comes round to disarmAll(), and by then there is nothing left to disarm
    if ( was ) releaseCanvas();
  }

  /** Change size, rotation, flip ... and redraw the ghost. */
  async set(change) {
    Object.assign(this.stamp, change);
    if ( this.armed ) await this.#makeGhost();
    this.onChange();
  }

  /* -------------------------------------------- */
  /*  Pointer                                     */
  /* -------------------------------------------- */

  #point(event) {
    return canvas.canvasCoordinatesFromClient({x: event.clientX, y: event.clientY});
  }

  /** Whether the stamp snaps: the setting, Shift inverts it; a gridless scene never does. */
  #snaps(event) {
    return !canvas.grid.isGridless && (this.stamp.snap !== event.shiftKey);
  }

  /** Top-left corner for the stamp at a point, and the grid cell it starts in (null without snapping). */
  #placeAt(point, snap) {
    const size = canvas.grid.size;
    if ( !snap ) return {origin: centeredOrigin(point, this.stamp.cells, size), cell: null};
    // The stamp's block is centered on the pointer's cell (an even size leans up-left)
    const shift = Math.floor((this.stamp.cells - 1) / 2);
    const at = cellAt(point, size);
    const cell = {col: at.col - shift, row: at.row - shift};
    if ( canvas.grid.isSquare ) return {origin: {x: cell.col * size, y: cell.row * size}, cell};
    // Hex: snap the stamp's center to the nearest cell center
    const center = canvas.grid.getSnappedPoint(point, {mode: CONST.GRID_SNAPPING_MODES.CENTER});
    return {origin: centeredOrigin(center, this.stamp.cells, size), cell: at};
  }

  #pointerDown(event) {
    if ( (event.button !== 0) || !this.armed ) return;
    // Clicks on the canvas only - not on a window or the HUD above it
    if ( event.target !== (canvas.app.canvas ?? canvas.app.view) ) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    // preventDefault keeps the focus where it was - in a palette field, which would then take Ctrl+Z
    releaseFocus();
    // Every move of *this* pointer and its release come to the canvas now, whatever the browser says
    // about which buttons are down - a move that reported none used to end the stroke after one stamp
    try { (canvas.app.canvas ?? canvas.app.view).setPointerCapture(event.pointerId); }
    catch(err) { /* no capture to be had: the stroke still runs, it just ends with the release */ }
    const snap = this.#snaps(event);
    this.#stroke = {id: event.pointerId, snap, cells: [], last: null, tiles: []};
    this.#addAt(this.#point(event), snap);
  }

  #pointerMove(event) {
    if ( !this.armed ) return;
    const point = this.#point(event);
    const {origin} = this.#placeAt(point, this.#stroke?.snap ?? this.#snaps(event));
    if ( this.#ghost ) this.#position(this.#ghost, origin);
    // Only the pointer that began the stroke grows it; a second one (a touch, a pen) is not part of it
    if ( !this.#stroke || (event.pointerId !== this.#stroke.id) ) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    this.#addAt(point, this.#stroke.snap);
  }

  /** Add a stamp to the stroke at a point - snapped: also every cell between it and the last one. */
  #addAt(point, snap) {
    const stroke = this.#stroke;
    const {origin, cell} = this.#placeAt(point, snap);
    if ( !snap || !cell ) {
      // Without the grid a drag would place hundreds: one stamp per click
      if ( !stroke.tiles.length ) this.#queue(origin);
      return;
    }
    const cells = stroke.last ? cellsBetween(stroke.last, cell).slice(1) : [cell];
    for ( const c of cells ) {
      if ( !freeForStamp(stroke.cells, c, this.stamp.cells) ) continue;
      stroke.cells.push(c);
      this.#queue(canvas.grid.isSquare ? {x: c.col * canvas.grid.size, y: c.row * canvas.grid.size} : origin);
    }
    stroke.last = cell;
  }

  /** One more tile for the stroke, shown as a ghost until the stroke ends. */
  #queue(origin) {
    const rotation = this.stamp.randomRotation ? Math.floor(Math.random() * 360) : this.stamp.rotation;
    this.#stroke.tiles.push(tileData({...this.stamp, rotation}, origin, canvas.grid.size));
    if ( this.#ghost ) {
      const sprite = new PIXI.Sprite(this.#ghost.texture);
      this.#style(sprite, rotation);
      this.#position(sprite, origin);
      sprite.alpha = 0.8;
      canvas.controls.addChild(sprite);
      this.#pending.push(sprite);
    }
  }

  /** The release of the pointer that placed the stroke - or its cancellation. */
  async #pointerUp(event) {
    if ( !this.#stroke || (event.pointerId !== this.#stroke.id) ) return;
    const stroke = this.#stroke;
    this.#stroke = null;
    event.stopImmediatePropagation();
    for ( const s of this.#pending.splice(0) ) s.destroy();
    if ( !stroke.tiles.length || !canvas.scene ) return;
    const scene = canvas.scene;
    const kind = this.stamp.kind;
    const defaults = tileDefaults();
    // What the tile is, so a later stroke can tell a stamped floor from a chest (slot-model.mjs)
    const flags = {kind};
    // Blocking: each tile brings its four walls (the createTile hook, blocking.mjs)
    if ( blocksFor(kind, this.stamp.blocks) ) flags.blocks = true;
    // A floor or a wall *is* its cells, so on a world filled with material it takes the material's place:
    // the tile carries the hole it keeps open in the rock, and the rock's walls follow the new border. The
    // flag stays with the tile, so the way closes again when the tile goes.
    if ( takesSlot(kind) ) flags.opens = true;
    foundry.utils.setProperty(defaults, `flags.${MODULE_ID}`, flags);
    // ... and it sits in the slot's own sort band, over the material and under every prop. A prop keeps
    // Foundry's own default, among the tiles the GM places by hand.
    const sort = sortFor(kind);
    if ( sort !== null ) defaults.sort = sort;
    // The slot: the cells a floor or a wall takes are its alone, so the painter's own floors and walls
    // there go - and they go *first*, which is also what puts the two entries in Foundry's tile history in
    // the right order: Ctrl+Z takes these new tiles back, a second one brings the replaced ones again.
    const replaced = takesSlot(kind)
      ? replacedIn(scene, stroke.tiles.flatMap(t => tileCells(t, scene.grid.size))) : [];
    if ( replaced.length ) await scene.deleteEmbeddedDocuments("Tile", replaced.map(t => t._id));
    await scene.createEmbeddedDocuments("Tile",
      stroke.tiles.map(t => foundry.utils.mergeObject(foundry.utils.deepClone(defaults), t)));
    announceReplaced(replaced.length);
    this.onChange();
  }

  /* -------------------------------------------- */
  /*  Keys                                        */
  /* -------------------------------------------- */

  #key(event) {
    if ( !this.armed || typingIn(event.target) ) return;
    const handled = () => { event.preventDefault(); event.stopPropagation(); };
    if ( event.key === "Escape" ) { handled(); return this.disarm(); }
    // Foundry's own Ctrl+Z goes by key position (KeyZ) - on a German keyboard that is the Y key. By the
    // letter instead, so Strg+Z undoes on any layout; it is still Foundry's tile undo.
    if ( (event.key?.toLowerCase() === "z") && (event.ctrlKey || event.metaKey) && !event.shiftKey ) { handled(); return this.undo(); }
    if ( event.ctrlKey || event.metaKey || event.altKey ) return;
    switch ( event.key ) {
      case "[": handled(); return this.set({cells: Math.max(1, this.stamp.cells - 1)});
      case "]": handled(); return this.set({cells: Math.min(10, this.stamp.cells + 1)});
      case "r": handled(); return this.set({rotation: (this.stamp.rotation + 90) % 360});
      case "R": handled(); return this.set({rotation: (this.stamp.rotation + 270) % 360});
      case "f": case "F": handled(); return this.set({flip: !this.stamp.flip});
    }
  }

  /** Foundry's own undo of the last tile change on this scene (a stroke, or anything else). */
  async undo() {
    await canvas.tiles?.undoHistory();
    this.onChange();
  }

  /* -------------------------------------------- */
  /*  Sprites                                     */
  /* -------------------------------------------- */

  async #makeGhost() {
    this.#clearSprites();
    const texture = await foundry.canvas.loadTexture(this.stamp.src);
    if ( !texture || !this.#listening ) return;
    this.stamp.aspect = texture.width / texture.height;
    this.#ghost = new PIXI.Sprite(texture);
    this.#ghost.alpha = 0.5;
    this.#style(this.#ghost, this.stamp.rotation);
    this.#ghost.visible = false;   // until the pointer moves over the canvas
    canvas.controls.addChild(this.#ghost);
  }

  /** Size, rotation and mirroring as the tile will have them (rotation around the center). */
  #style(sprite, rotation) {
    const {width, height} = stampSize(this.stamp.cells * canvas.grid.size, this.stamp.aspect);
    sprite.anchor.set(0.5, 0.5);
    sprite.width = width;
    sprite.height = height;
    if ( this.stamp.flip ) sprite.scale.x = -Math.abs(sprite.scale.x);
    sprite.angle = rotation;
  }

  #position(sprite, origin) {
    const half = (this.stamp.cells * canvas.grid.size) / 2;
    sprite.position.set(origin.x + half, origin.y + half);
    sprite.visible = true;
  }

  #clearSprites() {
    this.#ghost?.destroy();
    this.#ghost = null;
    for ( const s of this.#pending.splice(0) ) s.destroy();
  }
}

/**
 * Foundry's own defaults for new tiles (the Tiles palette: elevation, level, opacity ...), without what
 * a stamp decides itself.
 */
export function tileDefaults() {
  let defaults = {};
  try {
    defaults = foundry.utils.deepClone(game.settings.get("core", "tilePalette") ?? {});
  } catch {}
  for ( const key of ["x", "y", "width", "height", "rotation", "_id", "sort"] ) delete defaults[key];
  if ( defaults.texture ) delete defaults.texture.src;
  return defaults;
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
