# Changelog

## 0.1.1 (2026-10-25)

- Dragging an actor onto the canvas is no longer mistaken for an image drop. A drag that starts on a
  portrait in the sidebar carries that image as a file, so the module took the drop, kept the token from
  being created and uploaded the portrait instead. Only drags that start outside the Foundry window are
  taken now.
- After an install or update, a GM sees what changed; *What's new* in the module settings shows the
  whole history.

## 0.1.0 (2026-10-17)

- Drop image files from the desktop anywhere on the Foundry window: they are uploaded into a folder of
  the user data directory (configurable), with names that never overwrite.
- Editors, the file picker and file fields keep handling their own drops.
