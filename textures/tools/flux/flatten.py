#!/usr/bin/env python
"""Take the lighting out of a texture, without taking the texture with it.

    ~/venvs/flux-textures/bin/python tools/flux/flatten.py in.png --out out.png [--sigma 170]

Superseded by tools/flatten.mjs, which does the same thing with nothing but ImageMagick on the PATH
- no venv, no numpy - and agrees with this to 0.28% RMSE. Kept because it is the original and what
the numbers below were measured with: it blurs by multiplying in the Fourier domain, an exact
Gaussian, where the Node port uses three wrapped box passes.

A diffusion model draws a lit scene, not a material: one part of the frame ends up brighter than
another. That survives a perfectly seamless wrap and shows up as broad banding the moment the tile
is repeated - which is the thing the POV-Ray scenes avoid by construction, with an orthographic
camera and parallel lights. The seam checker will not catch it, because there is no discontinuity
at the edge to catch; the trouble is in the middle.

So: estimate the illumination as a heavily blurred luminance, and divide it out.

Two details decide whether this works.

The blur has to wrap. A blur with ordinary edge handling sees darkness past the border and dims the
rim, putting in exactly the gradient we are removing. The blur here is done by multiplying in the
Fourier domain, which is periodic by definition - the right boundary for a tile.

The radius has to sit between the two scales: larger than the features, smaller than the gradient.
Too small and the blur still contains the stones, so dividing by it removes the stones - an early
attempt at sigma 70 over all three channels in gamma space took the measured contrast from 0.131 to
0.032 and the colour with it. Too large and the estimate collapses towards the global mean and
nothing is corrected: at sigma 171 on a 1024px tile the illumination variation only fell from 39%
to 18%. A twentieth of the image is about right - at sigma 50 the same tile went from 39.4% to
2.9% with contrast and saturation intact - but --sigma is there because it depends on the feature
size, and --report prints the number so the choice can be checked rather than guessed.

Only the luminance is divided out, so hue and saturation survive.
"""
import argparse

import numpy as np
from PIL import Image

SRGB_A = 0.055


def to_linear(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + SRGB_A) / (1 + SRGB_A)) ** 2.4)


def to_srgb(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, (1 + SRGB_A) * x ** (1 / 2.4) - SRGB_A)


def wrap_gaussian(plane, sigma):
    """Gaussian blur with periodic edges, as a multiplication in the Fourier domain."""
    h, w = plane.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    kernel = np.exp(-2 * (np.pi * sigma) ** 2 * (fy ** 2 + fx ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(plane) * kernel))


def illumination_variation(rgb, sigma):
    """How much the lighting alone varies, as a percentage of its mean. Under about 5% is flat."""
    luma = (0.2126 * rgb[..., 0]) + (0.7152 * rgb[..., 1]) + (0.0722 * rgb[..., 2])
    illumination = wrap_gaussian(luma, sigma)
    return 100 * illumination.std() / illumination.mean()


def flatten(image, sigma, strength=1.0, clip=3.0):
    rgb = to_linear(np.asarray(image.convert("RGB"), dtype=np.float64) / 255.0)
    luma = (0.2126 * rgb[..., 0]) + (0.7152 * rgb[..., 1]) + (0.0722 * rgb[..., 2])
    illumination = wrap_gaussian(luma, sigma)
    floor = max(illumination.mean() * 1e-3, 1e-6)
    gain = illumination.mean() / np.maximum(illumination, floor)
    gain = np.clip(gain, 1 / clip, clip)
    if strength != 1.0:
        gain = 1.0 + ((gain - 1.0) * strength)
    out = np.clip(to_srgb(rgb * gain[..., None]), 0.0, 1.0)
    return Image.fromarray(np.round(out * 255).astype(np.uint8))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", nargs="+")
    ap.add_argument("--out", default=None, help="output file; with several inputs, a suffix is used instead")
    ap.add_argument("--suffix", default="-flat")
    ap.add_argument("--sigma", type=float, default=None,
                    help="illumination radius in pixels (default: a twentieth of the image)")
    ap.add_argument("--strength", type=float, default=1.0, help="0 leaves it alone, 1 removes the gradient")
    ap.add_argument("--no-report", dest="report", action="store_false", default=True)
    for path in (args := ap.parse_args()).images:
        image = Image.open(path)
        sigma = args.sigma if args.sigma else (min(image.size) / 20)
        result = flatten(image, sigma, args.strength)
        target = args.out if (args.out and len(args.images) == 1) else path.rsplit(".", 1)[0] + args.suffix + ".png"
        result.save(target)
        note = ""
        if args.report:
            measure = min(image.size) / 11  # a fixed yardstick, so before and after are comparable
            before = illumination_variation(to_linear(np.asarray(image.convert("RGB"), dtype=np.float64) / 255.0), measure)
            after = illumination_variation(to_linear(np.asarray(result.convert("RGB"), dtype=np.float64) / 255.0), measure)
            note = f"  lighting {before:.1f}% -> {after:.1f}%"
        print(f"{target}  sigma {sigma:.0f}{note}")


if __name__ == "__main__":
    main()
