// Drawing seamless hatching (Schraffur) as SVG. Pure: no files, no ImageMagick, no Foundry.
// test/hatch.test.mjs covers it.
//
// Raytracing is the wrong tool for pen work and so is a diffusion model: hatching is clean,
// repeating line work, which one smears and the other cannot keep straight. Drawing the lines
// ourselves makes the tiling exact instead of approximate, and puts angle, spacing, weight and
// break-up under direct control.
//
// Why it tiles exactly
// -------------------
// A family of parallel lines is given by a direction (p, q) and a spacing s. Shifting the whole
// plane by one tile width moves every line sideways by q*size/L, where L = hypot(p, q); shifting it
// by one tile height moves them by p*size/L. The family maps onto itself when both of those are
// whole multiples of s, so with whole-number p and q it is enough to take
//
//     s = size / (m * L)        for a whole number m
//
// and the shifts become q*m and p*m spacings - whole by construction, for any m. The angle is
// therefore not free: it is atan(q/p) for small whole p and q, which is no loss, since those are
// the angles hatching uses anyway. Every other property (the waver of a line, its weight, where it
// breaks) is taken from a field that is itself periodic over the tile, so the whole drawing is.

/** A small deterministic generator, so a variant is reproducible from its number alone. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A field that is exactly periodic over the unit square: a sum of sines with whole-number
 * frequencies, the same device the POV-Ray scenes use. Returns values in about -1 .. 1.
 */
export function periodicField(rand, {terms = 6, maxFreq = 5} = {}) {
  const parts = [];
  for ( let i = 0; i < terms; i++ ) {
    parts.push({
      amp: 1 / (i + 1),
      fx: 1 + Math.floor(rand()*maxFreq),
      fy: 1 + Math.floor(rand()*maxFreq),
      sign: (rand() < 0.5) ? -1 : 1,
      phase: rand()*Math.PI*2
    });
  }
  const total = parts.reduce((sum, part) => sum + part.amp, 0);
  return (u, v) => parts.reduce(
    (sum, part) => sum + part.amp*Math.sin(2*Math.PI*((part.fx*u) + (part.sign*part.fy*v)) + part.phase), 0) / total;
}

/** The only spacing that lets a (p, q) family of lines tile a square of this size. See above. */
export function spacing(p, q, m, size) {
  return size / (m*Math.hypot(p, q));
}

/**
 * The segment length actually used: the largest whole division of the spacing that is no longer
 * than what was asked for. Dividing the spacing is what keeps the sampling periodic - see the note
 * inside hatchStrokes().
 */
export function segmentStep(spacingValue, desired) {
  return spacingValue / Math.max(1, Math.round(spacingValue / desired));
}

/**
 * One family of hatch strokes, as {d, width} path records in tile coordinates.
 *
 * Lines run past the tile on every side; the drawing is periodic, so whatever leaves one edge is
 * already drawn coming back in at the other. The caller clips with the SVG viewBox.
 *
 * @param {object} options
 * @param {number} options.size      the tile, in units
 * @param {number} options.p,q       whole numbers giving the angle, atan(q/p)
 * @param {number} options.m         density: m*hypot(p,q) lines across the tile
 * @param {number} [options.phase]   shifts the whole family sideways, in spacings
 * @param {number} [options.waver]   how far a line wanders off straight, in units
 * @param {number} [options.step]    length of one drawn segment, in units
 * @param {number} [options.weight]  stroke width, in units
 * @param {number} [options.weightVary]  how much the weight varies along a line, 0 .. 1
 * @param {number} [options.gap]     how much of each line is left undrawn, 0 (solid) .. 1
 * @param {Function} options.shape   periodic field steering the waver
 * @param {Function} options.ink     periodic field steering weight and breaks
 */
