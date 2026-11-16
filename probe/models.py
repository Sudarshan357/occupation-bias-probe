"""Model wrappers that return pronoun probabilities for one prompt."""
from .config import FEMALE_WORDS, MALE_WORDS, NEUTRAL_WORDS  # sets HF_HOME first

import torch
from transformers import (AutoModelForCausalLM, AutoModelForMaskedLM,
                          AutoTokenizer)

ALL_WORDS = MALE_WORDS + FEMALE_WORDS + NEUTRAL_WORDS
torch.set_grad_enabled(False)


class CausalProber:
    """Next-word probabilities from a left-to-right LLM (GPT-2, Qwen, ...)."""

    def __init__(self, hf_id: str):
        self.tok = AutoTokenizer.from_pretrained(hf_id)
        self.model = AutoModelForCausalLM.from_pretrained(hf_id, torch_dtype=torch.float32)
        self.model.eval()

    def _next_logprobs(self, ids):
        logits = self.model(torch.tensor([ids])).logits[0, -1]
        return torch.log_softmax(logits.float(), dim=-1)

    def probe(self, text: str, top_k: int = 8) -> dict:
        ctx = self.tok(text, add_special_tokens=False)["input_ids"]
        if getattr(self.tok, "bos_token_id", None) is not None and "gpt2" in self.model.name_or_path:
            ctx = [self.tok.bos_token_id] + ctx  # GPT-2 expects <|endoftext|> as a start token
        first = self._next_logprobs(ctx)

        words = {}
        for w in ALL_WORDS:
            # A word may be several tokens; multiply their probabilities.
            w_ids = self.tok(" " + w, add_special_tokens=False)["input_ids"]
            lp = first[w_ids[0]].item()
            for i in range(1, len(w_ids)):
                lp += self._next_logprobs(ctx + w_ids[:i])[w_ids[i]].item()
            words[w] = float(torch.tensor(lp).exp())

        probs = first.exp()
        top = torch.topk(probs, top_k)
        top_tokens = [{"token": self.tok.decode([i]), "p": float(p)}
                      for p, i in zip(top.values.tolist(), top.indices.tolist())]
        return {"words": words, "top": top_tokens}


class MaskedProber:
    """Fill-in-the-blank probabilities from BERT."""

    def __init__(self, hf_id: str):
        self.tok = AutoTokenizer.from_pretrained(hf_id)
        self.model = AutoModelForMaskedLM.from_pretrained(hf_id)
        self.model.eval()

    def probe(self, text: str, top_k: int = 8) -> dict:
        text = text.replace("[MASK]", self.tok.mask_token)
        enc = self.tok(text, return_tensors="pt")
        pos = (enc["input_ids"][0] == self.tok.mask_token_id).nonzero()[0].item()
        probs = torch.softmax(self.model(**enc).logits[0, pos], dim=-1)

        words = {}
        for w in ALL_WORDS:
            ids = self.tok(w, add_special_tokens=False)["input_ids"]
            words[w] = float(probs[ids[0]]) if len(ids) == 1 else 0.0

        top = torch.topk(probs, top_k)
        top_tokens = [{"token": self.tok.decode([i]).strip(), "p": float(p)}
                      for p, i in zip(top.values.tolist(), top.indices.tolist())]
        return {"words": words, "top": top_tokens}
