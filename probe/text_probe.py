"""U1-U3: run the 50 template prompts through two LLMs and BERT.

Usage:  python -m probe.text_probe            (all models)
        python -m probe.text_probe gpt2 bert  (selected models)
"""
import json
import sys
import time

from .config import BERT, LLMS, RESULTS, prompts
from .models import CausalProber, MaskedProber
from .scoring import aggregate, score


def run_model(key: str, spec: dict, kind: str) -> dict:
    print(f"\n== {spec['label']} ({spec['hf_id']}) ==")
    prober = CausalProber(spec["hf_id"]) if kind == "causal" else MaskedProber(spec["hf_id"])
    form = "causal" if kind == "causal" else "masked"
    rows = []
    t0 = time.time()
    for occ, tid, text in prompts(form):
        out = prober.probe(text)
        s = score(out["words"])
        rows.append({"occupation": occ, "template": tid, "prompt": text,
                     **s, "words": out["words"], "top": out["top"]})
        print(f"  {text:<55} male share {s['male_share']:.2f}")
    result = {"model": key, "label": spec["label"], "hf_id": spec["hf_id"], "kind": kind,
              "prompts": rows, "by_occupation": aggregate(rows),
              "seconds": round(time.time() - t0, 1)}
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / f"text_{key}.json").write_text(json.dumps(result, indent=2))
    return result


def main(selected=None):
    jobs = [(k, v, "causal") for k, v in LLMS.items()] + [(k, v, "masked") for k, v in BERT.items()]
    for key, spec, kind in jobs:
        if not selected or key in selected:
            run_model(key, spec, kind)


if __name__ == "__main__":
    main(sys.argv[1:])
