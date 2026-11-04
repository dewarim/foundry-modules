// Map water: broken horizontal lines, close together, thinning out in places - the convention for
// open water on a drawn map. Nearly horizontal rather than exactly, so the breaks do not line up.
import {rng, periodicField, hatchStrokes, svgDocument} from "../hatch-lib.mjs";

export const out = "hatch/water";
export const variants = 3;

export function build({size, variant}) {
  const rand = rng(4300 + (variant*277));
  const shape = periodicField(rand, {terms: 5, maxFreq: 3});
  const ink = periodicField(rand, {terms: 5, maxFreq: 5});
  const unit = size / 1024;
  return svgDocument({
    size,
    paper: "#dfe6e3",
    layers: [
      {
        colour: "#2f4f5c", opacity: 0.80,
        strokes: hatchStrokes({
          size, p: 8, q: 1, m: 3, phase: rand(),
          waver: 5.0*unit, step: 15*unit, weight: 2.1*unit, weightVary: 0.55, gap: 0.46,
          shape, ink
        })
      },
      {
        colour: "#2f4f5c", opacity: 0.45,
        strokes: hatchStrokes({
          size, p: 8, q: -1, m: 3, phase: rand(),
          waver: 4.0*unit, step: 15*unit, weight: 1.6*unit, weightVary: 0.5, gap: 0.62,
          shape: ink, ink: shape
        })
      }
    ]
  });
}
