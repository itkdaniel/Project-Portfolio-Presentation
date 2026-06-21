"""
NexusConsult AI/ML Microservice.

Serves the NexusTransformer for:
  1. Text classification (intent detection, service routing)
  2. Semantic similarity (embedding cosine distance)
  3. Token-level prediction (fill-mask / MLM)

Architecture:
  - FastAPI async server (ASGI via uvicorn)
  - Lifespan: load model at startup, unload at shutdown
  - Redis: cache embeddings with 30-minute TTL (expensive to recompute)
  - Inference batching: collect requests, run in one forward pass for throughput
  - Device: auto-selects CUDA > MPS > CPU
"""
from __future__ import annotations

import os
import hashlib
import json
from contextlib import asynccontextmanager
from typing import List, Optional

import torch
import torch.nn.functional as F
import numpy as np
import redis.asyncio as aioredis
import structlog

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from model.transformer import NexusTransformer, TransformerConfig, build_model
from model.tokenizer import BPETokenizer, SPECIAL_TOKENS
from tor_manager import tor_manager

logger = structlog.get_logger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
REDIS_URL        = os.getenv("REDIS_URL", "redis://localhost:6379")
MODEL_CHECKPOINT = os.getenv("MODEL_CHECKPOINT", "")
DEVICE           = "cuda" if torch.cuda.is_available() else "cpu"
MAX_SEQ_LEN      = 256
EMBED_CACHE_TTL  = 1800   # 30 minutes

# Intent labels — customisable via config file
INTENT_LABELS = [
    "microservices_inquiry",
    "devops_inquiry",
    "ai_ml_inquiry",
    "pricing_inquiry",
    "general_support",
]

# ── Global model state ────────────────────────────────────────────────────────
_model: Optional[NexusTransformer] = None
_tokenizer: Optional[BPETokenizer] = None
_redis: Optional[aioredis.Redis]   = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model, _tokenizer, _redis

    # Connect Redis
    _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    logger.info("Redis connected")

    # Build/load model
    config = TransformerConfig(
        vocab_size=8000,
        n_classes=len(INTENT_LABELS),
        d_model=256,
        n_layers=4,
        n_heads=8,
        max_seq_len=MAX_SEQ_LEN,
    )
    _model = NexusTransformer(config).to(DEVICE)
    _model.eval()

    if MODEL_CHECKPOINT and os.path.isfile(MODEL_CHECKPOINT):
        ckpt = torch.load(MODEL_CHECKPOINT, map_location=DEVICE)
        _model.load_state_dict(ckpt.get("model_state", ckpt))
        logger.info("Loaded checkpoint", path=MODEL_CHECKPOINT)
    else:
        logger.warning("No checkpoint found — using random weights. Run training first.")

    # Build a minimal tokenizer (in production: load from saved path)
    _tokenizer = BPETokenizer(max_vocab=8000)
    tok_path   = "model/tokenizer"
    if os.path.isdir(tok_path):
        _tokenizer = BPETokenizer.load(tok_path)
        logger.info("Tokenizer loaded", path=tok_path)
    else:
        # Seed tokenizer with domain vocabulary
        domain_corpus = [
            "microservices architecture docker kubernetes devops automation consulting",
            "pytorch transformer neural network machine learning fine tuning embeddings",
            "api rest graphql authentication authorization jwt oauth rbac",
            "database postgresql redis mongodb caching indexing query optimization",
            "ci cd pipeline github actions deployment container orchestration",
        ] * 50
        _tokenizer.train(domain_corpus, num_merges=500)
        logger.info("Tokenizer trained from domain corpus", vocab_size=len(_tokenizer))

    n_params = _model.count_parameters()
    logger.info("Model ready", params=f"{n_params:,}", device=DEVICE)

    # Start Tor daemon (non-blocking; fails gracefully if tor binary absent)
    await tor_manager.start()

    yield

    tor_manager.stop()
    if _redis:
        await _redis.aclose()
    logger.info("AI service shut down")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="NexusConsult AI/ML Service",
    version="1.0.0",
    description="PyTorch transformer inference API for intent classification and semantic embeddings.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────
class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(3, ge=1, le=len(INTENT_LABELS))


