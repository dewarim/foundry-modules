// The named web colours: the 16 basic HTML names, and the 132 further names that complete the CSS
// Color 4 set. Pure data and one helper - no files and no ImageMagick.
// test/web-colors.test.mjs covers it.
//
// Why these are written out rather than computed: a named colour is a *name*. "cornflowerblue is
// #6495ed" is a fact about a 1990s X11 file that CSS froze, not something a colour space can be
// asked for - the set is uneven, the names are inconsistent (darkgray is lighter than gray), and
// that is the point of having it. Anyone who has written CSS already knows what half of these
// look like, which is worth more in a palette than even spacing.
//
// Two sources, and they were held against each other:
//
//   - https://en.wikipedia.org/wiki/Web_colors#HTML_color_names (Template:Colornames for the 16,
//     Template:Color chart X11 for the 140), read on 2026-11-04. Both the hex and the decimal
//     column of every row were parsed and compared - they agree on all 140 - and all 16 basic
//     names appear in the 140 with identical values.
//   - https://www.w3.org/TR/css-color-4/#named-colors, the current W3C list, read the same day.
//     Its table holds 148 names, its own two columns agree on all of them, and it agrees with the
//     chart on every one of the 140: no name missing, no value different. The 8 it has over the
//     chart are the seven British spellings and rebeccapurple, and they are set apart below
//     because they come from this source and not the other one.
//
// Two independent tables agreeing row for row is the reason these values are not spot-checked
// further. Both columns of each are kept here, redundantly and on purpose: they are the sources'
// own cross-check, so a hand-edited hex that no longer matches its decimals fails a test.
//
// Three things about the standard, all inherited rather than chosen:
//
//   - Nine colours have two names each - aqua = cyan, fuchsia = magenta, and the seven grey/gray
//     pairs - so 148 names are 139 colours. Both spellings are kept: both are standard, and the
//     file a GM reaches for should be the word they typed.
//   - rebeccapurple (#663399) is in CSS Color 4 and in no earlier list. It was added in 2014 in
//     memory of Rebecca Meyer, the daughter of Eric Meyer, who died at six.
//   - darkgray (#a9a9a9) is *lighter* than gray (#808080), because X11's grey ramp and HTML's
//     grey were set by different people. It is wrong and it is the standard.
//
// Names are spelled as CSS spells them, in lowercase. CSS names are case-insensitive and the
// palette's filter is case-insensitive too, so nothing is lost by it.

/** The 16 basic HTML 4.01 colour names: the Windows VGA palette, ratified in 1999. */
export const BASIC = [
  {name: "white", hex: "#ffffff", rgb: [255, 255, 255]},
  {name: "silver", hex: "#c0c0c0", rgb: [192, 192, 192]},
  {name: "gray", hex: "#808080", rgb: [128, 128, 128]},
  {name: "black", hex: "#000000", rgb: [0, 0, 0]},
  {name: "red", hex: "#ff0000", rgb: [255, 0, 0]},
  {name: "maroon", hex: "#800000", rgb: [128, 0, 0]},
  {name: "yellow", hex: "#ffff00", rgb: [255, 255, 0]},
  {name: "olive", hex: "#808000", rgb: [128, 128, 0]},
  {name: "lime", hex: "#00ff00", rgb: [0, 255, 0]},
  {name: "green", hex: "#008000", rgb: [0, 128, 0]},
  {name: "aqua", hex: "#00ffff", rgb: [0, 255, 255]},
  {name: "teal", hex: "#008080", rgb: [0, 128, 128]},
  {name: "blue", hex: "#0000ff", rgb: [0, 0, 255]},
  {name: "navy", hex: "#000080", rgb: [0, 0, 128]},
  {name: "fuchsia", hex: "#ff00ff", rgb: [255, 0, 255]},
  {name: "purple", hex: "#800080", rgb: [128, 0, 128]}
];

/**
 * The other 132 names, in the order the source chart groups them.
 *
 * The group comments are the chart's own. Nothing uses them - the palette sorts by file name - but
 * they are what makes a list of 132 names readable, and they show how uneven the set is: ten
 * greens and one brown called "brown".
 *
 * `grey` belongs here rather than in BASIC although `gray` is one of the 16: HTML 4.01 named only
 * the American spelling, and BASIC is kept as exactly those 16 names so that it stays a set
 * somebody can check against the specification.
 */
