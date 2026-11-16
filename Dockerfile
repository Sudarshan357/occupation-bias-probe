FROM python:3.11-slim

# Everything the app needs lives under /app, which the host never mounts over.
ENV HF_HOME=/app/.hf_cache \
    HF_HUB_DISABLE_XET=1 \
    PORT=7860 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# CPU-only torch first: the default Linux wheel drags in ~2.5 GB of unused CUDA libs.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Bake the three text models into the image so the live probe never waits on a download.
RUN python -c "from transformers import AutoTokenizer, AutoModelForCausalLM, AutoModelForMaskedLM; \
    llms = ['gpt2', 'Qwen/Qwen2.5-0.5B']; \
    [AutoTokenizer.from_pretrained(m) for m in llms]; \
    [AutoModelForCausalLM.from_pretrained(m) for m in llms]; \
    AutoTokenizer.from_pretrained('bert-base-uncased'); \
    AutoModelForMaskedLM.from_pretrained('bert-base-uncased')"

EXPOSE 7860

# One worker: the models are held in memory. Threads keep the UI responsive.
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--timeout", "300", "--bind", "0.0.0.0:7860", "app:app"]