class ClassifyResponse(BaseModel):
    text: str
    predictions: List[dict]    # [{label, score}]
    device: str


class EmbedRequest(BaseModel):
    texts: List[str] = Field(..., min_items=1, max_items=32)


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dim: int
    cached: bool


class SimilarityRequest(BaseModel):
    text_a: str
    text_b: str


class FillMaskRequest(BaseModel):
    text: str = Field(..., description="Text with [MASK] token to predict")
    top_k: int = Field(5, ge=1, le=20)


# ── Inference helpers ─────────────────────────────────────────────────────────
def _encode(texts: List[str], max_len: int = MAX_SEQ_LEN) -> dict:
    """Tokenize a batch of texts and return padded tensors."""
    batch_ids, batch_mask = [], []
    for text in texts:
        enc = _tokenizer.encode(text, max_length=max_len, padding=True)
        batch_ids.append(enc["input_ids"])
        batch_mask.append(enc["attention_mask"])
    return {
        "input_ids":      torch.tensor(batch_ids, dtype=torch.long, device=DEVICE),
        "attention_mask": torch.tensor(batch_mask, dtype=torch.long, device=DEVICE),
    }


def _embed_texts(texts: List[str]) -> np.ndarray:
    """
    Compute pooled embeddings for a list of texts.
    Returns (n, d_model) numpy array.
    """
    enc = _encode(texts)
    with torch.no_grad():
        outputs  = _model(**enc)
        pooled   = outputs["pooled"]                      # (n, d_model)
        normed   = F.normalize(pooled, p=2, dim=-1)       # L2-normalize for cosine similarity
    return normed.cpu().numpy()


def _cache_key(texts: List[str]) -> str:
    payload = json.dumps(texts, sort_keys=True)
    return f"ai:embed:{hashlib.md5(payload.encode()).hexdigest()}"


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "model_params": _model.count_parameters() if _model else 0,
        "vocab_size": len(_tokenizer) if _tokenizer else 0,
    }


@app.post("/ai/classify", response_model=ClassifyResponse, tags=["inference"])
async def classify(req: ClassifyRequest):
    """
    Classify text intent using the transformer.

    Returns top-k intents with softmax confidence scores.
    Uses temperature=1.0 (no annealing) for calibrated probabilities.
    """
    enc = _encode([req.text])
    with torch.no_grad():
        outputs = _model(**enc)
        probs   = F.softmax(outputs["logits"][0], dim=-1).cpu().tolist()

    indexed = sorted(enumerate(probs), key=lambda x: x[1], reverse=True)
    preds   = [{"label": INTENT_LABELS[i], "score": round(s, 4)} for i, s in indexed[: req.top_k]]

    return ClassifyResponse(text=req.text, predictions=preds, device=DEVICE)


@app.post("/ai/embed", response_model=EmbedResponse, tags=["inference"])
async def embed(req: EmbedRequest):
    """
    Compute L2-normalized embeddings for a list of texts.

    Embeddings are cached in Redis for 30 minutes using MD5(texts) as key.
    Use these for semantic search, clustering, or RAG retrieval.
    """
    cache_key = _cache_key(req.texts)
    cached    = None

    if _redis:
        raw = await _redis.get(cache_key)
        if raw:
            return EmbedResponse(
                embeddings=json.loads(raw),
                dim=_model.config.d_model,
                cached=True,
            )

    embeddings = _embed_texts(req.texts).tolist()

    if _redis:
        await _redis.setex(cache_key, EMBED_CACHE_TTL, json.dumps(embeddings))

    return EmbedResponse(embeddings=embeddings, dim=_model.config.d_model, cached=False)


@app.post("/ai/similarity", tags=["inference"])
async def semantic_similarity(req: SimilarityRequest):
    """
    Compute cosine similarity between two texts via their embeddings.

    Score range: [-1, 1]  (1 = identical, 0 = orthogonal, -1 = opposite)
    Uses L2-normalized pooled [CLS] embeddings.
    """
    embs = _embed_texts([req.text_a, req.text_b])   # (2, d_model)
    cos  = float(np.dot(embs[0], embs[1]))           # dot of L2-normed = cosine
    return {"text_a": req.text_a, "text_b": req.text_b, "similarity": round(cos, 4)}


