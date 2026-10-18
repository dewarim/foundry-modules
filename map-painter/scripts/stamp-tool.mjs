// The stamp tool on the canvas: while armed, a ghost of the image follows the pointer (snapped to the
// grid), a click places a tile, a drag places a row of them - created in one call when the button is
// released. Right-drag still pans, the wheel still zooms. Escape disarms. A stroke is one creation in
// Foundry's own tile history, so Ctrl+Z (Foundry's undo) takes it back - in order with everything else
// done to tiles, a tile deleted with the Delete key included.
import {isBlocking} from "./blocking.mjs";
import {cellAt, cellsBetween, centeredOrigin, freeForStamp, stampSize, tileData} from "./stamp-model.mjs";

export class StampTool {
  /**
   * @param {{onChange?: () => void}} [options]  onChange: armed state or settings changed (re-render the palette)
   */
  constructor({onChange} = {}) {
    this.onChange = onChange ?? (() => {});
    // aspect: the image's width / height, read when its texture loads - a stamp keeps its proportions
    this.stamp = {src: null, cells: 1, rotation: 0, flip: false, randomRotation: false, snap: true, aspect: 1};
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
  /** Stroke in progress: placed cells and tile data */
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
      document.addEventListener("keydown", this.#onKey, true);
      this.#listening = true;
      // Tiles are what we make: their layer shows them (and Foundry's own tile tools stay at hand)
      canvas.tiles?.activate();
    }
    await this.#makeGhost();
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
    this.#clearSprites();
    this.#stroke = null;
    this.stamp.src = null;
    this.onChange();
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
    // Before Foundry's own canvas handlers on the same element: no selection box, no deselect
    event.stopImmediatePropagation();
    event.preventDefault();
    const snap = this.#snaps(event);
    this.#stroke = {snap, cells: [], last: null, tiles: []};
    this.#addAt(this.#point(event), snap);
  }

  #pointerMove(event) {
    if ( !this.armed ) return;
    const point = this.#point(event);
    const {origin} = this.#placeAt(point, this.#stroke?.snap ?? this.#snaps(event));
    if ( this.#ghost ) this.#position(this.#ghost, origin);
    if ( !this.#stroke ) return;
    // Without the left button down the stroke is over (a release that never arrived, another pointer)
    if ( !(event.buttons & 1) ) return this.#pointerUp(event);
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

  async #pointerUp(event) {
    if ( !this.#stroke ) return;
    const stroke = this.#stroke;
    this.#stroke = null;
    event.stopImmediatePropagation();
    for ( const s of this.#pending.splice(0) ) s.destroy();
    if ( !stroke.tiles.length || !canvas.scene ) return;
    const defaults = tileDefaults();
    // A blocking image: each tile brings its walls (the createTile hook, blocking.mjs)
    if ( isBlocking(this.stamp.src) ) foundry.utils.setProperty(defaults, "flags.dewarim-map-painter.blocks", true);
    await canvas.scene.createEmbeddedDocuments("Tile",
      stroke.tiles.map(t => foundry.utils.mergeObject(foundry.utils.deepClone(defaults), t)));
    this.onChange();
  }

  /* -------------------------------------------- */
  /*  Keys                                        */
  /* -------------------------------------------- */

  #key(event) {
    if ( !this.armed || event.target.closest?.("input, textarea, select, [contenteditable]") ) return;
    const handled = () => { event.preventDefault(); event.stopPropagation(); };
    if ( event.key === "Escape" ) { handled(); return this.disarm(); }
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
