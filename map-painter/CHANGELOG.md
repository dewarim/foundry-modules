# Changelog

## 0.5.0 (2026-11-08)

- **German dialogs end in German buttons.** The confirm questions - reset the scene, remove the rock
  layer, clean up hidden tiles - and the *Add folder* dialog took their button labels from Foundry's own
  keys, which read "Yes", "No" and "Confirm" in English unless core's German is installed. They are the
  module's own labels now, like the help window's *Schließen*.

- **A cell has one floor, and props above it.** Three modes now say what a stroke *means* - *Floor*,
  *Wall*, *Prop* - and a second row says how it is drawn: with the brush over cells, or stamped as a
  tile. Floor and wall are the same thing in a cell's one slot, so a stroke of either takes that slot:
  the painter's own floors and walls where it draws are deleted, and only then is the new one put there.
  Props lie above all of it and replace nothing, which is what props are for. That is what ends painted
  floors that were never visible, because a tile stamped earlier was sitting on them: the stroke now
  owns its cells instead of being quietly hidden under them. What was replaced is said out loud, and one
  undo brings it back (a stamp stroke takes two: Foundry counts the deletion and the new tiles as two
  changes to tiles, and the first Ctrl+Z takes the new ones).

  A tile the stroke only touches goes whole - Foundry cannot cut a tile in half, and leaving the stroke
  invisible under it is the bug this is about. Tiles from before this, and every tile the painter did not
  make, count as props and are never deleted by a stroke: there is no way to tell an old stamped floor
  from an old chest, so nothing is guessed. Stamped floors and walls also sit in their own layer now,
  over the material and under every prop, so a floor stamped later no longer hides a chair placed
  earlier.

  With it, three questions the GM used to answer per stroke are gone, because the mode answers them:
  *Wall (blocks view)* (a wall blocks, a floor does not), *A way through the rock* (a floor or a wall
  takes the material's place, always), and *Open the world* off (painting a floor under closed material
  was the one case this rule is about - a floor painted blind that may never be seen). *Prop* mode keeps
  a *Blocks sight* box, because a pillar or a pile of rocks blocks sight and is still a prop: the floor
  under it stays. Alt+drag is the other deliberate exception - it fills the material back in and leaves
  the *painted* floor underneath, so "paint the floors once, open the rooms as the party explores" still
  works; a stamped floor in those cells does go, because it sits above the material and would otherwise
  stay in plain sight on a cell that is solid rock again.

- Both rows of the palette now say what they are asking - *What*: Floor, Wall, Prop; *How*: Brush,
  Stamp - and every one of those buttons has its sentence as a tooltip. Without the labels the five
  buttons read as one list, and *Stamp* looks like a fourth kind of thing beside *Floor* and *Wall*
  instead of an answer to a different question. The *(?)* beside the modes opens all of it in one
  window, including the rule that a cell has one slot for floor or wall and any number of props above
  it. *Brush* now also says why it is unavailable where it is: props are placed one at a time, and the
  brush paints square grids only.

- New: *Reset scene* in the palette, with a dialog that counts what will go and *Undo reset* next to it.
  It empties the scene for a test - every tile, every wall, the painted floor and the material - and
  touches nothing else on it. It brings its own undo because Foundry has none for a scene flag: the
  documents and both flag values go into one slot and come back under the same ids, and the deletions
  stay out of Foundry's own history so Ctrl+Z cannot take half of it back.

- While the palette is open, every wall of the scene is drawn on the map: the painter's own in orange,
  walls from elsewhere in grey, and anything that does not stop sight faint. Seeing what blocks view meant
  switching to Foundry's *Walls* layer, which takes the canvas back from the painter and so puts the
  palette away - you had to leave in order to look, and leaving cost you what you had picked. It shows
  *every* wall and not only the painter's, because an overlay that left some out would read as "nothing
  blocks here" exactly where something does.

- New: *Clean up hidden tiles* (`game.modules.get("dewarim-map-painter").api.cleanupTiles()`). Stamping
  the same cell in two strokes leaves a tile that nothing can show and nobody can click. It deletes only
  tiles whose removal cannot change the map: the same place, the same image, the same look and the same
  flags, with another one above. Tiles under a *different* image are counted and left alone - an image
  with transparent parts shows what is below it, which is what props are for - and two tiles alike but
  for *A way through the rock* are left alone too, because one of them holds a hole in the rock. Ctrl+Z
  brings back what it deleted.

