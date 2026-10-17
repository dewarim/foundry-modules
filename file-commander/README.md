# Dewarim: File Commander

**Requires:** nothing beyond Foundry v14 — system-agnostic. Works on hosted servers.

Two independent panes over Foundry's file storage (*user data*, and Foundry's own files read-only).

- **Browse**: double-click a folder, breadcrumb to jump back, Backspace for up, filter by name.
- **Preview**: click an image, video or sound file - it shows below, with its path to copy.
- **Copy**: drag files from one pane to the other, or select (Ctrl/Shift-click) and press F4. A name that
  is taken in the target gets a counter (`map-1.png`) - nothing is overwritten.
- **Copy as** (F6): copy the selection under a new name - into the same folder or the other pane. The way to
  *rename*: copy the generated `c0ecc5df-….jpg` as `goblin-chief` (the extension is kept), then copy that
  where it belongs. Several files: `cave-{n}` numbers them. A taken name gets a counter and a warning.
- **Upload**: drop files from the desktop into a pane; they land in that pane's folder.
- **Tiles**: drag an image onto the canvas to place it as a tile (Foundry's own file-picker format).
- **New folder**: F7.
- **Where used**: below the preview - every world document using the file (scenes with their levels,
  tiles, tokens and unlinked tokens' items; actors and items, HTML descriptions included; journal pages;
  playlists, macros, tables, cards, users), each one opens on click.
- **Repoint**: *copy as* offers to point the documents using the original at the copy - copy as + repoint
  is a rename. *Where used* also offers it for copies the ledger knows: move a file's uses to its copy, or
  a copy's original's uses to the copy. GM only.

**Copy, not move.** Foundry's server gives a browser browse, create folder and upload, nothing else, and a
module cannot add to that. Every copy is recorded (world setting `dewarim-file-commander.ledger`:
`{from, to, time, user}`), so the originals can be cleaned up later - by hand on a hosted server, or from
the shell when Foundry runs locally, checking first that no document still uses them (*Where used*).
World compendiums, chat messages and settings are not searched.

Open it from the *File Commander* button in the Settings sidebar, with Shift+Alt+F, or
`game.modules.get("dewarim-file-commander").api.open()`. The API also has `findUses(path)` and
`repoint(from, to)`.