export const EXTENDED = [
  // pink
  {name: "mediumvioletred", hex: "#c71585", rgb: [199, 21, 133]},
  {name: "deeppink", hex: "#ff1493", rgb: [255, 20, 147]},
  {name: "palevioletred", hex: "#db7093", rgb: [219, 112, 147]},
  {name: "hotpink", hex: "#ff69b4", rgb: [255, 105, 180]},
  {name: "lightpink", hex: "#ffb6c1", rgb: [255, 182, 193]},
  {name: "pink", hex: "#ffc0cb", rgb: [255, 192, 203]},
  // red
  {name: "darkred", hex: "#8b0000", rgb: [139, 0, 0]},
  {name: "firebrick", hex: "#b22222", rgb: [178, 34, 34]},
  {name: "crimson", hex: "#dc143c", rgb: [220, 20, 60]},
  {name: "indianred", hex: "#cd5c5c", rgb: [205, 92, 92]},
  {name: "lightcoral", hex: "#f08080", rgb: [240, 128, 128]},
  {name: "salmon", hex: "#fa8072", rgb: [250, 128, 114]},
  {name: "darksalmon", hex: "#e9967a", rgb: [233, 150, 122]},
  {name: "lightsalmon", hex: "#ffa07a", rgb: [255, 160, 122]},
  // orange
  {name: "orangered", hex: "#ff4500", rgb: [255, 69, 0]},
  {name: "tomato", hex: "#ff6347", rgb: [255, 99, 71]},
  {name: "darkorange", hex: "#ff8c00", rgb: [255, 140, 0]},
  {name: "coral", hex: "#ff7f50", rgb: [255, 127, 80]},
  {name: "orange", hex: "#ffa500", rgb: [255, 165, 0]},
  // yellow
  {name: "darkkhaki", hex: "#bdb76b", rgb: [189, 183, 107]},
  {name: "gold", hex: "#ffd700", rgb: [255, 215, 0]},
  {name: "khaki", hex: "#f0e68c", rgb: [240, 230, 140]},
  {name: "peachpuff", hex: "#ffdab9", rgb: [255, 218, 185]},
  {name: "palegoldenrod", hex: "#eee8aa", rgb: [238, 232, 170]},
  {name: "moccasin", hex: "#ffe4b5", rgb: [255, 228, 181]},
  {name: "papayawhip", hex: "#ffefd5", rgb: [255, 239, 213]},
  {name: "lightgoldenrodyellow", hex: "#fafad2", rgb: [250, 250, 210]},
  {name: "lemonchiffon", hex: "#fffacd", rgb: [255, 250, 205]},
  {name: "lightyellow", hex: "#ffffe0", rgb: [255, 255, 224]},
  // brown
  {name: "brown", hex: "#a52a2a", rgb: [165, 42, 42]},
  {name: "saddlebrown", hex: "#8b4513", rgb: [139, 69, 19]},
  {name: "sienna", hex: "#a0522d", rgb: [160, 82, 45]},
  {name: "chocolate", hex: "#d2691e", rgb: [210, 105, 30]},
  {name: "darkgoldenrod", hex: "#b8860b", rgb: [184, 134, 11]},
  {name: "peru", hex: "#cd853f", rgb: [205, 133, 63]},
  {name: "rosybrown", hex: "#bc8f8f", rgb: [188, 143, 143]},
  {name: "goldenrod", hex: "#daa520", rgb: [218, 165, 32]},
  {name: "sandybrown", hex: "#f4a460", rgb: [244, 164, 96]},
  {name: "tan", hex: "#d2b48c", rgb: [210, 180, 140]},
  {name: "burlywood", hex: "#deb887", rgb: [222, 184, 135]},
  {name: "wheat", hex: "#f5deb3", rgb: [245, 222, 179]},
  {name: "navajowhite", hex: "#ffdead", rgb: [255, 222, 173]},
  {name: "bisque", hex: "#ffe4c4", rgb: [255, 228, 196]},
  {name: "blanchedalmond", hex: "#ffebcd", rgb: [255, 235, 205]},
  {name: "cornsilk", hex: "#fff8dc", rgb: [255, 248, 220]},
  {name: "indigo", hex: "#4b0082", rgb: [75, 0, 130]},
  {name: "darkmagenta", hex: "#8b008b", rgb: [139, 0, 139]},
  {name: "darkviolet", hex: "#9400d3", rgb: [148, 0, 211]},
  {name: "darkslateblue", hex: "#483d8b", rgb: [72, 61, 139]},
  {name: "blueviolet", hex: "#8a2be2", rgb: [138, 43, 226]},
  {name: "darkorchid", hex: "#9932cc", rgb: [153, 50, 204]},
  {name: "magenta", hex: "#ff00ff", rgb: [255, 0, 255]},
  {name: "slateblue", hex: "#6a5acd", rgb: [106, 90, 205]},
  {name: "mediumslateblue", hex: "#7b68ee", rgb: [123, 104, 238]},
  {name: "mediumorchid", hex: "#ba55d3", rgb: [186, 85, 211]},
  {name: "mediumpurple", hex: "#9370db", rgb: [147, 112, 219]},
  {name: "orchid", hex: "#da70d6", rgb: [218, 112, 214]},
  {name: "violet", hex: "#ee82ee", rgb: [238, 130, 238]},
  {name: "plum", hex: "#dda0dd", rgb: [221, 160, 221]},
  {name: "thistle", hex: "#d8bfd8", rgb: [216, 191, 216]},
  {name: "lavender", hex: "#e6e6fa", rgb: [230, 230, 250]},
  // blue
  {name: "midnightblue", hex: "#191970", rgb: [25, 25, 112]},
  {name: "darkblue", hex: "#00008b", rgb: [0, 0, 139]},
  {name: "mediumblue", hex: "#0000cd", rgb: [0, 0, 205]},
  {name: "royalblue", hex: "#4169e1", rgb: [65, 105, 225]},
  {name: "steelblue", hex: "#4682b4", rgb: [70, 130, 180]},
  {name: "dodgerblue", hex: "#1e90ff", rgb: [30, 144, 255]},
  {name: "deepskyblue", hex: "#00bfff", rgb: [0, 191, 255]},
  {name: "cornflowerblue", hex: "#6495ed", rgb: [100, 149, 237]},
  {name: "skyblue", hex: "#87ceeb", rgb: [135, 206, 235]},
  {name: "lightskyblue", hex: "#87cefa", rgb: [135, 206, 250]},
  {name: "lightsteelblue", hex: "#b0c4de", rgb: [176, 196, 222]},
  {name: "lightblue", hex: "#add8e6", rgb: [173, 216, 230]},
  {name: "powderblue", hex: "#b0e0e6", rgb: [176, 224, 230]},
  // cyan
  {name: "darkcyan", hex: "#008b8b", rgb: [0, 139, 139]},
  {name: "lightseagreen", hex: "#20b2aa", rgb: [32, 178, 170]},
  {name: "cadetblue", hex: "#5f9ea0", rgb: [95, 158, 160]},
  {name: "darkturquoise", hex: "#00ced1", rgb: [0, 206, 209]},
  {name: "mediumturquoise", hex: "#48d1cc", rgb: [72, 209, 204]},
  {name: "turquoise", hex: "#40e0d0", rgb: [64, 224, 208]},
  {name: "cyan", hex: "#00ffff", rgb: [0, 255, 255]},
  {name: "aquamarine", hex: "#7fffd4", rgb: [127, 255, 212]},
  {name: "paleturquoise", hex: "#afeeee", rgb: [175, 238, 238]},
  {name: "lightcyan", hex: "#e0ffff", rgb: [224, 255, 255]},
  // green
  {name: "darkgreen", hex: "#006400", rgb: [0, 100, 0]},
  {name: "darkolivegreen", hex: "#556b2f", rgb: [85, 107, 47]},
  {name: "forestgreen", hex: "#228b22", rgb: [34, 139, 34]},
  {name: "seagreen", hex: "#2e8b57", rgb: [46, 139, 87]},
  {name: "olivedrab", hex: "#6b8e23", rgb: [107, 142, 35]},
  {name: "mediumseagreen", hex: "#3cb371", rgb: [60, 179, 113]},
  {name: "limegreen", hex: "#32cd32", rgb: [50, 205, 50]},
  {name: "springgreen", hex: "#00ff7f", rgb: [0, 255, 127]},
  {name: "mediumspringgreen", hex: "#00fa9a", rgb: [0, 250, 154]},
  {name: "darkseagreen", hex: "#8fbc8f", rgb: [143, 188, 143]},
  {name: "mediumaquamarine", hex: "#66cdaa", rgb: [102, 205, 170]},
  {name: "yellowgreen", hex: "#9acd32", rgb: [154, 205, 50]},
  {name: "lawngreen", hex: "#7cfc00", rgb: [124, 252, 0]},
  {name: "chartreuse", hex: "#7fff00", rgb: [127, 255, 0]},
  {name: "lightgreen", hex: "#90ee90", rgb: [144, 238, 144]},
  {name: "greenyellow", hex: "#adff2f", rgb: [173, 255, 47]},
  {name: "palegreen", hex: "#98fb98", rgb: [152, 251, 152]},
  // white
  {name: "mistyrose", hex: "#ffe4e1", rgb: [255, 228, 225]},
  {name: "antiquewhite", hex: "#faebd7", rgb: [250, 235, 215]},
  {name: "linen", hex: "#faf0e6", rgb: [250, 240, 230]},
  {name: "beige", hex: "#f5f5dc", rgb: [245, 245, 220]},
  {name: "whitesmoke", hex: "#f5f5f5", rgb: [245, 245, 245]},
  {name: "lavenderblush", hex: "#fff0f5", rgb: [255, 240, 245]},
  {name: "oldlace", hex: "#fdf5e6", rgb: [253, 245, 230]},
  {name: "aliceblue", hex: "#f0f8ff", rgb: [240, 248, 255]},
  {name: "seashell", hex: "#fff5ee", rgb: [255, 245, 238]},
  {name: "ghostwhite", hex: "#f8f8ff", rgb: [248, 248, 255]},
  {name: "honeydew", hex: "#f0fff0", rgb: [240, 255, 240]},
  {name: "floralwhite", hex: "#fffaf0", rgb: [255, 250, 240]},
  {name: "azure", hex: "#f0ffff", rgb: [240, 255, 255]},
  {name: "mintcream", hex: "#f5fffa", rgb: [245, 255, 250]},
  {name: "snow", hex: "#fffafa", rgb: [255, 250, 250]},
  {name: "ivory", hex: "#fffff0", rgb: [255, 255, 240]},
  // gray and black
  {name: "darkslategray", hex: "#2f4f4f", rgb: [47, 79, 79]},
  {name: "dimgray", hex: "#696969", rgb: [105, 105, 105]},
  {name: "slategray", hex: "#708090", rgb: [112, 128, 144]},
  {name: "lightslategray", hex: "#778899", rgb: [119, 136, 153]},
  {name: "darkgray", hex: "#a9a9a9", rgb: [169, 169, 169]},
  {name: "lightgray", hex: "#d3d3d3", rgb: [211, 211, 211]},
  {name: "gainsboro", hex: "#dcdcdc", rgb: [220, 220, 220]},
  // the eight the W3C list has and the chart does not: the British spellings, and the
  // colour added to CSS Color 4 in 2014
  {name: "darkgrey", hex: "#a9a9a9", rgb: [169, 169, 169]},
  {name: "darkslategrey", hex: "#2f4f4f", rgb: [47, 79, 79]},
  {name: "dimgrey", hex: "#696969", rgb: [105, 105, 105]},
  {name: "grey", hex: "#808080", rgb: [128, 128, 128]},
  {name: "lightgrey", hex: "#d3d3d3", rgb: [211, 211, 211]},
  {name: "lightslategrey", hex: "#778899", rgb: [119, 136, 153]},
  {name: "rebeccapurple", hex: "#663399", rgb: [102, 51, 153]},
  {name: "slategrey", hex: "#708090", rgb: [112, 128, 144]}
];

/** Where each set is written, under assets/. */
export const SETS = [
  {dir: "web-base", colors: BASIC},
  {dir: "web-extended", colors: EXTENDED}
];

/** Every named colour, as {name, hex, rgb, set, out}. */
export function webColors() {
  return SETS.flatMap(({dir, colors}) => colors.map(c => ({...c, set: dir, out: `${dir}/${c.name}`})));
}

/** The hex a decimal triple spells, for holding the two columns against each other. */
export const hex = ([r, g, b]) => `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