export function hatchStrokes({
  size, p, q, m, phase = 0, waver = 0, step = 14, weight = 1.6, weightVary = 0.45, gap = 0,
  shape, ink
}) {
  const length = Math.hypot(p, q);
  const dir = [p / length, q / length];
  const normal = [-q / length, p / length];
  const s = spacing(p, q, m, size);

  // How far the tile's corners reach along the line direction and across it
  const corners = [[0, 0], [size, 0], [0, size], [size, size]];
  const along = corners.map(c => (c[0]*dir[0]) + (c[1]*dir[1]));
  const across = corners.map(c => (c[0]*normal[0]) + (c[1]*normal[1]));
  // The segments have to sit on a grid that survives the shift too. Moving the tile by its own
  // width slides a line along itself by p*m*s, and by its height by q*m*s; both are whole multiples
  // of the spacing, so a step that divides the spacing makes them whole multiples of the step as
  // well. Sampling at an arbitrary step instead put the vertices - and the points where a stroke
  // changes weight or breaks - at different places on the two copies of a line, which is a seam.
  const dt = segmentStep(s, step);

  const margin = Math.max(dt*2, waver*4, weight*4);
  const tFrom = Math.min(...along) - margin;
  const tTo = Math.max(...along) + margin;
  const kFrom = Math.floor((Math.min(...across) - margin) / s) - 1;
  const kTo = Math.ceil((Math.max(...across) + margin) / s) + 1;
  const jFrom = Math.floor(tFrom / dt);
  const jTo = Math.ceil(tTo / dt);

  const strokes = [];
  for ( let k = kFrom; k <= kTo; k++ ) {
    const offset = (k + phase)*s;
    let run = null;
    for ( let j = jFrom; j <= jTo; j++ ) {
      const t = j*dt;
      const segment = [];
      for ( const at of [t, t + dt] ) {
        const bx = (dir[0]*at) + (normal[0]*offset);
        const by = (dir[1]*at) + (normal[1]*offset);
        const push = waver ? waver*shape(bx / size, by / size) : 0;
        segment.push([bx + (normal[0]*push), by + (normal[1]*push)]);
      }
      const mid = [(segment[0][0] + segment[1][0]) / 2, (segment[0][1] + segment[1][1]) / 2];
      const tone = ink(mid[0] / size, mid[1] / size);          // -1 .. 1, periodic
      if ( gap > 0 && (((tone + 1) / 2) < gap) ) {             // this stretch is left undrawn
        run = null;
        continue;
      }
      const width = weight*(1 + (weightVary*tone));
      if ( run && (Math.abs(run.width - width) < (weight*0.12)) ) {
        run.points.push(segment[1]);
        continue;
      }
      run = {points: [...segment], width: Math.max(weight*0.25, width)};
      strokes.push(run);
    }
  }
  return strokes.map(stroke => ({
    width: round(stroke.width),
    d: `M${stroke.points.map(point => `${round(point[0])},${round(point[1])}`).join("L")}`
  }));
}

const round = value => Math.round(value*100) / 100;

/** An SVG document of the given size, with a paper colour and one group per ink layer. */
export function svgDocument({size, paper, layers}) {
  const groups = layers.map(layer => {
    const paths = layer.strokes.map(stroke => `<path d="${stroke.d}" stroke-width="${stroke.width}"/>`).join("");
    return `<g stroke="${layer.colour}" stroke-opacity="${layer.opacity ?? 1}" stroke-linecap="round"`
      + ` stroke-linejoin="round" fill="none">${paths}</g>`;
  }).join("");
  // The paper overhangs the viewBox. librsvg paints the outermost pixel correctly, so this is no
  // longer load-bearing - but it was: ImageMagick's built-in SVG renderer, which rasterised these
  // tiles until librsvg was wired in, leaves that pixel unpainted, and it came out as a black line
  // down one edge, a 39% seam on every drawn tile. Kept because it costs nothing and because a
  // rect with no edge inside the box has nothing to antialias against under any renderer.
  const over = Math.max(4, size*0.01);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`
    + ` viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">`
    + `<rect x="${-over}" y="${-over}" width="${size + (2*over)}" height="${size + (2*over)}" fill="${paper}"/>`
    + `${groups}</svg>`;
}
