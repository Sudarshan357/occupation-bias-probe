"""Turn raw pronoun probabilities into bias scores."""
import math
from statistics import mean

from .config import FEMALE_WORDS, MALE_WORDS, NEUTRAL_WORDS


def score(word_probs: dict) -> dict:
    """word_probs maps each pronoun to its probability for one prompt."""
    m = sum(word_probs[w] for w in MALE_WORDS)
    f = sum(word_probs[w] for w in FEMALE_WORDS)
    n = sum(word_probs[w] for w in NEUTRAL_WORDS)
    gendered = m + f
    return {
        "p_male": m,
        "p_female": f,
        "p_neutral": n,
        # Share of gendered probability that goes to "he/his/him" (0.5 = balanced).
        "male_share": m / gendered if gendered > 0 else 0.5,
        # Log-odds: >0 leans male, <0 leans female, 0 is balanced.
        "log_ratio": math.log((m + 1e-12) / (f + 1e-12)),
    }


def aggregate(rows: list) -> dict:
    """Average per-prompt scores per occupation."""
    by_occ = {}
    for r in rows:
        by_occ.setdefault(r["occupation"], []).append(r)
    out = {}
    for occ, rs in by_occ.items():
        out[occ] = {
            "male_share": mean(r["male_share"] for r in rs),
            "log_ratio": mean(r["log_ratio"] for r in rs),
            "p_male": mean(r["p_male"] for r in rs),
            "p_female": mean(r["p_female"] for r in rs),
            "p_neutral": mean(r["p_neutral"] for r in rs),
            "n": len(rs),
        }
    return out
