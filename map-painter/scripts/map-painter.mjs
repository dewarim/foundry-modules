// dewarim-map-painter: build scenes from a palette of images instead of drawing tile rectangles by hand.
// Stamps (pick an image, click or drag on the canvas, tiles snap to the grid) and a texture brush (paint
// grid cells, baked into chunk tiles). Generic: no system-specific code. Later steps (ROADMAP.md): walls
// for "blocks view" textures, carving dungeon maps.
import {movesWalls, rebuildWalls, removeTileWalls, syncTileWalls} from "./blocking.mjs";
import {MODULE_ID, PaletteApp} from "./palette-app.mjs";

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
  // Images that block view: stamped or painted, they bring walls along (blocking.mjs)
  game.settings.register(MODULE_ID, "blocking", {scope: "world", config: false, type: Array, default: []});
  game.keybindings.register(MODULE_ID, "open", {
    name: "DEWARIM_MAP.Open",
    editable: [{key: "KeyM", modifiers: ["Shift", "Alt"]}],
    restricted: true,
    onDown: () => { open(); return true; }
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {open, rebuildWalls};
});

// A button among the Tiles tools, next to Foundry's own tile browser
Hooks.on("getSceneControlButtons", controls => {
  const tiles = controls.tiles;
  if ( !tiles?.tools ) return;
  tiles.tools.dewarimMapPainter = {
    name: "dewarimMapPainter",
    title: "DEWARIM_MAP.Title",
    icon: "fa-solid fa-paintbrush",
    order: 3.5,
    button: true,
    visible: game.user.isGM,
    onChange: () => open()
  };
});

// A scene change leaves the ghost (or the brush outline) on the old canvas: disarm
Hooks.on("canvasTearDown", () => app?.disarmAll());

// The walls of blocking tiles follow the tile - whoever changed the tile updates them (once, not on every
// client). Foundry's undo of a stroke deletes the tile, its undo of a deletion creates it again: both land here.
Hooks.on("createTile", (tile, options, userId) => {
  if ( (userId === game.user.id) && tile.getFlag(MODULE_ID, "blocks") ) syncTileWalls(tile);
});
Hooks.on("updateTile", (tile, changed, options, userId) => {
  if ( (userId === game.user.id) && movesWalls(changed) ) syncTileWalls(tile);
});
Hooks.on("deleteTile", (tile, options, userId) => {
  if ( (userId === game.user.id) && tile.getFlag(MODULE_ID, "blocks") ) removeTileWalls(tile.parent, tile.id);
});
