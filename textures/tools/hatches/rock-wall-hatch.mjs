// The classic hatched wall of an old module map: ink cross-hatching on aged paper, read as solid
// rock. Two families crossing at a shallow angle, broken into pen strokes, with a third sparse
// family for weight in the hollows.
import {rng, periodicField, hatchStrokes, svgDocument} from "../hatch-lib.mjs";

export const out = "hatch/rock-wall";
export const variants = 3;

export function build({size, variant}) {
  const rand = rng(1700 + (variant*131));
  const shape = periodicField(rand, {terms: 5, maxFreq: 4});
  const ink = periodicField(rand, {terms: 6, maxFreq: 6});
  const tone = periodicField(rand, {terms: 4, maxFreq: 3});
  const unit = size / 1024;
  return svgDocument({
    size,
    paper: "#e9e0cb",
    layers: [
      {
        colour: "#2a2219", opacity: 0.92,
        strokes: hatchStrokes({
          size, p: 2, q: 1, m: 11, phase: rand(),
          waver: 2.6*unit, step: 13*unit, weight: 2.3*unit, weightVary: 0.5, gap: 0.26,
          shape, ink
        })
      },
      {
        colour: "#2a2219", opacity: 0.86,
        strokes: hatchStrokes({
          size, p: -1, q: 2, m: 11, phase: rand(),
          waver: 2.2*unit, step: 13*unit, weight: 2.0*unit, weightVary: 0.5, gap: 0.34,
          shape: tone, ink
        })
      },
      {
        colour: "#1d1710", opacity: 0.55,
        strokes: hatchStrokes({
          size, p: 2, q: 1, m: 5, phase: rand(),
          waver: 3.4*unit, step: 17*unit, weight: 3.0*unit, weightVary: 0.4, gap: 0.55,
          shape, ink: tone
        })
      }
    ]
  });
}
