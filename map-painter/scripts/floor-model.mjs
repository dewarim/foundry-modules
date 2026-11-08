// The pure half of the floor brush: one stroke says "these cells are floor" - the rock opens there and the
// texture is painted - or, erasing, "these cells are solid again". No Foundry globals:
// test/floor-model.test.mjs.
//
// This is the one place that knows the rule, because what a floor is lives in two scene flags at once
// (paint-model.mjs for the texture, carve-model.mjs for the rock) and they have to change together or not
// at all. Naming the modes after the gesture - paint, carve - is what hid that: a GM painting a floor over
// rock was changing one of the two and seeing nothing (ROADMAP step 5).
import {carve} from "./carve-model.mjs";
import {paint} from "./paint-model.mjs";

/** A half that did not change is not written, baked or undone. */
const changed = result => (result.changes.length ? result : null);

/**
 * One stroke of the floor brush.
 * @param {{paint: object, carve: object|null}} states  the scene's two states; carve null: the world is not
 *   filled with anything, so there is no rock to open
 * @param {{col: number, row: number}[]} cells
 * @param {object} [options]
 * @param {{src: string, repeat: number, blocks: boolean}|null} [options.texture]  the floor to paint; null:
 *   leave the floor below as it is and only open the rock
 * @param {boolean} [options.erase]  make the cells solid again: fill the rock back in, and leave the floor
 *   painted under it - so floors painted once can be opened again later. With no rock on the scene there is
 *   nothing else "solid" could mean, so there the floor itself is erased.
 * @returns {{paint: {state: object, changes: object[]}|null, carve: {state: object, changes: object[]}|null}}
 */
export function floorStroke({paint: painted, carve: rock}, cells, {texture = null, erase = false} = {}) {
  if ( erase ) {
    if ( rock ) return {paint: null, carve: changed(carve(rock, cells, false))};
    return {paint: changed(paint(painted, cells, null)), carve: null};
  }
  return {
    paint: texture ? changed(paint(painted, cells, texture)) : null,
    carve: rock ? changed(carve(rock, cells, true)) : null
  };
}
