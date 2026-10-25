import {test} from "node:test";
import assert from "node:assert/strict";
import {isDocumentDragData} from "../scripts/drag-source.mjs";

test("isDocumentDragData recognizes Foundry's document drags", () => {
  assert.ok(isDocumentDragData(JSON.stringify({type: "Actor", uuid: "Actor.abc"})));
  assert.ok(isDocumentDragData(JSON.stringify({type: "Folder", documentName: "Actor"})));
});

test("isDocumentDragData passes a file drag through", () => {
  assert.ok(!isDocumentDragData(""));
  assert.ok(!isDocumentDragData("file:///home/ingo/maps/cave.png"));
  assert.ok(!isDocumentDragData("C:\\maps\\cave.png"));
  assert.ok(!isDocumentDragData("https://example.com/cave.png"));
});

test("isDocumentDragData needs a type that is a string", () => {
  assert.ok(!isDocumentDragData(JSON.stringify({uuid: "Actor.abc"})));
  assert.ok(!isDocumentDragData(JSON.stringify({type: ""})));
  assert.ok(!isDocumentDragData(JSON.stringify({type: 42})));
  assert.ok(!isDocumentDragData("null"));
  assert.ok(!isDocumentDragData("7"));
  assert.ok(!isDocumentDragData('"Actor"'));
});
