// Plain shading hatch: one family at 45 degrees, evenly drawn. For anything that wants to read as
// "not floor" without claiming to be a material - pits, out-of-bounds, areas under construction.
import {rng, periodicField, hatchStrokes, svgDocument} from "../hatch-lib.mjs";

export const out = "hatch/diagonal";
export const variants = 2;

export function build({size, variant}) {
  const rand = rng(9100 + (variant*53));
  const shape = periodicField(rand, {terms: 4, maxFreq: 3});
  const ink = periodicField(rand, {terms: 5, maxFreq: 4});
  const unit = size / 1024;
  return svgDocument({
    size,
    paper: "#ece6d8",
    layers: [
      {
        colour: "#30291f", opacity: 0.88,
        strokes: hatchStrokes({
          size, p: 1, q: 1, m: 16, phase: rand(),
          waver: 1.6*unit, step: 14*unit, weight: 2.4*unit, weightVary: 0.35, gap: 0.12,
          shape, ink
        })
      }
    ]
  });
}
