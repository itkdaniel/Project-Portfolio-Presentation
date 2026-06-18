"""
/v1/ai/* inference endpoints.

All torch calls are wrapped in anyio.to_thread.run_sync() to keep the
FastAPI event loop non-blocking during CPU/GPU forward passes.

Batching:
  - `InferenceBatcher` (cross-request 10 ms drain worker) is used for embed
    and batch-classify when app.state.batcher is set by the lifespan.
  - Falls back to direct inference when batcher is unavailable (e.g. tests).

Cache strategy (embed):
  - One Redis key per text: ai:embed:{sha256(text)}
  - Pipeline multi-key GET first → compute only misses → pipeline SET misses
  - TTL: settings.embed_cache_ttl (default 1800 s)
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional, Union

import anyio
import numpy as np
import torch
import torch.nn.functional as F
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from app.config import Settings

router = APIRouter(prefix="/v1/ai", tags=["inference"])

INTENT_LABELS = [
    "microservices_inquiry",
    "devops_inquiry",
    "ai_ml_inquiry",
    "pricing_inquiry",
    "general_support",
]


# ── Request / Response schemas ────────────────────────────────────────────────

class ErrorEnvelope(BaseModel):
    error: str
    code: str
    details: Optional[Dict[str, Any]] = None
    request_id: str


class ClassifyRequest(BaseModel):
    text: Optional[str] = Field(None, min_length=1, max_length=1000)
    texts: Optional[List[str]] = Field(None, min_length=1, max_length=32)
    top_k: int = Field(3, ge=1, le=5)

    @model_validator(mode="after")
    def require_text_or_texts(self):
        if self.text is None and self.texts is None:
            raise ValueError("Either 'text' or 'texts' must be provided")
        return self

    @property
    def all_texts(self) -> List[str]:
        if self.texts is not None:
            return self.texts
        return [self.text]  # type: ignore[list-item]

    @property
    def is_batch(self) -> bool:
        return self.texts is not None


class ClassifyResult(BaseModel):
    text: str
    predictions: List[Dict[str, Any]]


class ClassifyResponse(BaseModel):
    text: Optional[str] = None
    predictions: Optional[List[Dict[str, Any]]] = None
    results: Optional[List[ClassifyResult]] = None
    device: str
    request_id: str


class EmbedRequest(BaseModel):
    texts: List[str] = Field(..., min_length=1, max_length=32)


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dim: int
    cached: bool
    request_id: str


class SimilarityRequest(BaseModel):
    text_a: str = Field(..., min_length=1)
    text_b: str = Field(..., min_length=1)


class SimilarityResponse(BaseModel):
    text_a: str
    text_b: str
    similarity: float
    request_id: str


class FillMaskRequest(BaseModel):
    text: str = Field(..., description="Text with [MASK] token")
    top_k: int = Field(5, ge=1, le=20)


class FillMaskResponse(BaseModel):
    text: str
    predictions: List[Dict[str, Any]]
    request_id: str


# ── Dependency helpers ────────────────────────────────────────────────────────

def _require_model(request: Request):
    state = request.app.state
    if state.model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return state.model


def _require_tokenizer(request: Request):
    state = request.app.state
    if state.tokenizer is None:
        raise HTTPException(status_code=503, detail="Tokenizer not ready")
    return state.tokenizer


def _get_redis(request: Request):
    return getattr(request.app.state, "redis", None)


def _get_settings(request: Request) -> Settings:
    return request.app.state.settings


def _get_batcher(request: Request):
    return getattr(request.app.state, "batcher", None)


# ── Per-text cache helpers ────────────────────────────────────────────────────

def _text_cache_key(text: str) -> str:
    """One Redis key per text — SHA-256 for collision resistance."""
    return f"ai:embed:{hashlib.sha256(text.encode()).hexdigest()}"


async def _pipeline_cache_get(redis, keys: List[str]) -> List[Optional[str]]:
    """O(1) RTT: fetch all keys in one pipeline round-trip."""
    if redis is None:
        return [None] * len(keys)
    async with redis.pipeline(transaction=False) as pipe:
        for k in keys:
            pipe.get(k)
        return await pipe.execute()


async def _pipeline_cache_set(redis, kv: Dict[str, str], ttl: int) -> None:
    """O(1) RTT: set all keys with TTL in one pipeline round-trip."""
    if redis is None:
        return
    async with redis.pipeline(transaction=False) as pipe:
        for k, v in kv.items():
            pipe.setex(k, ttl, v)
        await pipe.execute()


# ── Inference helpers (sync — run in anyio thread) ────────────────────────────

def _sync_encode(tokenizer, texts: List[str], max_len: int, device: str) -> dict:
    batch_ids, batch_mask = [], []
    for text in texts:
        enc = tokenizer.encode(text, max_length=max_len, padding=True)
        batch_ids.append(enc["input_ids"])
        batch_mask.append(enc["attention_mask"])
    return {
        "input_ids":      torch.tensor(batch_ids, dtype=torch.long, device=device),
        "attention_mask": torch.tensor(batch_mask, dtype=torch.long, device=device),
    }


def _sync_embed(model, tokenizer, texts: List[str], max_len: int, device: str) -> np.ndarray:
    enc = _sync_encode(tokenizer, texts, max_len, device)
    with torch.no_grad():
        outputs = model(**enc)
        pooled  = outputs["pooled"]
        normed  = F.normalize(pooled, p=2, dim=-1)
    return normed.cpu().numpy()


def _sync_classify_one(
    model, tokenizer, text: str, top_k: int, max_len: int, device: str, intent_labels: List[str]
) -> List[Dict]:
    enc = _sync_encode(tokenizer, [text], max_len, device)
    with torch.no_grad():
        outputs = model(**enc)
        probs   = F.softmax(outputs["logits"][0], dim=-1).cpu().tolist()
    indexed = sorted(enumerate(probs), key=lambda x: x[1], reverse=True)
    return [{"label": intent_labels[i], "score": round(s, 4)} for i, s in indexed[:top_k]]


def _sync_classify_batch(
    model, tokenizer, texts: List[str], top_k: int, max_len: int, device: str, intent_labels: List[str]
) -> List[List[Dict]]:
    """Single forward pass for the entire batch."""
    enc = _sync_encode(tokenizer, texts, max_len, device)
    with torch.no_grad():
        outputs = model(**enc)
        all_probs = F.softmax(outputs["logits"], dim=-1).cpu().tolist()
    results = []
    for probs in all_probs:
        indexed = sorted(enumerate(probs), key=lambda x: x[1], reverse=True)
        results.append([{"label": intent_labels[i], "score": round(s, 4)} for i, s in indexed[:top_k]])
    return results


def _sync_fill_mask(model, tokenizer, text: str, top_k: int, max_len: int, device: str):
    from app.model.tokenizer import SPECIAL_TOKENS
    enc       = _sync_encode(tokenizer, [text], max_len, device)
    input_ids = enc["input_ids"][0].tolist()
    mask_id   = SPECIAL_TOKENS["[MASK]"]
    try:
        mask_pos = input_ids.index(mask_id)
    except ValueError:
        return None

    with torch.no_grad():
        hidden      = model.encoder(**enc)
        mask_hidden = hidden[0, mask_pos, :]
        vocab_emb   = model.encoder.token_emb.weight
        logits      = torch.matmul(mask_hidden, vocab_emb.T)
        probs       = F.softmax(logits, dim=-1)
        top_probs, top_ids = probs.topk(top_k)

    return [
        {
            "token":    tokenizer.decode([tid.item()], skip_special_tokens=False),
            "token_id": tid.item(),
            "score":    round(prob.item(), 4),
        }
        for tid, prob in zip(top_ids, top_probs)
    ]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest, request: Request):
    request_id = str(uuid.uuid4())
    model      = _require_model(request)
    tokenizer  = _require_tokenizer(request)
    settings   = _get_settings(request)
    device     = request.app.state.device

    if req.is_batch:
        # Batch path: single forward pass over all texts in the list.
        # (InferenceBatcher is scoped to embedding; classify uses direct batch.)
        all_preds = await anyio.to_thread.run_sync(
            lambda: _sync_classify_batch(
                model, tokenizer, req.all_texts, req.top_k,
                settings.max_seq_len, device, settings.intent_labels
            )
        )
        results = [
            ClassifyResult(text=t, predictions=p)
            for t, p in zip(req.all_texts, all_preds)
        ]
        return ClassifyResponse(results=results, device=device, request_id=request_id)

    # Single-text path
    preds = await anyio.to_thread.run_sync(
        lambda: _sync_classify_one(
            model, tokenizer, req.text, req.top_k,
            settings.max_seq_len, device, settings.intent_labels
        )
    )
    return ClassifyResponse(
        text=req.text,
        predictions=preds,
        device=device,
        request_id=request_id,
    )


@router.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest, request: Request):
    request_id = str(uuid.uuid4())
    model      = _require_model(request)
    tokenizer  = _require_tokenizer(request)
    settings   = _get_settings(request)
    redis      = _get_redis(request)
    batcher    = _get_batcher(request)
    device     = request.app.state.device

    # Per-text cache keys + pipeline lookup
    keys        = [_text_cache_key(t) for t in req.texts]
    cached_vals = await _pipeline_cache_get(redis, keys)

    hits  = {i: json.loads(v) for i, v in enumerate(cached_vals) if v is not None}
    miss_indices = [i for i, v in enumerate(cached_vals) if v is None]
    miss_texts   = [req.texts[i] for i in miss_indices]

    if miss_texts:
        if batcher is not None:
            miss_embs = await batcher.submit(miss_texts)
        else:
            miss_embs = await anyio.to_thread.run_sync(
                lambda: _sync_embed(model, tokenizer, miss_texts, settings.max_seq_len, device).tolist()
            )

        # Write misses back to cache
        to_store = {keys[i]: json.dumps(emb) for i, emb in zip(miss_indices, miss_embs)}
        await _pipeline_cache_set(redis, to_store, settings.embed_cache_ttl)

        for i, emb in zip(miss_indices, miss_embs):
            hits[i] = emb

    embeddings = [hits[i] for i in range(len(req.texts))]

    return EmbedResponse(
        embeddings=embeddings,
        dim=model.config.d_model,
        cached=len(miss_texts) == 0,
        request_id=request_id,
    )


@router.post("/similarity", response_model=SimilarityResponse)
async def semantic_similarity(req: SimilarityRequest, request: Request):
    request_id = str(uuid.uuid4())
    model      = _require_model(request)
    tokenizer  = _require_tokenizer(request)
    settings   = _get_settings(request)
    device     = request.app.state.device

    embs = await anyio.to_thread.run_sync(
        lambda: _sync_embed(model, tokenizer, [req.text_a, req.text_b], settings.max_seq_len, device)
    )
    cos = float(np.dot(embs[0], embs[1]))

    return SimilarityResponse(
        text_a=req.text_a,
        text_b=req.text_b,
        similarity=round(cos, 4),
        request_id=request_id,
    )


@router.post("/fill-mask", response_model=FillMaskResponse)
async def fill_mask(req: FillMaskRequest, request: Request):
    request_id = str(uuid.uuid4())
    if "[MASK]" not in req.text.upper():
        raise HTTPException(status_code=400, detail="Text must contain [MASK] token")

    model     = _require_model(request)
    tokenizer = _require_tokenizer(request)
    settings  = _get_settings(request)
    device    = request.app.state.device

    result = await anyio.to_thread.run_sync(
        lambda: _sync_fill_mask(model, tokenizer, req.text, req.top_k, settings.max_seq_len, device)
    )

    if result is None:
        raise HTTPException(status_code=422, detail="[MASK] not found after tokenization")

    return FillMaskResponse(text=req.text, predictions=result, request_id=request_id)


@router.get("/models")
async def list_models(request: Request):
    checkpoint = request.app.state.settings.model_checkpoint
    models = []
    if checkpoint and os.path.isfile(checkpoint):
        models.append({
            "name": os.path.basename(checkpoint),
            "path": checkpoint,
            "loaded": True,
        })
    ckpt_dir = os.path.dirname(checkpoint) if checkpoint else "checkpoints"
    if os.path.isdir(ckpt_dir):
        for fname in os.listdir(ckpt_dir):
            if fname.endswith(".pt") and fname not in [m["name"] for m in models]:
                models.append({"name": fname, "path": os.path.join(ckpt_dir, fname), "loaded": False})
    return {"models": models, "count": len(models)}


@router.get("/status")
async def ai_status(request: Request):
    state = request.app.state
    return {
        "model_loaded":    state.model is not None,
        "tokenizer_ready": state.tokenizer is not None,
        "device":          state.device,
        "model_params":    state.model.count_parameters() if state.model else 0,
        "vocab_size":      len(state.tokenizer) if state.tokenizer else 0,
        "checkpoint":      state.settings.model_checkpoint or None,
        "batcher_active":  getattr(state, "batcher", None) is not None,
    }
