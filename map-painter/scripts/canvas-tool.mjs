// Who owns a left drag on the canvas.
//
// The palette's tools read the pointer themselves, and that only works while Foundry's own tile tools are
// not reading the same drag. They were: the painter opened from a *button* among the Tiles tools, which
// leaves whatever tool was active active. With Foundry's `tile` tool that means one drag paints a stroke
// *and* draws an empty tile over it - a grey bar, snapped to half cells, because that is how Foundry
// snaps a tile it creates by dragging (PlaceablesLayer#_onDragLeftStart). With `select` it drags a
// selection box and lets go of what was selected.
//
// Stopping the event does not settle it: both listen on the same canvas element, and at the target the
// browser calls listeners in the order they were added - Foundry's are added when the canvas is drawn,
// long before the palette arms, so stopImmediatePropagation() cannot come first.
//
// So the painter is a *tool* of the Tiles controls instead (map-painter.mjs). While it is the active one,
// nothing on that layer answers a left drag: the layer asks the active tool for `creation` before it
// creates anything (PlaceablesLayer#_isCreationToolActive) and for `interaction`/`control` before a
// placeable may be hovered or controlled (PlaceableObject#_canHover, #_canControl), and the painter's tool
// declares none of the three. Arming takes the tool, disarming hands it back to Foundry's `select`.
export const TOOL = "dewarimMapPainter";

/** Take the canvas: the painter's tool becomes the active tool of the Tiles layer. */
export function takeCanvas() {
  if ( canvas.ready ) canvas.tiles?.activate({tool: TOOL});
}

/** Hand it back to Foundry's own select tool - only while the painter is still the one holding it. */
export function releaseCanvas() {
  if ( canvas.ready && (ui.controls?.tool?.name === TOOL) ) canvas.tiles?.activate({tool: "select"});
}
