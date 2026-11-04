#!/usr/bin/env python
"""Generate tileable textures with FLUX.1 [schnell].

    ~/venvs/flux-textures/bin/python tools/flux/generate.py \
        --prompt "top-down packed earth dungeon floor, small stones" \
        --out /tmp/dirt.png --count 4

FLUX.1 [schnell] is Apache-2.0, so what it makes here carries no licence of its own.

On fitting it into 24 GB
------------------------
The weights are about 31 GB in bf16: 22.15 GB of transformer, 8.87 GB of T5 text encoder, and a
quarter of a gigabyte between CLIP and the VAE. They never all have to be resident - the text
encoders run before the transformer does - so moving each part to the GPU only while it is needed
brings the peak down to the largest single part. But that part is the 22.15 GB transformer, and on
a 24 GB card with a desktop running there is not room for it plus activations.

So the default here is NF4: the transformer's weights are held 4-bit and expanded to bfloat16 as
they are used, which is about 6 GB, and the text encoder is held 8-bit at about 4.5 GB. Both fit at
once with room to spare. --precision bf16 is the unquantised path and is kept for a card that can
take it; on 24 GB it will run out of memory.

On tiling
---------
The usual recipe for seamless diffusion output - set every Conv2d to padding_mode="circular" - was
written for Stable Diffusion, whose denoiser is a convolutional U-Net. FLUX's denoiser is a
transformer over patch tokens and contains no convolutions at all, so that trick cannot reach it:
the only convolutions in the pipeline are in the VAE. Patching the VAE is still worth doing, since
it stops the decoder inventing an edge, but on its own it does not make the *content* wrap.

What does reach the transformer is rolling the latent between denoising steps. Shifting the whole
latent by a random offset each step, wrapping around, means no position is ever special and the
model is pushed towards an image that is consistent across the wrap - the same argument as the
parallel light in the POV-Ray scenes, applied to the sampler. It gets most of the way there.

So the honest arrangement is three things, in order: patch the VAE, roll the latent, and then
measure the result with tools/seam.mjs. Whatever is left over, --blend cross-fades away.
"""
import argparse
import random
import sys

import torch

DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell"


def patch_circular(module) -> int:
    """Give every convolution in a module circular padding. Returns how many were changed."""
    changed = 0
    for child in module.modules():
        if isinstance(child, torch.nn.Conv2d):
            child.padding_mode = "circular"
            changed += 1
    return changed


def rolling_callback(pipe, width, height, rng, steps):
    """Roll the latent by a random whole number of patches between steps, wrapping around.

    Never after the last step. A roll is a cyclic shift, which is harmless only if the image is
    already periodic - and the whole point is that it is not yet. Rolling after the final step
    therefore takes whatever discontinuity is left and *moves it into the middle of the picture*,
    where nothing can be done about it: seam.mjs looks at the border, and a cross-fade only reaches
    the border. Measured on water tiles, where a caustic network makes a straight line easy to see:
    rolling to the end put the worst row-to-row jump at rows 117 to 983, inside the frame, while
    not rolling at all left it at row 1021, which is the edge. Stop one step early and the residue
    goes back to the edge, where it can be fixed.
    """
    scale = pipe.vae_scale_factor * 2  # FLUX packs 2x2 latent patches into one token
    rows, cols = height // scale, width // scale

    def callback(pipeline, step, timestep, kwargs):
        latents = kwargs["latents"]
        if step >= (steps - 1):
            return kwargs
        try:
            unpacked = pipeline._unpack_latents(latents, height, width, pipeline.vae_scale_factor)
            shifted = torch.roll(
                unpacked,
                shifts=(rng.randrange(rows), rng.randrange(cols)),
                dims=(-2, -1),
            )
            kwargs["latents"] = pipeline._pack_latents(
                shifted, shifted.shape[0], shifted.shape[1], shifted.shape[2], shifted.shape[3]
            )
        except Exception as error:  # a pipeline whose internals moved: say so, do not pretend
            print(f"  latent rolling unavailable ({error}); falling back to no roll", file=sys.stderr)
            callback.disabled = True
        return kwargs

    callback.disabled = False
    return callback


