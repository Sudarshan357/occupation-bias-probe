"""U5: bias dashboard + live probe.

Run:   python app.py      then open http://127.0.0.1:5000
"""
import json
import os
import threading

from flask import Flask, jsonify, request, send_from_directory

from probe.config import (BERT, LLMS, OCCUPATIONS, REAL_WORLD_PCT_FEMALE,
                          RESULTS, ROOT, TEMPLATES)
from probe.scoring import score

app = Flask(__name__, static_folder=str(ROOT / "static"), static_url_path="/static")
_probers, _lock = {}, threading.Lock()


def get_probers():
    """Load the three text models once, on the first live probe."""
    with _lock:
        if not _probers:
            from probe.models import CausalProber, MaskedProber
            for k, v in LLMS.items():
                _probers[k] = ("causal", v["label"], CausalProber(v["hf_id"]))
            for k, v in BERT.items():
                _probers[k] = ("masked", v["label"], MaskedProber(v["hf_id"]))
    return _probers


@app.get("/")
def index():
    return send_from_directory(ROOT / "static", "index.html")


@app.get("/results/<path:name>")
def result_file(name):
    return send_from_directory(RESULTS, name)


@app.get("/api/results")
def results():
    models = []
    for key in list(LLMS) + list(BERT):
        f = RESULTS / f"text_{key}.json"
        if f.exists():
            models.append(json.loads(f.read_text()))
    img = RESULTS / "image_probe.json"
    return jsonify({
        "occupations": OCCUPATIONS,
        "templates": TEMPLATES,
        "real_world_pct_female": REAL_WORLD_PCT_FEMALE,
        "models": models,
        "images": json.loads(img.read_text()) if img.exists() else None,
    })


@app.post("/api/probe")
def live_probe():
    body = request.get_json(force=True)
    occ = str(body.get("occupation", "")).strip().lower()[:40]
    custom = str(body.get("prompt", "")).strip()[:200]
    if not occ and not custom:
        return jsonify({"error": "Enter an occupation or a prompt."}), 400

    out = []
    for key, (kind, label, prober) in get_probers().items():
        rows = []
        if custom:
            # LLMs read up to the blank; BERT needs a [MASK] (added at the end if missing).
            if kind == "causal":
                text = custom.split("[MASK]")[0].rstrip()
            else:
                text = custom if "[MASK]" in custom else custom.rstrip(" .") + " [MASK]."
            items = [("custom", text)]
        else:
            items = [(t["id"], t[kind].format(occ=occ)) for t in TEMPLATES]
        for tid, text in items:
            r = prober.probe(text)
            rows.append({"template": tid, "prompt": text, **score(r["words"]), "top": r["top"][:5]})
        avg = sum(r["male_share"] for r in rows) / len(rows)
        out.append({"model": key, "label": label, "male_share": avg, "rows": rows})
    return jsonify({"occupation": occ, "prompt": custom, "models": out})


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
