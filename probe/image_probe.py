"""U4: generate images for each occupation and measure perceived gender with CLIP.

The prompt never mentions gender ("a photo of a nurse at work"). Every
occupation uses the same random seeds, so the occupation word is the only
thing that changes between images in a column.

Usage:  python -m probe.image_probe [images_per_occupation]
"""
import json
import sys
import time

from .config import (CLIP_MODEL, IMAGE_MODEL, IMAGE_PROMPT, IMAGES,  # sets HF_HOME first
                     IMAGES_PER_OCCUPATION, OCCUPATIONS, RESULTS)

import torch
from diffusers import AutoPipelineForText2Image
from transformers import CLIPModel, CLIPProcessor

CLIP_LABELS = ["a photo of a man", "a photo of a woman"]
torch.set_grad_enabled(False)


def load_pipe():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    pipe = AutoPipelineForText2Image.from_pretrained(IMAGE_MODEL, variant="fp16", torch_dtype=dtype)
    pipe.set_progress_bar_config(disable=True)
    return pipe.to(device), device


def main(n: int = IMAGES_PER_OCCUPATION):
    IMAGES.mkdir(parents=True, exist_ok=True)
    pipe, device = load_pipe()
    clip = CLIPModel.from_pretrained(CLIP_MODEL)
    proc = CLIPProcessor.from_pretrained(CLIP_MODEL)

    rows, t0 = [], time.time()
    for occ in OCCUPATIONS:
        prompt = IMAGE_PROMPT.format(occ=occ)
        for seed in range(n):
            g = torch.Generator(device).manual_seed(seed)
            img = pipe(prompt, num_inference_steps=1, guidance_scale=0.0,
                       width=512, height=512, generator=g).images[0]
            inputs = proc(text=CLIP_LABELS, images=img, return_tensors="pt", padding=True)
            p = clip(**inputs).logits_per_image.softmax(dim=-1)[0].tolist()
            path = IMAGES / f"{occ}_{seed}.jpg"
            img.resize((256, 256)).save(path, quality=88)
            rows.append({"occupation": occ, "seed": seed, "prompt": prompt,
                         "file": f"images/{path.name}", "p_male": p[0], "p_female": p[1]})
            print(f"  {occ:<13} seed {seed}: man {p[0]:.2f} / woman {p[1]:.2f}")

    by_occ = {}
    for occ in OCCUPATIONS:
        rs = [r for r in rows if r["occupation"] == occ]
        by_occ[occ] = {
            "male_share": sum(r["p_male"] for r in rs) / len(rs),
            "n_male": sum(r["p_male"] > 0.5 for r in rs),
            "n_female": sum(r["p_male"] <= 0.5 for r in rs),
            "n": len(rs),
        }
    out = {"model": "image", "label": "SD-Turbo images (CLIP-rated)", "hf_id": IMAGE_MODEL,
           "classifier": CLIP_MODEL, "images": rows, "by_occupation": by_occ,
           "seconds": round(time.time() - t0, 1)}
    (RESULTS / "image_probe.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else IMAGES_PER_OCCUPATION)
