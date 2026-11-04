# Dewarim: Textures

**Requires:** nothing beyond Foundry v14 — system-agnostic. Shown as a palette folder by
`dewarim-map-painter`.

Seamless top-down textures, rendered with [POV-Ray](https://www.povray.org/) from the scene files in
`tools/scenes/`. Nothing is painted by hand, so any of them can be recoloured, rescaled or reseeded and
built again — and a new one is a new `.pov` file. Four things produce an asset here: a `.pov` scene, a
drawn SVG tile, a FLUX recipe, and the flat named colours; `render.mjs --list` says which is which.

| Asset | Variants | For |
|---|---|---|
| `walls/rock-wall-light` | 4 | raw rock seen from above: stamping walls, the rock layer in *Carve* |
| `walls/block-wall-grey` | 3 | dressed masonry: stamping walls (tick *Blocks view*) or painting a wall area |
| `floors/rock-grey` | 3 | fractured cave floor, worked stone |
| `floors/dirt` | 4 | packed earth |
| `floors/wood-planks` | 3 | board floors, decking, bridges |
| `ground/grass` | 3 | meadow |
| `ground/sand` | 3 | beach, desert, arena floor |
| `liquids/water-lake` | 3 | generated: open water with real caustics |
| `liquids/water-deep` | 3 | the murky pond — still green water, weed beds, lily pads |
| `liquids/lava` | 2 | broad molten pools |
| `liquids/lava-fine` | 2 | a broken crust — repeats far less visibly over a large area |
| `hatch/rock-wall` | 3 | drawn: ink cross-hatching on paper, the hatched wall of an old module map |
| `hatch/water` | 3 | drawn: broken horizontal lines, the map convention for open water |
| `hatch/diagonal` | 2 | drawn: plain 45° shading, for pits and out-of-bounds |
| `web-base/<name>` | 16 | flat colour: the HTML 4.01 names — `red`, `olive`, `navy`, `silver` … |
| `web-extended/<name>` | 132 | flat colour: the rest of the CSS names — `peru`, `cornflowerblue`, `darkslategrey` … |

Variants are the same recipe drawn differently (`floors/dirt_1` … `_4`): a different phase for every
periodic field and a different random seed, so a large area can be broken up by painting with two or
three of them. A scene declares how many it wants in a `// variants:` header.

```bash
node modules/dewarim-textures/tools/render.mjs            # all of them, into assets/
node modules/dewarim-textures/tools/render.mjs --only lava --size 2048
node modules/dewarim-textures/tools/render.mjs --list
```

Needs `povray`, ImageMagick (`convert`, `compare`) and `rsvg-convert` (Debian: `librsvg2-bin`) on
the PATH; no npm dependencies. A full build of everything is about two minutes.

## Drawn tiles

The `hatch/` textures are not rendered at all. Hatching (*Schraffur*) is clean repeating line work,
and a raytracer cannot draw it while a diffusion model will not keep it straight — so the lines are
drawn directly as SVG by the modules in `tools/hatches/`, built on `tools/hatch-lib.mjs`, and
rasterised by `rsvg-convert` at twice the size. Angle, spacing, stroke weight, waver and how much
of each line is left undrawn are all parameters.

**Not by ImageMagick, and this is not a preference.** Its built-in SVG renderer silently discards
`stroke-opacity`: the rock-wall tile with its three layer opacities and the same file with the
attribute stripped out render to *zero* differing pixels, where librsvg gives 51,226. Every hatch
layer sets an opacity — 0.92 / 0.86 / 0.55 for rock-wall, 0.80 / 0.45 for water — so all of them
shipped with the faint layers drawn as solid ink until 2026-11-03. Installing librsvg does not fix
it by itself either: ImageMagick never consults its own `svg => rsvg-convert` delegate, and
`convert tile.svg` stays byte-identical to `convert MSVG:tile.svg` with the binary present. So
`render.mjs` calls `rsvg-convert` directly, and **refuses** if it is missing rather than falling
back — the fallback's output looks perfectly fine and is wrong, which is the worst shape a failure
can take.

Twice the size is still worth it under a renderer that antialiases properly: against a 4096px
render of the same tile, 2× lands 0.0029 RMSE away where 1× is 0.0145, and both rasterise in 13 ms,
because the cost is in the path count and not the scale.

Drawing them makes the tiling exact rather than approximate, but it is not free. A family of
parallel lines at direction *(p, q)* only maps onto itself under a shift of one tile when the
spacing is `size / (m·hypot(p, q))` for a whole number *m* — so the angle is `atan(q/p)` for small
whole *p* and *q*, which is what hatching uses anyway. The same condition applies to the points a
line is drawn *through*: the shift slides a line along itself by `p·m·s`, so the segment step has to
divide the spacing, or the two copies of one line get their vertices, weight changes and breaks in
different places. Getting that wrong cost a 2.5× seam ratio on the water hatch. `test/hatch.test.mjs`
checks both conditions arithmetically for every angle in use.

Everything that varies along a line — its waver, its weight, where it breaks — comes from the same
sum-of-sines field the POV-Ray scenes use, so it is periodic over the tile too.

## Flat colours

`web-base/` and `web-extended/` are not textures at all, and that is what they are for: *the floor
is water*, *stamp dark brown for earth*, a room blocked out in `dimgray` before anyone has decided
what it is made of. One file per named web colour, 64×64 of a single value.

- **`web-base`** — the 16 names from HTML 4.01, which is the Windows VGA palette: `aqua`, `black`,
  `blue`, `fuchsia`, `gray`, `green`, `lime`, `maroon`, `navy`, `olive`, `purple`, `red`, `silver`,
  `teal`, `white`, `yellow`. Most maps never need more.
- **`web-extended`** — the other 132, for when `peru`, `saddlebrown` or `darkslategrey` is exactly
  the word for it.

Together they are the whole CSS Color 4 named-colour set, 148 names, and they **partition** it
rather than overlap: the extended list as published contains the 16 basic names, so writing both
as they stand would ship sixteen colours twice. `web-base` is held to exactly the 16 names
HTML 4.01 defines, which is why `grey` sits in `web-extended` although `gray` does not — the
standard named only the American spelling in 1999.

Two sources, held against each other:

- [Wikipedia's web colors](https://en.wikipedia.org/wiki/Web_colors#HTML_color_names) for the 140
  of the CSS3 set. Both the hex and the decimal column of every row parsed and compared — they
  agree — and all 16 basic names checked to appear in the 140 with identical values.
- [CSS Color 4](https://www.w3.org/TR/css-color-4/#named-colors) for the 8 the chart does not
  carry. Its table holds 148 names, its own two columns agree on all of them, and it agrees with
  the chart on **every one of the 140**: no name missing, no value different.

Two independent tables agreeing row for row is why these values are not spot-checked further.
Both columns of each are kept in `tools/web-colors.mjs`, so an edited hex that no longer matches
its decimals fails a test, as does a British spelling that stops matching its American twin.

Three things about the standard, all inherited rather than chosen:

- Nine colours have two names: `aqua` = `cyan`, `fuchsia` = `magenta`, and the seven grey/gray
  pairs. So 148 names are 139 colours, and both spellings are there — the file a GM reaches for
  should be the word they typed.
- `rebeccapurple` (#663399) is in CSS Color 4 and no earlier list. It was added in 2014 in memory
  of Rebecca Meyer, the daughter of Eric Meyer, who died at six.
- `darkgray` (#a9a9a9) is **lighter** than `gray` (#808080), because X11's grey ramp and HTML's
  grey were set by different people. It is wrong and it is the standard, so it is what the file
  holds.

**Written lossless, and that is not a preference.** A swatch's entire content is one RGB value, so
a lossy encoder that moves it has destroyed the only thing in the file — at quality 88, #1a6ec8
came back as (28,109,200), a file named after a standard colour holding a different one. Lossless
is also *smaller* here, 44 bytes against 88, because a constant image is what a lossless predictor
does best: 148 colours are 6 kB in total. Every one is read back with `identify` after it is
written and the build prints how many came back exact, because a colour named `cornflowerblue` had
better be #6495ed.

They need no seam argument: every pixel is the same, so the last column equals the first.

```bash
node modules/dewarim-textures/tools/render.mjs --only web-base
node modules/dewarim-textures/tools/render.mjs --only cornflowerblue
```

## Why these tile

The map painter fills cells with `ctx.createPattern(image, "repeat")`, so a texture that does not tile
shows a seam on a grid every *N* cells. A scene says in a `// seamless:` header how it earns its wrap.

**`construction`** (the default) — the scene is periodic to begin with, so the render already tiles and
every pixel is real detail:

- The camera is **orthographic** and the lights are **parallel**, so shading depends on the surface
  normal and not on where a point sits in the frame. A point light or a perspective camera would
  brighten the middle of the tile and give it away immediately.
- Large-scale variation comes from **sums of sines with whole-number frequencies**, which are exactly
  periodic on the unit square. POV-Ray's own noise patterns (`granite`, `bozo`, `bumps`) are *not*
  periodic, so they are only used for grain far finer than a seam could be seen at — fine noise has no
  correlation along the cut, so there is no line for the eye to find.
- Scattered objects (gravel, grass blades, wall blocks) are placed in one period and then repeated over
  the 3×3 neighbourhood by `Wrap()`. Each is textured *before* it is translated, so its copies carry
  the same surface.
- Anything that stays clear of the border needs none of this. `InnerPos()` places an object against the
  **camera frame** with room to spare, and it can then be as disorderly as it likes.

**`blend`** — the scene is rendered a little wider than one period, and `render.mjs` cross-fades the
overlap onto the opposite edge: the first column of the output is the content that continues past the
last one, fading into it. That lifts the constraint completely, so patterns with no period at all can
be used — `crackle` for fractured rock is the reason the mode exists, since stone does not break into
anything a sine can describe. The price is a band down one edge where two unrelated pieces of texture
are mixed: invisible on broken, grainy material, a visible ghost on anything with long straight
structure. `walls/rock-wall-light`, `floors/rock-grey`, `ground/sand` and `liquids/water-deep` use it;
the plank floor must not.

## Measured, not assumed

`tools/render.mjs` measures every result. It compares the wrap-around pair of edge lines against the
*typical* difference between neighbouring lines over the whole image (the image against itself rolled
by one pixel). About 1.0 means the wrap looks like any other pair of neighbours. It reports `SEAM` and
exits non-zero above 2.0, unless the absolute difference is under 1.2% of full scale, where nothing is
visible anyway.

The global roll matters: an earlier version used the single adjacent pair next to the edge as its
yardstick, and on a quiet texture that pair is nearly identical — a near-zero denominator that turned a
harmless difference into a ratio of 20.

`test/scenes.test.mjs` guards what is easiest to break by accident: a periodic field may only be handed
a coordinate scaled by a whole number, because `fField(u*2, v*2)` keeps period 1 and `fField(u*1.5, v*2)`
destroys it silently. It also fails on an asset in `assets/` that no scene produces any more.

## A field has to reach its colour map

The fields in `common.inc` are centred on 0.5, with measured standard deviations of 0.182
(`fField`), 0.180 (`fField2`) and 0.236 (`fLow`). Blending several with weights that sum to one is
a *mean*, so the result is narrower than its widest part: `fLow*0.65 + fField2*0.35` measures
σ 0.163 and spans 0.139 to 0.884. That uses about three quarters of a colour map written over 0 to
1 — the end stops are never reached and the ones near them do less than they look.

Stretch the deviation about 0.5 and the map is used as written:

```pov
#declare fDepth = function(u, v) { 0.5 + ((fLow(u, v) - 0.5)*0.6 + (fField2(u*2, v*2) - 0.5)*0.4)*1.6 }
```

Stretch too far and it clips, and **clipping does not look like clipping**. At ×2.4 the field spent
whole regions outside 0 to 1, flattened against the end stops, and came out as crisp dark islands
with hard edges — which read as *objects*, and cost three passes rewriting the weed bed, the scum
and the sunken stones before the water's own pigment was suspected. About ×1.6 keeps two sigma
inside the map. If an edit to a layer does not move the rendered mean, that layer is not what you
are looking at.

**The same applies to a `texture_map`, and there it decides the shape of things.** `floors/rock-grey`
fed its crack function into `[0.00 Stone][0.18 Stone][0.95 Crack][1.00 Crack]`, which looks like a
reasonable ramp and is not: measured over the tile, the function reaches 0.18 on **18.1%** of the
surface and 0.95 on **1.13%**, so a sixth of the floor was a half-blended smear and the crack had a
true core almost nowhere. Stops are not readable from the source — they are a claim about a
distribution, and the distribution has to be sampled.

Sampling is a dozen lines, because the fields are sums of sines with no state: reimplement the ones
a scene uses, evaluate them on a grid of the unit square, and print σ, the range, the clipped
fraction and the share of the surface falling in each band of the map.

## Two traps worth knowing

**Specular is a flat wash here.** With an orthographic camera, a parallel light and a flat surface, the
specular term is the same at every pixel. Early versions of the lava crust were two thirds specular,
which is why no amount of darkening the pigment made it black. Keep `specular` near zero on flat ground
and let it come back only where normals really vary — curved rubble, water ripples.

A *slight* normal does not buy an exemption, which is the version of this that caught us twice. The
pond surface carries `normal ... 0.17`, enough to call it rippled and not nearly enough to make the
highlight vary: `specular 0.30` was contributing 0.073 of a mean of 0.201 — **36% of the whole
picture**, almost uniformly — so the pigment had only the remainder to vary within. The test is one
render with `specular 0` and a look at the difference in means.

**A renderer may not paint its own edge, and may not say what it dropped.** ImageMagick's built-in
SVG renderer leaves the outermost pixel of the viewport unpainted — a black line down one edge of
every drawn tile, a 39% seam — and separately ignores `stroke-opacity` without a word. The first
announces itself; the second does not, and went unnoticed through three commits because solid ink
where a faint layer was asked for is not something a seam check or a glance will flag. Drawn tiles
now go through `rsvg-convert`; the overhanging background rect is kept anyway. The general shape:
**a renderer that ignores an attribute is more dangerous than one that fails on it**, so the probe
worth running on any rasteriser is to strip the attribute and check that the output changes.

**The frame is not the period.** `Wrap()` lets a scatter be drawn anywhere in `0 .. P`, but the camera
looks at the origin and sees `-P/2 .. +P/2`. An object that is *not* wrapped has to be placed against
the frame the camera actually sees. Placing unwrapped detail in `0 .. P` put half of it across the image
edge, cut in two — a seam of 8.6% on the water, and the renderer said nothing about it.

## Checking any image

`tools/seam.mjs` measures anything, not just what this module renders — a texture from elsewhere, or
one a model produced, is held to the same standard:

```bash
node modules/dewarim-textures/tools/seam.mjs some-texture.png
node modules/dewarim-textures/tools/seam.mjs some-texture.png --fix   # cross-fade, write -tiled.png
```

`--fix` applies the same cross-fade the `blend` scenes use. It costs a band of the image, so the
result is smaller than the input by the overlap. `--force` fixes even an image the verdict passed:
the floor below which a difference is called invisible holds for one spread over a texture and not
for one that lines up into a straight edge, and a generated water tile measured 0.6%, passed, and
drew a visible grid at every join.

## Taking the light out of an image

A tile can wrap perfectly and still be unusable. Whatever drew it may have drawn a *lit scene*
rather than a material, so one part of the frame is brighter than the other — and that gradient
survives a seamless wrap and comes back as broad banding the moment the tile repeats. `seam.mjs` is
blind to it by construction, because there is no discontinuity at the edge to find: the trouble is
in the middle.

```bash
node modules/dewarim-textures/tools/flatten.mjs some-texture.png     # writes -flat.png beside it
node modules/dewarim-textures/tools/flatten.mjs tile.png --out flat.png --sigma 80 --strength 0.7
```

It estimates the illumination as a heavily blurred luminance and divides it out — in linear light,
and on the luminance only, so hue and saturation are untouched. About a second on a 1024px tile.

Two things decide whether it works, and both were got wrong first.

**The blur has to wrap.** A blur with ordinary edge handling sees darkness past the border and dims
the rim, putting in exactly the gradient being removed. Every pass here indexes modulo the image, so
the estimate is periodic and the wrap comes through untouched: on a test tile lit 30% unevenly the
lighting fell to 3.4%, while the measured seam stayed at 1.9% and its ratio moved from 1.46 to 1.48.

**The radius has to sit between the two scales** — larger than the features, smaller than the
gradient. Too small and the blur still contains the stones, so dividing by it removes the stones: an
early attempt at sigma 70 over all three channels in gamma space took the measured contrast from
0.131 to 0.032 and the colour with it. Too large and the estimate collapses towards the global mean
and corrects nothing — at sigma 171 on a 1024px tile the variation only fell from 39% to 18%. A
twentieth of the shorter side is the default, `--sigma` is there because the feature size is what
really decides it, and the tool prints the before and the after so the choice can be checked rather
than guessed.

Checked against ground truth: a flat POV-Ray tile multiplied by a gradient comes back to within
0.037 RMSE of the original it was made from, where the lit version is 0.079 away, with the
original's contrast restored — 0.0553 lit, 0.0296 flattened, against the truth's 0.0305 — and
saturation unmoved at 0.193.

`tools/flatten-lib.mjs` holds the arithmetic with no files and no ImageMagick in it, and
`test/flatten.test.mjs` checks the properties that matter: that the blur commutes with a shift
(which an edge-handling blur does not), that it keeps the mean, that a whole-frequency sine comes
back as itself with no phase shift, that the gain stays inside its clip, and that a radius near the
feature size really does eat the features.

The arithmetic is in JavaScript rather than in ImageMagick because this is a Q16 build without
HDRI: every intermediate is clamped to 0 .. 1, and dividing by a dark illumination estimate would
simply saturate. So the pixels come out as a raw 16-bit dump and go back in the same way.

## Generating with FLUX.1 [schnell]

`tools/flux/generate.py` drives [FLUX.1 schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell)
for the textures that are easier to describe than to build — moss, rubble, foliage, worn plaster,
anything wanting the richness of a photograph. It is **Apache-2.0**, so its output carries no licence
of its own, unlike FLUX.1 dev, which is non-commercial. Set-up lives outside the repository: a venv at
`~/venvs/flux-textures` with `torch` (cu124), `diffusers` and `bitsandbytes`, and the weights in the
usual Hugging Face cache.

**Fitting it into 24 GB.** The weights are about 31 GB in bf16 — 22.15 GB of transformer, 8.87 GB of
T5 text encoder, a quarter of a gigabyte between CLIP and the VAE. They never all have to be resident,
since the text encoders run before the transformer, so CPU offload brings the peak down to the largest
single part. But that part is the 22.15 GB transformer, and a 24 GB card with a desktop on it has
about 21 GB free, so bf16 does not fit. The default is therefore `--precision nf4`: the transformer is
held 4-bit and expanded to bfloat16 as it is used (about 6 GB) and the text encoder 4-bit (about
4.5 GB), which leaves plenty of room. `int8` is the middle option and `bf16` is kept for a bigger card.

```bash
~/venvs/flux-textures/bin/python modules/dewarim-textures/tools/flux/generate.py \
  --prompt "top-down moss-covered flagstones, damp, overhead light" --out /tmp/moss.png --count 4
node modules/dewarim-textures/tools/flatten.mjs /tmp/moss_*.png
node modules/dewarim-textures/tools/seam.mjs /tmp/moss_*-flat.png --fix
```

Flatten before cross-fading, not after: the gradient runs across the whole frame, so it has to come
out while the whole frame is still there.

**Latent rolling stops one step short of the end.** Rolling is a cyclic shift, which is harmless
only on an image that already wraps — and not yet wrapping is the whole premise. Rolling after the
*final* step therefore takes whatever discontinuity is left and moves it into the middle of the
picture, where nothing can reach it: `seam.mjs` only looks at the border, and a cross-fade only
touches the border. Water made this obvious, because a caustic network turns any discontinuity into
a visible straight line: rolling to the end put the worst row-to-row jump at rows 117 to 983, inside
the frame, while not rolling at all left it at row 1021, the edge. Stopping one step early puts the
residue back at the edge, where `--fix` removes it.

Measured on this machine: 10.3 GB peak at `nf4`, four steps in about four seconds at 1024², roughly
half a minute for two images including the load. `fp4` costs and runs the same; `nf4` spaces its
levels for normally distributed weights and is usually the better of the two at the same size.
NVFP4 is not an option: it needs Blackwell, and this is Ada — fp8 tensor cores, no fp4.

**Flattening is not optional.** A diffusion model draws a lit scene, not a material, so one part of
the frame comes out brighter than another. That survives a perfectly seamless wrap and shows up as
broad banding the moment the tile repeats — and the seam checker cannot catch it, because there is
no discontinuity at the edge to catch: the trouble is in the middle. The first flagstone tile
measured 39% illumination variation, passed the seam check, and showed obvious bright bands at every
junction. Flattening divides out a heavily blurred luminance and brings that to 3%, leaving
contrast and colour alone. It is the same thing the POV-Ray scenes get for nothing from an
orthographic camera and parallel lights — *Taking the light out of an image* above has the tool and
what its radius has to be.

`tools/flux/flatten.py` was the original, and is kept because it is what the measurements above were
taken with. It blurs by multiplying in the Fourier domain, where `flatten.mjs` uses three wrapped
box passes — a near-Gaussian rather than a Gaussian. On the same input the two agree to 0.28% RMSE
and 2/255 peak and report the same lighting to a tenth of a percent, so use the Node one: it needs
nothing but ImageMagick, and so it works on any image without the venv.

**On making it tile.** The recipe everyone quotes — set every `Conv2d` to `padding_mode="circular"` —
was written for Stable Diffusion, whose denoiser is a convolutional U-Net. FLUX's denoiser is a
transformer over patch tokens with no convolutions in it at all, so that trick cannot reach the part
that decides the content; the only convolutions in the pipeline are in the VAE. The script patches the
VAE anyway, because it stops the decoder inventing an edge, and then **rolls the latent by a random
offset between denoising steps**, which does reach the transformer: no position is ever special, so
the model is pushed towards an image consistent across the wrap. It gets most of the way; `seam.mjs
--fix` closes the rest.

It does not replace the scene files. A diffusion model gives richness and no control — you cannot ask
it to darken the mortar — while a `.pov` file is a one-line edit and renders the same thing every time.
The combination worth having is both: structure from a render, richness from a pass of img2img over it,
and the seam check to confirm the result still tiles.

## Generated textures

`tools/generated/*.json` are recipes: a model, a prompt, a size and one seed per variant.
`render.mjs --only <name>` runs the lot — generate, flatten, cross-fade, resize — and writes the
webp. A plain `render.mjs` leaves them alone and says so, because each variant costs the venv, the
card and half a minute, and does not come back identical anyway.

It does reproduce, at least here: rebuilding all three variants from the recipe gave files
**byte-identical** to the ones picked by hand out of the candidate batch. That is a property of a
fixed seed on one machine with one set of library versions, not a guarantee across a driver or a
diffusers upgrade — but it means the recipe is the asset's source in the same sense a `.pov` file
is, and the library is not a folder of images nobody can account for.

**Order matters, all three steps.** Flatten first, while the whole frame is still present, because
that is the extent the gradient runs over. Cross-fade second, because that is what makes it wrap.
Resize last — and with `-virtual-pixel tile`, since `-resize` reads past the border with edge
clamping and puts a seam back into a tile that had none. Measured on the same tile: x ratio 1.08
wrap-aware against 1.34 clamped. ImageMagick's `-resize` ignores `-virtual-pixel` entirely, so it
has to be `-distort Resize`.

**Keep generated sizes at 1024.** The same prompt and the same seeds at 1152 came back with hard
horizontal stripes, duplicated blocks or a flat featureless slab in six of eight, where 1024 gave
four usable tiles out of six. schnell is trained around a megapixel and 1.33 of one is off its
distribution. The cross-fade's cost in pixels is paid back by upscaling afterwards, which a soft
texture survives easily; generating larger to avoid the upscale is a false economy.

**Expect to throw most of it away.** `liquids/water-lake`'s three seeds were picked by eye out of
eighteen. The rest had a band across the frame, a blob that repeated obviously once tiled, or so
little structure that they read as a flat slab. No measurement sorted them: a metric counting
straight lines inside the tile ranked the best candidate *worse* than one with visible joins,
because a caustic network is made of straight lines and the metric could not tell content from
defect. The seam check is the instrument for the border; for the middle it is still the eye.

## Licensing

Everything here is our own. POV-Ray ships a large texture library (`textures.inc`, `stones1.inc`,
`woods.inc`, `makegrass.inc`) and the community Object Collection has more, but both are copyleft —
CC BY-SA 3.0 and CC-LGPL respectively — so a rendered image made from them carries those terms with it.
None of it is used. Their patterns would not survive the periodicity requirement anyway: they are built
on `granite`, `marble`, `crackle` and `agate` with turbulence, none of which has a period. What that
library *is* good for is a shopping list of materials worth having.
