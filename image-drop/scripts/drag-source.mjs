// Whose drag is this? The pure half of the question, so `node --test` can cover it
// (test/drag-source.test.mjs). No Foundry globals in here.

/**
 * Whether the dropped text is one of Foundry's own document drags: an actor from the sidebar onto the
 * canvas, an item onto a sheet, a folder, a macro. Core recognizes its drags exactly this way - it parses
 * `text/plain` as JSON and ignores a payload without a `type`
 * (TextEditor.getDragEventData, canvas/board.mjs #onDrop).
 * @param {string} text  dataTransfer.getData("text/plain"); "" when the drag carries no text
 * @returns {boolean}
 */
export function isDocumentDragData(text) {
  let data;
  try {
    data = JSON.parse(text);  // a file dragged from the desktop puts a path or a file:// URI here
  } catch {
    return false;
  }
  return !!data?.type && (typeof data.type === "string");
}
