// What blocks sight, drawn on the canvas while the palette is open. Checking that meant switching to
// Foundry's Walls layer, which deactivates the painter's tool and so disarms the palette (canvas-tool.mjs):
// the module made you leave in order to look, and then punished you for having left.
//
// It draws *every* wall of the scene, not only the painter's own. An overlay showing some of the walls
// would be a lie about sight - a wall drawn by hand where the GM sees nothing reads as "nothing blocks
// here". So: the painter's own walls (flags `tile`, `paint`, `carve` - blocking.mjs) in one colour,
// everything else in grey, and whatever does not stop senses at all (sight NONE, e.g. a wall that only
// blocks movement) faint, because it does not answer the question being asked.
//
// Read-only and derived: it is drawn from the scene's walls, so it cannot drift from what actually blocks.
const MODULE_ID = "dewarim-map-painter";
const OURS = 0xffa030;
const FOREIGN = 0xb0b0b0;

/** The graphics in canvas.controls, or null while nothing is shown. */
let layer = null;

/** Show the walls (and redraw them). Called whenever the palette renders. */
export function showWalls() {
  if ( !canvas.ready ) return;
  if ( !layer || layer.destroyed ) layer = canvas.controls.addChild(new PIXI.Graphics());
  draw();
}

/** Put it away: the palette closed, or the canvas is being torn down under it. */
export function hideWalls() {
  if ( layer && !layer.destroyed ) layer.destroy();
  layer = null;
}

/** A wall changed: redraw, but only while something is actually shown. */
export function refreshWalls() {
  if ( layer && !layer.destroyed ) draw();
}

function draw() {
  layer.clear();
  if ( !canvas.scene ) return;
  for ( const wall of canvas.scene.walls ) {
    const ours = !!(wall.getFlag(MODULE_ID, "tile") || wall.getFlag(MODULE_ID, "paint")
      || wall.getFlag(MODULE_ID, "carve"));
    const blocks = wall.sight !== CONST.EDGE_SENSE_TYPES.NONE;
    const [x1, y1, x2, y2] = wall.c;
    layer.lineStyle(blocks ? 6 : 3, ours ? OURS : FOREIGN, blocks ? 0.5 : 0.25)
      .moveTo(x1, y1).lineTo(x2, y2);
  }
}
