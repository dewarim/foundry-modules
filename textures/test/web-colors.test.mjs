import assert from "node:assert/strict";
import test from "node:test";
import {BASIC, EXTENDED, SETS, hex, webColors} from "../tools/web-colors.mjs";

const all = webColors();

test("the two sets are the 148 CSS Color 4 names, split 16 and 132", () => {
  assert.equal(BASIC.length, 16);
  assert.equal(EXTENDED.length, 132);
  assert.equal(all.length, 148);
  // The split is a partition, not an overlap: the 16 basic names are also in the CSS3 extended
  // list, so writing both lists as they stand would ship 16 colours twice under one name each.
  const basic = new Set(BASIC.map(c => c.name));
  for ( const c of EXTENDED ) assert.ok(!basic.has(c.name), `${c.name} is in both sets`);
  assert.equal(new Set(all.map(c => c.name)).size, all.length, "a name appears twice");
  assert.equal(new Set(all.map(c => c.out)).size, all.length);
});

test("the basic 16 are the HTML 4.01 names, with their VGA values", () => {
  assert.deepEqual(BASIC.map(c => c.name).sort(), [
    "aqua", "black", "blue", "fuchsia", "gray", "green", "lime", "maroon",
    "navy", "olive", "purple", "red", "silver", "teal", "white", "yellow"
  ]);
  const find = name => BASIC.find(c => c.name === name);
  assert.equal(find("white").hex, "#ffffff");
  assert.equal(find("black").hex, "#000000");
  assert.equal(find("silver").hex, "#c0c0c0");
  // The VGA half-intensity colours, which is why green is #008000 and the full one is called lime.
  assert.equal(find("green").hex, "#008000");
  assert.equal(find("lime").hex, "#00ff00");
  assert.equal(find("navy").hex, "#000080");
});

test("every row's hex and decimals say the same thing", () => {
  // Both columns were taken from the source table and kept, so this is the source's own
  // cross-check: a hand-edited hex that no longer matches its decimals fails here.
  for ( const c of all ) {
    assert.equal(hex(c.rgb), c.hex, `${c.name}: ${c.hex} is not ${c.rgb.join(",")}`);
    assert.equal(c.rgb.length, 3);
    for ( const v of c.rgb ) assert.ok(Number.isInteger(v) && (v >= 0) && (v <= 255), `${c.name}: ${v}`);
    assert.match(c.hex, /^#[0-9a-f]{6}$/);
  }
});

test("a name is one lowercase word, so the palette's filter box finds it", () => {
  for ( const c of all ) {
    assert.match(c.name, /^[a-z]+$/, `${c.name} is not a plain lowercase name`);
    assert.match(c.out, /^web-(base|extended)\/[a-z]+$/);
  }
  for ( const {dir, colors} of SETS ) {
    for ( const c of colors ) assert.ok(all.some(x => (x.name === c.name) && (x.set === dir)));
  }
});

test("nine colours have two names, and they are the nine that should", () => {
  const byHex = new Map();
  for ( const c of all ) byHex.set(c.hex, [...(byHex.get(c.hex) ?? []), c.name]);
  const shared = [...byHex.entries()].filter(([, names]) => names.length > 1)
    .map(([h, names]) => `${h}: ${names.sort().join("/")}`).sort();
  assert.deepEqual(shared, [
    "#00ffff: aqua/cyan",
    "#2f4f4f: darkslategray/darkslategrey",
    "#696969: dimgray/dimgrey",
    "#708090: slategray/slategrey",
    "#778899: lightslategray/lightslategrey",
    "#808080: gray/grey",
    "#a9a9a9: darkgray/darkgrey",
    "#d3d3d3: lightgray/lightgrey",
    "#ff00ff: fuchsia/magenta"
  ]);
  assert.equal(byHex.size, 139, "148 names, 139 colours");
});

test("every British spelling is the same colour as its American twin", () => {
  // Not a coincidence worth leaving to chance: these are eight separate pairs of rows from two
  // different sources, and a wrong digit in one of them would be a file that quietly disagrees
  // with the file next to it.
  const greys = all.filter(c => c.name.includes("grey"));
  assert.equal(greys.length, 7);
  for ( const c of greys ) {
    const twin = all.find(x => x.name === c.name.replace("grey", "gray"));
    assert.ok(twin, `${c.name} has no gray spelling`);
    assert.equal(c.hex, twin.hex, `${c.name} is not ${twin.name}`);
    assert.deepEqual(c.rgb, twin.rgb);
    // Both spellings live in web-extended, even gray's, so that web-base stays exactly the 16
    // names HTML 4.01 defines and can be checked against the specification as a set.
    assert.equal(c.set, "web-extended");
  }
});

test("the names that are famously not what they say are still what the standard says", () => {
  const find = name => all.find(c => c.name === name);
  // X11's grey ramp and HTML's gray were set by different people: darkgray is *lighter* than gray.
  // It is wrong and it is the standard, so it is what the file has to hold.
  assert.equal(find("gray").hex, "#808080");
  assert.equal(find("darkgray").hex, "#a9a9a9");
  assert.ok(find("darkgray").rgb[0] > find("gray").rgb[0]);
  // A few values worth pinning, because a typo in one of 148 hex codes is otherwise invisible.
  assert.equal(find("cornflowerblue").hex, "#6495ed");
  assert.equal(find("rebeccapurple").hex, "#663399");
  assert.equal(find("grey").hex, "#808080");
  assert.equal(find("peru").hex, "#cd853f");
  assert.equal(find("rosybrown").hex, "#bc8f8f");
  assert.equal(find("darkslategray").hex, "#2f4f4f");
});