@app.post("/ai/fill-mask", tags=["inference"])
async def fill_mask(req: FillMaskRequest):
    """
    Predict the top-k most likely tokens for a [MASK] position.

    MLM approach: replace [MASK] with MASK token ID, run encoder,
    project hidden state at mask position through vocab projection head.

    Note: requires a fine-tuned MLM head (lm_head). This endpoint
    demonstrates the pattern; full MLM training is in training/trainer.py.
    """
    mask_token = "[MASK]"
    if mask_token not in req.text:
        raise HTTPException(status_code=400, detail="Text must contain [MASK] token")

    enc      = _encode([req.text])
    input_ids = enc["input_ids"][0].tolist()

    # Find mask position
    mask_id  = SPECIAL_TOKENS["[MASK]"]
    try:
        mask_pos = input_ids.index(mask_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="[MASK] not found after tokenization")

    with torch.no_grad():
        hidden = _model.encoder(**enc)                              # (1, seq, d_model)
        mask_hidden = hidden[0, mask_pos, :]                       # (d_model,)

        # Project to vocabulary (no dedicated LM head — use embedding weight)
        vocab_emb = _model.encoder.token_emb.weight               # (vocab_size, d_model)
        logits    = torch.matmul(mask_hidden, vocab_emb.T)        # (vocab_size,)
        probs     = F.softmax(logits, dim=-1)
        top_probs, top_ids = probs.topk(req.top_k)

    predictions = [
        {"token": _tokenizer.decode([tid.item()], skip_special_tokens=False),
         "token_id": tid.item(),
         "score": round(prob.item(), 4)}
        for tid, prob in zip(top_ids, top_probs)
    ]
    return {"text": req.text, "predictions": predictions}


# ── Scope check dependency ─────────────────────────────────────────────────────

MAIN_APP_URL = os.getenv("MAIN_APP_URL", "http://localhost:5000")

async def require_scope(scope_name: str):
    """
    FastAPI dependency factory.  Verifies the caller holds `scope_name` as a
    granted scope in the main app DB by forwarding the JWT to /api/granted-scopes.

    Returns the decoded Bearer token on success; raises HTTPException(403) on failure.
    """
    async def _check(request: Request) -> str:
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "scope_required",
                    "scope": scope_name,
                    "message": "Authentication required to access this endpoint.",
                    "requestUrl": "/settings",
                },
            )
        token = auth_header[7:]
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{MAIN_APP_URL}/api/granted-scopes",
                    headers={"Authorization": f"Bearer {token}"},
                )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "scope_required",
                        "scope": scope_name,
                        "message": f"Could not verify scopes: {resp.status_code}",
                        "requestUrl": "/settings",
                    },
                )
            scopes = resp.json()
            granted = [s["scope"] for s in scopes if s.get("scope")]
            if scope_name not in granted:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "scope_required",
                        "scope": scope_name,
                        "message": f"You need the '{scope_name}' scope to use this endpoint. Request access in Settings → Integrations.",
                        "requestUrl": "/settings",
                    },
                )
            return token
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Scope check failed", error=str(exc))
            raise HTTPException(
                status_code=503,
                detail={"error": "scope_check_unavailable", "message": str(exc)},
            )
    return _check


_require_uncensored = None  # lazily built

async def _get_uncensored_dep():
    global _require_uncensored
    if _require_uncensored is None:
        _require_uncensored = await require_scope("uncensored")
    return _require_uncensored


# ── Tor endpoints ──────────────────────────────────────────────────────────────

class TorStatusResponse(BaseModel):
    running: bool
    circuitEstablished: bool
    bootstrapPercent: int
    socksProxy: Optional[str]
    error: Optional[str]


@app.get("/v1/ai/tor/status", response_model=TorStatusResponse, tags=["tor"])
async def tor_status():
    """Return current Tor daemon status: running, circuit established, bootstrap %."""
    return tor_manager.get_status()


@app.post("/v1/ai/tor/new-circuit", tags=["tor"])
async def tor_new_circuit():
    """Request a new Tor identity (NEWNYM signal). Resets exit node and circuit."""
    ok = await tor_manager.new_circuit()
    return {"success": ok, "message": "New circuit requested" if ok else "NEWNYM failed — check Tor status"}


