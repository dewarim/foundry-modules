# Dewarim: Map Painter

**Requires:** nothing beyond Foundry v14 — system-agnostic.

Build scenes from a palette of images instead of drawing tile rectangles by hand.

- **Palette**: images from a few folders - by default `assets/props` and `assets/textures` in user data
  (created on request) and Foundry's own `icons/environment` (trees, rocks, ruins …). Add or remove
  folders, browse subfolders, filter by name; the last used images sit on top. A module can add its
  own folders: `"flags": {"dewarim-map-painter": {"roots": [{"path": "modules/<id>/assets", "label": "…"}]}}`
  in its `module.json` - they are listed while that module is active.
- **Stamps**: pick an image - a ghost follows the mouse, snapped to the grid. Click places a tile, a drag
  places a row (one per cell, all created when you let go). Size in grid cells (`[` `]`), rotation
  (`R`, `Shift+R`), mirror (`F`), random rotation for rocks and trees; Shift places without the grid.
  Right-drag still pans the map, the wheel zooms. Escape puts the stamp away.
- **Undo**: Ctrl+Z or the button - Foundry's own tile undo, so a stamp stroke comes back in order with
  everything else done to tiles (a tile deleted with Delete included), with or without a stamp picked.
- **Brush** (mode *Paint*, square grids): paint whole grid cells with a repeating texture - drag paints
  (brush size `[` `]`), Ctrl+drag fills a rectangle, Alt+drag erases, Ctrl+Z takes a stroke back (unless a newer tile change is in Foundry's undo, e.g. a tile deleted with Delete - that one comes back first). "Texture
  repeats every N cells" sets its scale. The cells are kept on the scene; each 16×16-cell chunk with paint
  is baked into one image under `worlds/<world>/map-painter/<scene>/` and shown as a locked tile below all
  other tiles, so stamped props stay on top. Chunks meet without seams.
- New tiles take Foundry's own defaults from the Tiles palette (elevation, level, opacity).

Open it from the paintbrush among the **Tiles** tools, with Shift+Alt+M, or
`game.modules.get("dewarim-map-painter").api.open()`. GM only.

- **Blocks view**: tick *Blocks view (walls)* for the picked image (remembered per image for the world;
  marked with a brick icon in the palette). Stamped, each tile gets four walls along its outline - they
  move, resize, turn, delete and undo with the tile. Painted, the blocking cells get walls along their
  outline, merged into straight runs, recomputed with each stroke, erase and undo. Normal Foundry walls
  (sight, light, sound, movement). `game.modules.get("dewarim-map-painter").api.rebuildWalls()` rebuilds
  them for the viewed scene.

- **Carve** (mode *Carve*, square grids): for dungeon maps - the scene is covered in rock (*Black rock*,
  or a picked texture as rock), and the brush carves tunnels and caves into it: drag carves, Ctrl+drag
  carves a rectangle, Alt+drag fills rock back in, Ctrl+Z takes a stroke back. Carved cells show what is
  below - the painted floor or the scene's background. With *Rock blocks view* (on by default) walls run
  along the edges of the carved area. The rock is baked like the paint, as tiles just above it and below
  every prop; *Remove the rock layer* takes it away again.
