# Changelog

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
