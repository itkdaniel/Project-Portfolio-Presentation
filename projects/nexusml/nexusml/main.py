"""
NexusML — Transformer Classification Service
FastAPI serving layer for the NexusTransformer model.
"""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import AsyncGenerator, List, Optional

import torch
import torch.nn.functional as F
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from nexusml.model.transformer import NexusTransformer
from nexusml.tokenizer import BPETokenizer
from nexusml.core.config import settings
from nexusml.core.cache import EmbeddingCache


# ── Startup / shutdown ─────────────────────────────────────────────────────

model: Optional[NexusTransformer] = None
tokenizer: Optional[BPETokenizer] = None
cache: Optional[EmbeddingCache]   = None
device: torch.device               = torch.device("cpu")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    global model, tokenizer, cache, device

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    tokenizer = BPETokenizer.load(settings.tokenizer_path)
    model = NexusTransformer(
        vocab_size  = tokenizer.vocab_size,
        d_model     = settings.d_model,
        n_heads     = settings.n_heads,
        n_layers    = settings.n_layers,
        d_ff        = settings.d_ff,
        num_classes = settings.num_classes,
    ).to(device).eval()

    if settings.model_path:
        ckpt = torch.load(settings.model_path, map_location=device)
        model.load_state_dict(ckpt["model_state_dict"])

    if settings.quantize:
        model = torch.quantization.quantize_dynamic(
            model, {torch.nn.Linear}, dtype=torch.qint8
        )

    cache = EmbeddingCache(settings.redis_url)

    yield

    if cache:
        await cache.close()


# ── App ────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="NexusML",
    description="PyTorch transformer for intent classification and semantic search.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"])


# ── Schemas ────────────────────────────────────────────────────────────────

class TextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096)

class SimilarityRequest(BaseModel):
    text_a: str
    text_b: str

class FillMaskRequest(BaseModel):
    text: str = Field(..., description="Text with a single [MASK] token")
    top_k: int = Field(5, ge=1, le=20)

class BatchEmbedRequest(BaseModel):
    texts: List[str] = Field(..., max_items=128)


# ── Helpers ────────────────────────────────────────────────────────────────

def _tokenize(text: str) -> torch.Tensor:
    ids = tokenizer.encode(text, max_length=512, padding=True)
    return torch.tensor([ids], dtype=torch.long, device=device)


def _get_embedding(text: str) -> torch.Tensor:
    with torch.no_grad():
        ids = _tokenize(text)
        out = model(ids)
        return out["embeddings"].squeeze(0)


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "device": str(device),
        "model_params": model.num_parameters if model else 0,
    }


@app.get("/ai/model-info")
async def model_info():
    return {
        "vocab_size":   tokenizer.vocab_size if tokenizer else 0,
        "d_model":      settings.d_model,
        "n_heads":      settings.n_heads,
        "n_layers":     settings.n_layers,
        "num_classes":  settings.num_classes,
        "device":       str(device),
        "quantized":    settings.quantize,
        "parameters":   model.num_parameters if model else 0,
    }


@app.post("/ai/classify")
async def classify(req: TextRequest):
    if model is None or model.classifier is None:
        raise HTTPException(503, "Classification head not loaded")
    t0 = time.monotonic()
    with torch.no_grad():
        ids  = _tokenize(req.text)
        out  = model(ids)
        logits = out["cls_logits"]
        probs  = F.softmax(logits, dim=-1).squeeze(0)
        label_idx  = probs.argmax().item()
        confidence = probs[label_idx].item()

    label = settings.class_labels[label_idx] if settings.class_labels else str(label_idx)
    scores = {
        (settings.class_labels[i] if settings.class_labels else str(i)): probs[i].item()
        for i in range(len(probs))
    }
    return {
        "label":         label,
        "confidence":    round(confidence, 4),
        "scores":        scores,
        "processing_ms": round((time.monotonic() - t0) * 1000, 2),
    }


@app.post("/ai/embed")
async def embed(req: TextRequest):
    t0     = time.monotonic()
    cached = await cache.get(req.text) if cache else None

    if cached is not None:
        return {
            "embedding":     cached,
            "dimensions":    len(cached),
            "cached":        True,
            "processing_ms": round((time.monotonic() - t0) * 1000, 2),
        }

    emb = _get_embedding(req.text).tolist()
    if cache:
        await cache.set(req.text, emb)

    return {
        "embedding":     emb,
        "dimensions":    len(emb),
        "cached":        False,
        "processing_ms": round((time.monotonic() - t0) * 1000, 2),
    }


@app.post("/ai/similarity")
async def similarity(req: SimilarityRequest):
    emb_a = _get_embedding(req.text_a)
    emb_b = _get_embedding(req.text_b)
    score = F.cosine_similarity(emb_a.unsqueeze(0), emb_b.unsqueeze(0)).item()
    interp = (
        "identical"    if score > 0.97 else
        "very_similar" if score > 0.85 else
        "similar"      if score > 0.70 else
        "related"      if score > 0.50 else
        "dissimilar"
    )
    return {"similarity": round(score, 4), "interpretation": interp}


@app.post("/ai/fill-mask")
async def fill_mask(req: FillMaskRequest):
    if "[MASK]" not in req.text:
        raise HTTPException(400, "Text must contain exactly one [MASK] token")

    mask_id = tokenizer.special_tokens.get("[MASK]", 103)
    ids     = tokenizer.encode(req.text, max_length=512, padding=True)
    mask_pos = ids.index(mask_id) if mask_id in ids else None
    if mask_pos is None:
        raise HTTPException(400, "Could not locate [MASK] in tokenized output")

    input_tensor = torch.tensor([ids], dtype=torch.long, device=device)
    with torch.no_grad():
        out    = model(input_tensor)
        logits = out["mlm_logits"][0, mask_pos]     # (vocab_size,)
        probs  = F.softmax(logits, dim=-1)
        top    = probs.topk(req.top_k)

    predictions = [
        {"token": tokenizer.decode([top.indices[i].item()]).strip(), "score": round(top.values[i].item(), 4)}
        for i in range(req.top_k)
    ]
    return {"predictions": predictions}


@app.post("/ai/batch-embed")
async def batch_embed(req: BatchEmbedRequest):
    t0   = time.monotonic()
    embs = []
    for text in req.texts:
        embs.append(_get_embedding(text).tolist())
    return {
        "embeddings":    embs,
        "count":         len(embs),
        "dimensions":    len(embs[0]) if embs else 0,
        "processing_ms": round((time.monotonic() - t0) * 1000, 2),
    }