- Whether a stroke makes walls is a setting of the stroke now, *Wall (blocks view)*, shown in both modes
  and kept per mode - it replaces the *Blocks view (walls)* mark that was remembered per image for the
  whole world. The mark was only ever shown in *Stamp* mode while the floor brush read it just the same,
  so painting a wall texture meant switching mode, ticking a box for that file and switching back, and a
  stamp that made no walls gave no hint why. The same image can now be a floor in one stroke and a wall
  in the next. Walls already on a scene are untouched: what blocks view is recorded with the tile and
  with the painted cells, not with the image, and always was. Images marked before are no longer marked -
  tick *Wall* for the strokes that should block.

- The paintbrush is a tool among the Tiles tools now, not a button that only opens the palette. While
  something is picked, a left drag on the canvas is the palette's alone. Before, whichever of Foundry's
  own tile tools was active kept reading the same drag: with *Place a tile* a floor stroke painted its
  first cell and Foundry drew an empty tile over the rest of it - a grey bar, offset by half a cell,
  because that is how Foundry snaps a tile dragged into being. Escape, or closing the palette, hands the
  canvas back to *Select*.

- A stroke no longer ends early: it follows the pointer that began it until that pointer is released,
  wherever it goes, instead of stopping as soon as the browser reported no button held down. A floor
  stroke or a stamped row that came out one cell long was this.

- *Paint* and *Carve* are one mode now, *Floor*: a stroke says "these cells are floor", and on a
  world filled with material it opens the material where it paints. Painting a floor and opening the
  rock were two things you had to do in two modes, in the right order, and getting it wrong looked
  like a tool that did nothing. Alt+drag makes cells solid again and leaves the floor painted
  underneath, so floors painted once can be opened again later; *Open only* opens without painting;
  *Open the world* off paints the floor under the material and leaves it closed. One stroke is one
  undo step, whichever of the two it changed.

- Filling the world with material is an action in the *Floor* settings, not a mode of its own:
  *Fill the world* covers the scene with the picked image (or black rock), *Use the selection as
  material* changes what it is made of without touching the floors already open. Before, the next
  carve stroke silently adopted whatever was selected in the palette as the rock texture.

- Stamping a way through the rock: in *Stamp* mode, on a scene that has a rock layer, *A way through
  the rock* makes every tile you place count as a cell carved out of it. The rock's walls close
  along the edge of the way, and two stamps that touch have no wall between them - so a corridor
  stamped through the darkness blocks sight and movement where the darkness is, and nowhere else.
  The way closes again when the tile is deleted or undone. The rock is really gone under such a tile
  and not just hidden behind it, so a stamp with transparent parts shows the painted floor or the
  scene's background. Scenes whose rock was baked before this are brought up to date when you open
  them.

- *Paint* mode says so when the scene is covered in rock: the rock lies over the paint, so what you
  paint only shows where the rock is carved open or a way is stamped through it. Painting there used
  to look like it did nothing at all.

## 0.4.0 (2026-11-04)

- A painted stroke whose image the server refuses to store now fails with a message instead of
  leaving a tile that points at a file which was never written. Painting uploads its baked images,
  so it needs the right to upload files - stamping does not, which is why one could work while the
  other did not.

- The palette's search looks through every folder below the one you are in, instead of filtering
  only the current listing - so a name you know is there is found from the root of a module.
  Case-insensitive, several words all have to match, folder names count too, and each hit shows
  which folder it came from.

- Faster on busy scenes: moving tiles that are not the painter's own (a mass edit, another module)
  no longer makes it look through the scene's walls for each one.

- After an install or update, a GM sees what changed; *What's new* in the module settings shows the
  whole history.

## 0.3.1 (2026-10-18)

- Ctrl+Z works on every keyboard layout (it is matched by the letter, so Strg+Z on a German keyboard).
- Ctrl+Z works again right after a click into the palette.

## 0.3.0 (2026-10-18)

- **Carve**: lay black rock (or a chosen texture) over the scene and carve rooms and tunnels into it;
  Ctrl+drag carves a rectangle, Alt+drag fills rock back in. The rock blocks view along its edges.
- *Remove the rock layer* takes it away again.

## 0.2.0 (2026-10-18)

- **Palette and stamps**: images from folders (yours, Foundry's own, other modules'), stamped onto the
  canvas snapped to the grid; size, rotation, mirroring, random rotation.
- **Texture brush**: paint whole grid cells with a repeating texture; rectangles, erasing, undo.
- **Blocks view**: mark images as blocking - stamped and painted ones become walls.
