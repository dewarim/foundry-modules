# Dewarim: Image Drop

**Requires:** nothing beyond Foundry v14 — system-agnostic.

Drag image files from the desktop onto the Foundry window and they are uploaded into a folder of the
user data directory (default `assets/upload`, shared by all worlds; configurable per world in *Configure Settings*). The
folder is created on the first drop. Existing files are never overwritten: `map.png` becomes `map-1.png`.
File names are made URL-safe (`Drachenhöhle (2).PNG` → `Drachenhohle-2.png`).

- Needs the *Upload New Files* permission (default: Assistant GM and up).
- Leaves alone what already handles file drops: rich-text editors (they embed the image), the
  FilePicker (uploads to the folder it shows), file inputs, and any element marked
  `data-accepts-files` (the File Commander's panes).
- Leaves alone what Foundry drags itself: an actor onto the canvas, an item onto a sheet, a journal
  entry into an editor. Only a drag that starts outside the window is taken — a dragged portrait comes
  along as a file, so what a drag carries is not enough to tell them apart.
- Non-image files in a drop are skipped with a warning.
- Per-browser switch *Upload dropped images* turns it off.

Scripting: `game.modules.get("dewarim-image-drop").api.uploadImages(files, folder?)` returns the stored paths.
