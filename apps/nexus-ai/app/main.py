"""
NexusAI — Standalone PyTorch transformer inference service.

Architecture:
  - Factory pattern: create_app(settings) for test isolation
  - Lifespan: load model + tokenizer at startup, unload at shutdown
  - Redis: SHA-256 keyed embedding cache (30-min TTL, per-text keys)
  - Inference batching: InferenceBatcher asyncio.Queue drain worker (10ms)
    Merges concurrent embed requests into one forward pass, then fans out
    results to each waiting caller via asyncio.Future.
  - Non-blocking: anyio.to_thread.run_sync() wraps all torch calls
  - Standard error envelope: {error, code, details, request_id}

Endpoints:
  GET  /health         — {status, service, version, uptime, device, model_loaded}
  GET  /info           — {name, version, endpoints[], port}
  POST /v1/ai/classify — intent classification, single + batch (top-k)
  POST /v1/ai/embed    — L2-normalized embeddings (per-text cached)
  POST /v1/ai/similarity — cosine similarity
  POST /v1/ai/fill-mask  — masked token prediction ([MASK] preserved through BPE)
  GET  /v1/ai/models   — list checkpoints
  GET  /v1/ai/status   — model load status + device info + batcher state
"""
from __future__ import annotations

import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import List, Optional

import anyio
import numpy as np
import structlog
import torch
import torch.nn.functional as F
import redis.asyncio as aioredis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.routers.ai import router as ai_router

logger = structlog.get_logger(__name__)

DOMAIN_CORPUS = [
    "microservices architecture docker kubernetes devops automation consulting",
    "pytorch transformer neural network machine learning fine tuning embeddings",
    "api rest graphql authentication authorization jwt oauth rbac",
    "database postgresql redis mongodb caching indexing query optimization",
    "ci cd pipeline github actions deployment container orchestration",
] * 50


def _resolve_device(setting: str) -> str:
    if setting == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    return setting


def _build_and_load_model(settings: Settings, device: str):
    from app.model.transformer import NexusTransformer, TransformerConfig
    config = TransformerConfig(
        vocab_size=8000,
        n_classes=len(settings.intent_labels),
        d_model=256,
        n_layers=4,
        n_heads=8,
        max_seq_len=settings.max_seq_len,
    )
    model = NexusTransformer(config).to(device)
    model.eval()

    ckpt = settings.model_checkpoint
    if ckpt and os.path.isfile(ckpt):
        state = torch.load(ckpt, map_location=device)
        model.load_state_dict(state.get("model_state", state))
        logger.info("Checkpoint loaded", path=ckpt)
    else:
        logger.warning("No checkpoint — using random weights. Run training first.")

    return model


def _build_tokenizer(settings: Settings):
    from app.model.tokenizer import BPETokenizer
    tok = BPETokenizer(max_vocab=8000)
    tok_path = "model/tokenizer"
    if os.path.isdir(tok_path):
        tok = BPETokenizer.load(tok_path)
        logger.info("Tokenizer loaded", path=tok_path)
    else:
        tok.train(DOMAIN_CORPUS, num_merges=500)
        logger.info("Tokenizer trained from domain corpus", vocab_size=len(tok))
    return tok


def _make_embed_fn(model, tokenizer, max_seq_len: int, device: str):
    """
    Return a sync function suitable for InferenceBatcher.model_fn.
    Receives a flat list of texts, returns a list of embedding lists.
    """
    from app.routers.ai import _sync_embed

    def _embed(texts: List[str]) -> List[List[float]]:
        return _sync_embed(model, tokenizer, texts, max_seq_len, device).tolist()

    return _embed


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    """
    Application factory.

    Pass a custom Settings instance for test isolation:
        app = create_app(Settings(redis_url="fakeredis://", ...))
    """
    if settings is None:
        settings = get_settings()

    _startup_time: list[float] = []

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        _startup_time.append(time.monotonic())
        device = _resolve_device(settings.device)

        app.state.settings     = settings
        app.state.device       = device
        app.state.model        = None
        app.state.tokenizer    = None
        app.state.redis        = None
        app.state.batcher      = None
        app.state.startup_time = _startup_time[0]

        # ── Redis ─────────────────────────────────────────────────────────────
        redis_client = None
        try:
            redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
            await redis_client.ping()
            app.state.redis = redis_client
            logger.info("Redis connected", url=settings.redis_url)
        except Exception as exc:
            logger.warning("Redis unavailable — cache disabled", error=str(exc))

        # ── Model + tokenizer ─────────────────────────────────────────────────
        try:
            model     = await anyio.to_thread.run_sync(lambda: _build_and_load_model(settings, device))
            tokenizer = await anyio.to_thread.run_sync(lambda: _build_tokenizer(settings))
            app.state.model     = model
            app.state.tokenizer = tokenizer
            logger.info("Model ready", params=f"{model.count_parameters():,}", device=device)

            # ── InferenceBatcher (cross-request 10ms drain worker) ────────────
            from app.batch import InferenceBatcher
            embed_fn = _make_embed_fn(model, tokenizer, settings.max_seq_len, device)
            batcher  = InferenceBatcher(model_fn=embed_fn, drain_ms=10.0, max_batch=32)
            await batcher.start()
            app.state.batcher = batcher
            logger.info("Inference batcher started", drain_ms=10)

        except Exception as exc:
            logger.error("Model load failed", error=str(exc))

        yield

        # ── Shutdown ──────────────────────────────────────────────────────────
        if app.state.batcher is not None:
            await app.state.batcher.stop()
            logger.info("Inference batcher stopped")

        if redis_client is not None:
            await redis_client.aclose()

        logger.info("NexusAI service shut down")

    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description=(
            "PyTorch transformer inference API for intent classification, "
            "semantic similarity, and embedding generation."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(ai_router)

    @app.get("/health", tags=["health"])
    async def health(request: Request):
        state  = request.app.state
        uptime = time.monotonic() - getattr(state, "startup_time", time.monotonic())
        return {
            "status":       "ok",
            "service":      settings.app_name,
            "version":      settings.version,
            "uptime":       round(uptime, 2),
            "device":       getattr(state, "device", "unknown"),
            "model_loaded": state.model is not None,
        }

    @app.get("/info", tags=["meta"])
    async def info():
        return {
            "name":    settings.app_name,
            "version": settings.version,
            "port":    settings.port,
            "endpoints": [
                "POST /v1/ai/classify",
                "POST /v1/ai/embed",
                "POST /v1/ai/similarity",
                "POST /v1/ai/fill-mask",
                "GET  /v1/ai/models",
                "GET  /v1/ai/status",
                "GET  /health",
                "GET  /info",
                "GET  /docs",
            ],
        }

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        request_id = str(uuid.uuid4())
        logger.error(
            "Unhandled exception",
            error=str(exc),
            path=request.url.path,
            request_id=request_id,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error":      "Internal server error",
                "code":       "INTERNAL_ERROR",
                "details":    {"message": str(exc)},
                "request_id": request_id,
            },
        )

    return app


app = create_app()