def load_pipeline(args):
    """Build the pipeline at the asked-for precision."""
    from diffusers import FluxPipeline

    print(f"loading {args.model} at {args.precision} ...", flush=True)
    parts = {}
    if args.precision in ("nf4", "fp4", "int8"):
        from diffusers import BitsAndBytesConfig as DiffusersQuant, FluxTransformer2DModel
        from transformers import BitsAndBytesConfig as TransformersQuant, T5EncoderModel

        if args.precision in ("nf4", "fp4"):
            transformer_quant = DiffusersQuant(
                load_in_4bit=True, bnb_4bit_quant_type=args.precision, bnb_4bit_compute_dtype=torch.bfloat16)
            encoder_quant = TransformersQuant(
                load_in_4bit=True, bnb_4bit_quant_type=args.precision, bnb_4bit_compute_dtype=torch.bfloat16)
        else:
            transformer_quant = DiffusersQuant(load_in_8bit=True)
            encoder_quant = TransformersQuant(load_in_8bit=True)

        parts["transformer"] = FluxTransformer2DModel.from_pretrained(
            args.model, subfolder="transformer",
            quantization_config=transformer_quant, torch_dtype=torch.bfloat16)
        parts["text_encoder_2"] = T5EncoderModel.from_pretrained(
            args.model, subfolder="text_encoder_2",
            quantization_config=encoder_quant, torch_dtype=torch.bfloat16)

    pipe = FluxPipeline.from_pretrained(args.model, torch_dtype=torch.bfloat16, **parts)
    if args.offload:
        pipe.enable_model_cpu_offload()
    elif args.precision == "bf16":
        pipe.to("cuda")
    return pipe


def report_vram(label):
    if torch.cuda.is_available():
        peak = torch.cuda.max_memory_allocated() / 2**30
        free, total = (x / 2**30 for x in torch.cuda.mem_get_info())
        print(f"  {label}: peak {peak:.1f} GB allocated, {free:.1f} of {total:.1f} GB free", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--negative", default=None, help="ignored by schnell, accepted for convenience")
    ap.add_argument("--out", required=True, help="output png; with --count, _1.._n is appended")
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--steps", type=int, default=4, help="schnell is a 4-step model")
    ap.add_argument("--guidance", type=float, default=0.0, help="schnell is distilled; 0 is correct")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--no-roll", action="store_true", help="skip latent rolling")
    ap.add_argument("--no-circular", action="store_true", help="skip circular padding in the VAE")
    ap.add_argument("--precision", choices=("nf4", "fp4", "int8", "bf16"), default="nf4",
                    help="how the transformer's weights are held; bf16 needs more than 24 GB. "
                         "nf4 and fp4 are both 4-bit: nf4 spaces its levels for normally distributed "
                         "weights and is usually the better of the two at the same size. NVFP4 is not "
                         "an option - it needs Blackwell, and this is Ada: fp8 tensor cores, no fp4")
    ap.add_argument("--offload", action="store_true", default=True,
                    help="keep the pipeline on the CPU between stages (default: on)")
    ap.add_argument("--no-offload", dest="offload", action="store_false")
    args = ap.parse_args()

    if args.size % 16:
        ap.error("--size must be a multiple of 16")

    pipe = load_pipeline(args)

    if not args.no_circular:
        n = patch_circular(pipe.vae)
        print(f"circular padding: {n} convolutions in the VAE", flush=True)

    base = args.seed if args.seed is not None else random.randrange(2**31)
    stem = args.out[:-4] if args.out.endswith(".png") else args.out

    for index in range(args.count):
        seed = base + index
        generator = torch.Generator("cpu").manual_seed(seed)
        callback = None if args.no_roll else rolling_callback(pipe, args.size, args.size, random.Random(seed), args.steps)
        image = pipe(
            prompt=args.prompt,
            width=args.size,
            height=args.size,
            num_inference_steps=args.steps,
            guidance_scale=args.guidance,
            generator=generator,
            callback_on_step_end=callback,
            callback_on_step_end_tensor_inputs=["latents"] if callback else None,
        ).images[0]
        target = f"{stem}.png" if args.count == 1 else f"{stem}_{index + 1}.png"
        image.save(target)
        print(f"{target}  seed {seed}", flush=True)
        report_vram("vram")

    print("now check it tiles:  node modules/dewarim-textures/tools/seam.mjs <image> --fix", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
