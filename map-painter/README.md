# Dewarim: Map Painter

**Requires:** nothing beyond Foundry v14 — system-agnostic.

Build scenes from a palette of images instead of drawing tile rectangles by hand.

- **Palette**: images from a few folders - by default `assets/props` and `assets/textures` in user data
  (created on request) and Foundry's own `icons/environment` (trees, rocks, ruins …). Add or remove
  folders, browse subfolders; the last used images sit on top. The search box looks through
  everything *below* the folder you are in, not just that one listing - type `water` at the root of
  a texture module and it finds `liquids/water-deep` and `hatch/water` three folders apart, each
  showing where it came from. Case does not matter, several words all have to match (`web red`),
  the extension is not searched, and folder names count, so `hatch` lists what is in it. A module can add its
  own folders: `"flags": {"dewarim-map-painter": {"roots": [{"path": "modules/<id>/assets", "label": "…"}]}}`
  in its `module.json` - they are listed while that module is active.
- **Three modes, two ways to draw.** The mode says what a stroke *means*: **Floor** (you walk on it and
  see across it), **Wall** (solid: it blocks sight, light, sound and movement, and there is no floor under
  it) or **Prop** (something lying on the floor - a rug, a pile of rocks, a chest). The row below says how
  it is drawn: with the **brush** over grid cells, or **stamped** as a tile. So a floor can be painted or
  stamped, and the mode answers once what used to be a box to tick per stroke. Props are placed one at a
  time, so they have no brush. Both rows carry their question as a label (*What*, *How*), every button
  says what it does when the mouse rests on it, and the *(?)* beside the modes opens all of it - the
  three modes, the two ways to draw and the one-slot rule - in one window.

  **A cell has one floor-or-wall slot, and any number of props above it.** A floor or wall stroke takes
  that slot: the painter's own floors and walls where it draws are deleted first, so nothing opaque is
  left lying over what you just made - and nothing you made is left lying invisible under something else.
  A tile the stroke only touches goes whole, because a tile cannot be cut in half. Props replace nothing;
  what they do not cover still shows. Tiles from before this, and tiles the painter did not make, count as
  props and are never deleted by a stroke. What a stroke replaced is said out loud, and undo brings it
  back.

- **Stamping**: pick an image - a ghost follows the mouse, snapped to the grid. Click places a tile, a drag
  places a row (one per cell, all created when you let go). Size in grid cells (`[` `]`), rotation
  (`R`, `Shift+R`), mirror (`F`), random rotation for rocks and trees; Shift places without the grid.
  Right-drag still pans the map, the wheel zooms. Escape puts the stamp away. A stamped floor or wall sits
  in its own layer, over the material and below every prop.
- **Undo**: Ctrl+Z or the button - Foundry's own tile undo, so a stamp stroke comes back in order with
  everything else done to tiles (a tile deleted with Delete included), with or without a stamp picked. A
  stamped floor or wall that replaced an older one takes two presses: Foundry counts the deletion and the
  new tiles as two changes, and the first press takes the new ones back.
- **The brush** (*Floor* or *Wall*, square grids): paint whole grid cells with a repeating texture - drag
  paints (brush size `[` `]`), Ctrl+drag fills a rectangle, Alt+drag makes the cells solid again, Ctrl+Z
  takes a stroke back (unless a newer tile change is in Foundry's undo, e.g. a tile deleted with Delete -
  that one comes back first). "Texture repeats every N cells" sets its scale. The cells are kept on the
  scene; each 16×16-cell chunk with paint is baked into one image under
  `worlds/<world>/map-painter/<scene>/` and shown as a locked tile below all other tiles, so stamped props
  stay on top. Chunks meet without seams. On a world that has been filled with material the same stroke
  opens it (see below), so painting a floor means there *is* floor there - one gesture, not two.
- New tiles take Foundry's own defaults from the Tiles palette (elevation, level, opacity). The painter
  itself works on one level: a scene with several levels gets the same floors, material and props on all
  of them, because what it paints is kept per scene and not per level.

Open it from the paintbrush among the **Tiles** tools, with Shift+Alt+M, or
`game.modules.get("dewarim-map-painter").api.open()`. GM only. The paintbrush is a tool of that group, not
just a button: while something is picked it is the active tool, and then a left drag on the canvas belongs
to the palette alone - Foundry's own *Place a tile* draws nothing over a stroke, *Select* drags no box, and
tiles already placed are left alone. Escape, or closing the palette, hands the canvas back to *Select*.

- **What blocks sight**: a wall always does - that is what makes it a wall - a floor never, and a prop
  when *Blocks sight* is ticked for that stroke (a pillar, a pile of rocks; the floor under it stays).
  Stamped, each blocking tile gets four walls along its outline - they move, resize, turn, delete and undo
  with the tile. Painted, the blocking cells get walls along their outline, merged into straight runs,
  recomputed with each stroke, erase and undo. One texture can be floor here and wall there: that makes
  two texture entries, and only the walled cells get walls. Normal Foundry walls (sight, light, sound,
  movement). `game.modules.get("dewarim-map-painter").api.rebuildWalls()` rebuilds them for the viewed
  scene.

- **Seeing what blocks sight**: while the palette is open, the scene's walls are drawn on the map - the
  painter's own in orange, walls from elsewhere in grey, anything that does not stop sight faint. So
  there is no switching to Foundry's *Walls* layer to check, which would hand the canvas back and put
  the palette away.

- **Reset scene** (in the palette, next to *Undo*): empties the scene for a test - every tile, every
  wall, the painted floor and the material - after a dialog that counts them. Tokens, lights and notes
  are not touched. *Undo reset* beside it puts everything back under its own ids, including both scene
  flags, which Foundry's own undo cannot do. One reset is remembered, for the session.

- **Clean up hidden tiles** (`game.modules.get("dewarim-map-painter").api.cleanupTiles()`): deletes tiles
  that another tile hides completely - same place, same image, same look, same flags - which is what
  stamping one cell in two strokes leaves behind. Tiles under a *different* image are only counted:
  transparent parts show what is below. Ctrl+Z brings them back.

- **Fill the world** (in the *Floor* settings): for dungeon maps - cover the whole scene with solid
  material (the picked image, or black rock when nothing is picked) and then paint the floors into it.
  It is an action on the scene, not a mode: *Use the selection as material* changes what the world is
  made of without touching the floors already open, and *Remove the rock layer* takes it away again. A
  floor or wall stroke takes the material away where it draws; Alt+drag fills it back in and leaves the
  *painted* floor underneath, so floors painted once can be opened again later (a stamped floor tile
  there does go: it sits above the material and would otherwise stay visible over solid rock). *Open only* paints no
  texture at all and just opens, showing whatever is below - the floor painted earlier or the scene's
  background. With *Rock blocks view* (on by default) walls run along the edges of the opened area. The
  material is baked like the floor, as tiles just above it and below every prop.

- **A way through the rock**: with material on the scene, every stamped floor or wall is a way through it -
  it *is* the floor of its cells, so the material there has to go. Stamp a corridor through the darkness
  and the rock's walls close along its edge; two stamps that touch, or a stamp next to a cell the brush
  carved, have no wall between them. The tile carries the hole, so deleting it or taking it back closes
  the way again, and moving it moves the hole. The rock is cut away under the stamp, not merely hidden by it: an image with
  transparent parts shows the painted floor or the scene's background, as a brush-carved cell does. A
  stamp outside the scene's own area opens nothing. Cutting the rock means re-baking the chunks the way
  touches, so a burst of stamping ends in one bake per chunk; each rock chunk records what its image was
  made of, so only images that are actually out of date are made again.
