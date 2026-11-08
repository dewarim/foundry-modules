// dewarim-map-painter: build scenes from a palette of images instead of drawing tile rectangles by hand.
// Stamps (pick an image, click or drag on the canvas, tiles snap to the grid) and a texture brush (paint
// grid cells, baked into chunk tiles). Generic: no system-specific code. Next step (ROADMAP.md): heights.
import {movesWalls, opensRock, ownsWalls, rebuildWalls, removeTileWalls, syncTileWalls} from "./blocking.mjs";
import {TOOL} from "./canvas-tool.mjs";
import {MODULE_ID, PaletteApp} from "./palette-app.mjs";
import {cleanupTiles, resetScene, undoReset} from "./repair.mjs";
import {syncOpenings} from "./paint-tool.mjs";
import {hideWalls, refreshWalls, showWalls} from "./wall-view.mjs";
import {registerChangelog} from "./shared/changelog.mjs";

// After an install or update, GMs see what changed (CHANGELOG.md)
registerChangelog(MODULE_ID);

let app;

function open() {
  if ( !game.user.isGM ) return;
  app ??= new PaletteApp();
  return app.render({force: true});
}

Hooks.once("init", () => {
  // Root folders of the palette: [{source: "data"|"public", path}]; empty = the defaults
  game.settings.register(MODULE_ID, "roots", {scope: "world", config: false, type: Array, default: []});
  game.settings.register(MODULE_ID, "recent", {scope: "client", config: false, type: Array, default: []});
  game.settings.register(MODULE_ID, "last", {scope: "client", config: false, type: Object, default: {}});
  game.keybindings.register(MODULE_ID, "open", {
    name: "DEWARIM_MAP.Open",
    editable: [{key: "KeyM", modifiers: ["Shift", "Alt"]}],
    restricted: true,
    onDown: () => { open(); return true; }
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {open, rebuildWalls, cleanupTiles, resetScene, undoReset};
});

// A tool among the Tiles tools, next to Foundry's own tile browser - a tool and not a button, because
// while it is the active one the canvas belongs to the palette alone: it declares neither `creation` nor
// `interaction` nor `control`, so the tiles layer makes nothing of a left drag (canvas-tool.mjs).
Hooks.on("getSceneControlButtons", controls => {
  const tiles = controls.tiles;
  if ( !tiles?.tools ) return;
  tiles.tools[TOOL] = {
    name: TOOL,
    title: "DEWARIM_MAP.Title",
    icon: "fa-solid fa-paintbrush",
    order: 3.5,
    visible: game.user.isGM,
    // Picked up: the palette opens. Put down (the GM takes another tool): nothing stays armed on a
    // canvas that Foundry's tools are reading again.
    onChange: (event, active) => { if ( active ) open(); else app?.disarmAll(); }
  };
});

// A scene change leaves the ghost (or the brush outline) on the old canvas: disarm, and drop the wall
// overlay with it - its graphics belongs to the canvas that is going away.
Hooks.on("canvasTearDown", () => { app?.disarmAll(); hideWalls(); });

// Every wall of the scene is drawn while the palette is open, whoever changed it (wall-view.mjs). The
// painter's own strokes land here too: they write walls like anything else.
for ( const hook of ["createWall", "updateWall", "deleteWall"] ) Hooks.on(hook, () => refreshWalls());

// A scene whose rock was baked before a way was stamped through it - or by a version of this module that
// only moved the walls - still has rock where the ways are. Each rock tile carries what its image was
// baked from, so this costs a string comparison per chunk and bakes only what is actually out of date.
Hooks.on("canvasReady", () => {
  if ( !game.user.isGM ) return;
  syncOpenings(canvas.scene);
  // The palette survives a scene change; its overlay does not, so it is drawn again on the new canvas
  if ( app?.rendered ) showWalls();
});

// The walls of blocking tiles follow the tile - whoever changed the tile updates them (once, not on every
// client). Foundry's undo of a stroke deletes the tile, its undo of a deletion creates it again: both land here.
// A tile that opens the rock takes the rock itself with it the same way (paint-tool.mjs): the baked rock
// is cut where the ways are and the walls run along what is left, so both are redone whenever such a
// tile arrives, moves or goes.
Hooks.on("createTile", (tile, options, userId) => {
  if ( userId !== game.user.id ) return;
  if ( tile.getFlag(MODULE_ID, "blocks") ) syncTileWalls(tile);
  if ( tile.getFlag(MODULE_ID, "opens") ) syncOpenings(tile.parent);
});
Hooks.on("updateTile", (tile, changed, options, userId) => {
  if ( (userId !== game.user.id) || !movesWalls(changed) ) return;
  if ( ownsWalls(tile, changed) ) syncTileWalls(tile);
  if ( opensRock(tile, changed) ) syncOpenings(tile.parent);
});
Hooks.on("deleteTile", (tile, options, userId) => {
  if ( userId !== game.user.id ) return;
  if ( tile.getFlag(MODULE_ID, "blocks") ) removeTileWalls(tile.parent, tile.id);
  // The tile is out of scene.tiles by now (client-backend.mjs deletes the batch before the hooks), so
  // what the rebuild sees is the rock with this hole closed again.
  if ( tile.getFlag(MODULE_ID, "opens") ) syncOpenings(tile.parent);
});