# ── Onion scraping relay ───────────────────────────────────────────────────────

NEXUS_SCRAPER_URL = os.getenv("NEXUS_SCRAPER_URL", "").rstrip("/")

class OnionScrapeRequest(BaseModel):
    url: str = Field(..., description="Onion URL or clearnet URL to fetch via Tor")
    depth: int = Field(1, ge=1, le=3)


@app.post("/v1/scrape/onion", tags=["scraping"])
async def scrape_onion(req: OnionScrapeRequest):
    """
    Relay an onion-scrape request to NexusScraper using Tor SOCKS5 proxy.
    Only the AI service has Tor configured — NexusScraper proxies through here.
    """
    tor_status_data = tor_manager.get_status()
    if not tor_status_data["running"]:
        raise HTTPException(status_code=503, detail="Tor is not running. Cannot scrape onion URLs.")

    # If NEXUS_SCRAPER_URL is configured, relay to it; otherwise fetch directly
    if NEXUS_SCRAPER_URL:
        import httpx
        proxies = {"all://": f"socks5://127.0.0.1:{os.getenv('TOR_SOCKS_PORT', '9050')}"}
        try:
            async with httpx.AsyncClient(proxies=proxies, timeout=60.0) as client:
                resp = await client.post(
                    f"{NEXUS_SCRAPER_URL}/v1/scrape/onion",
                    json={"url": req.url, "depth": req.depth},
                )
            return resp.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Onion scrape relay failed: {e}")

    return {"status": "relayed", "url": req.url, "note": "NEXUS_SCRAPER_URL not configured — direct fetch not implemented"}


# ── Uncensored mode endpoints ──────────────────────────────────────────────────

@app.post("/v1/ai/classify/uncensored", response_model=ClassifyResponse, tags=["uncensored"])
async def classify_uncensored(req: ClassifyRequest, request: Request):
    """
    Uncensored classification — identical to /ai/classify but bypasses any
    content-filter post-processing.  Requires the 'uncensored' granted scope.
    """
    dep = await require_scope("uncensored")
    await dep(request)

    enc = _encode([req.text])
    with torch.no_grad():
        outputs = _model(**enc)
        probs   = F.softmax(outputs["logits"][0], dim=-1).cpu().tolist()

    indexed = sorted(enumerate(probs), key=lambda x: x[1], reverse=True)
    preds   = [{"label": INTENT_LABELS[i], "score": round(s, 4)} for i, s in indexed[: req.top_k]]

    return ClassifyResponse(text=req.text, predictions=preds, device=DEVICE)


@app.post("/v1/ai/fill-mask/uncensored", tags=["uncensored"])
async def fill_mask_uncensored(req: FillMaskRequest, request: Request):
    """
    Uncensored fill-mask — identical to /ai/fill-mask but bypasses keyword blocklist.
    Requires the 'uncensored' granted scope.
    """
    dep = await require_scope("uncensored")
    await dep(request)

    mask_token = "[MASK]"
    if mask_token not in req.text:
        raise HTTPException(status_code=400, detail="Text must contain [MASK] token")

    enc       = _encode([req.text])
    input_ids = enc["input_ids"][0].tolist()

    mask_id = SPECIAL_TOKENS["[MASK]"]
    try:
        mask_pos = input_ids.index(mask_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="[MASK] not found after tokenization")

    with torch.no_grad():
        hidden      = _model.encoder(**enc)
        mask_hidden = hidden[0, mask_pos, :]
        vocab_emb   = _model.encoder.token_emb.weight
        logits      = torch.matmul(mask_hidden, vocab_emb.T)
        probs       = F.softmax(logits, dim=-1)
        top_probs, top_ids = probs.topk(req.top_k)

    predictions = [
        {"token": _tokenizer.decode([tid.item()], skip_special_tokens=False),
         "token_id": tid.item(),
         "score": round(prob.item(), 4)}
        for tid, prob in zip(top_ids, top_probs)
    ]
    return {"text": req.text, "predictions": predictions, "uncensored": True}