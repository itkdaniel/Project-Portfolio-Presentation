"""
/v1/ai/* inference endpoints.

All torch calls are wrapped in anyio.to_thread.run_sync() to keep the
FastAPI event loop non-blocking during CPU/GPU forward passes.

Cache strategy:
  - SHA-256 of sorted JSON(texts) → Redis key
  - 30-min TTL
  - Redis pipeline for batch multi-key lookups (O(1) per hit)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

import anyio
import numpy as np
import torch
import torch.nn.functional as F
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

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
    text: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(3, ge=1, le=5)


class ClassifyResponse(BaseModel):
    text: str
    predictions: List[Dict[str, Any]]
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

def _get_state(request: Request):
    return request.app.state


def _require_model(request: Request):
    state = _get_state(request)
    if state.model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return state.model


def _require_tokenizer(request: Request):
    state = _get_state(request)
    if state.tokenizer is None:
        raise HTTPException(status_code=503, detail="Tokenizer not ready")
    return state.tokenizer


def _get_redis(request: Request):
    return getattr(request.app.state, "redis", None)


def _get_settings(request: Request) -> Settings:
    return request.app.state.settings


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _cache_key(texts: List[str]) -> str:
    """SHA-256 keyed cache (not MD5) for stronger collision resistance."""
    payload = json.dumps(texts, sort_keys=True)
    return f"ai:embed:{hashlib.sha256(payload.encode()).hexdigest()}"


async def _batch_cache_get(redis, keys: List[str]) -> List[Optional[str]]:
    """Pipeline multi-key lookup — O(1) RTT instead of O(n)."""
    if redis is None:
        return [None] * len(keys)
    async with redis.pipeline(transaction=False) as pipe:
        for k in keys:
            pipe.get(k)
        return await pipe.execute()


async def _batch_cache_set(redis, kv: Dict[str, str], ttl: int) -> None:
    """Pipeline multi-key set with TTL."""
    if redis is None:
        return
    async with redis.pipeline(transaction=False) as pipe:
        for k, v in kv.items():
            pipe.setex(k, ttl, v)
        await pipe.execute()


# ── Inference helpers (sync — run in thread) ──────────────────────────────────

def _sync_encode(tokenizer, texts: List[str], max_len: int, device: str) -> dict:
    from app.model.tokenizer import SPECIAL_TOKENS
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


def _sync_classify(model, tokenizer, text: str, top_k: int, max_len: int, device: str, intent_labels: List[str]) -> List[Dict]:
    enc = _sync_encode(tokenizer, [text], max_len, device)
    with torch.no_grad():
        outputs = model(**enc)
        probs   = F.softmax(outputs["logits"][0], dim=-1).cpu().tolist()
    indexed = sorted(enumerate(probs), key=lambda x: x[1], reverse=True)
    return [{"label": intent_labels[i], "score": round(s, 4)} for i, s in indexed[:top_k]]


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

    preds = await anyio.to_thread.run_sync(
        lambda: _sync_classify(
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
    device     = request.app.state.device

    key = _cache_key(req.texts)
    cached_vals = await _batch_cache_get(redis, [key])

    if cached_vals[0] is not None:
        return EmbedResponse(
            embeddings=json.loads(cached_vals[0]),
            dim=model.config.d_model,
            cached=True,
            request_id=request_id,
        )

    embeddings = await anyio.to_thread.run_sync(
        lambda: _sync_embed(model, tokenizer, req.texts, settings.max_seq_len, device).tolist()
    )

    await _batch_cache_set(redis, {key: json.dumps(embeddings)}, settings.embed_cache_ttl)

    return EmbedResponse(
        embeddings=embeddings,
        dim=model.config.d_model,
        cached=False,
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
    if "[MASK]" not in req.text:
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
        "model_loaded":  state.model is not None,
        "tokenizer_ready": state.tokenizer is not None,
        "device":        state.device,
        "model_params":  state.model.count_parameters() if state.model else 0,
        "vocab_size":    len(state.tokenizer) if state.tokenizer else 0,
        "checkpoint":    state.settings.model_checkpoint or None,
    }
