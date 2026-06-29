"""
Shared test fixtures for nexus-ai.

MockModel: same interface as NexusTransformer but returns deterministic random
tensors — no training needed, fast for CI.

MockTokenizer: minimal BPETokenizer-compatible object for tests that only
need encode/decode without a real trained vocabulary.

_make_test_app: builds a minimal FastAPI test app with state pre-injected
(no lifespan — avoids Redis/torch load in CI).
"""
from __future__ import annotations

import importlib
import importlib.util
import sys
import time
from pathlib import Path
from typing import List, Optional


def _register_nexus_shared() -> None:
    """
    Register apps/_shared/ as the nexus_shared package without a pip install.

    apps/_shared/pyproject.toml declares  `package-dir = nexus_shared = ""`
    meaning the directory itself is the nexus_shared package root.  When the
    package isn't pip-installed (CI, local dev) we wire it up via importlib so
    that `from nexus_shared.quantum_utils import get_backend` resolves to the
    shared implementation in apps/_shared/.

    Safe to call multiple times — skips if already in sys.modules.
    """
    if "nexus_shared" in sys.modules:
        return
    shared_dir = Path(__file__).resolve().parents[3] / "apps" / "_shared"
    if not shared_dir.is_dir():
        # Fallback: try one level up (when running from inside apps/nexus-ai)
        shared_dir = Path(__file__).resolve().parents[2] / "_shared"
    if not shared_dir.is_dir():
        return  # Can't locate _shared — let normal import fail with a clear error
    spec = importlib.util.spec_from_file_location(
        "nexus_shared",
        shared_dir / "__init__.py",
        submodule_search_locations=[str(shared_dir)],
    )
    if spec is None or spec.loader is None:
        return
    mod = importlib.util.module_from_spec(spec)
    sys.modules["nexus_shared"] = mod
    spec.loader.exec_module(mod)  # type: ignore[union-attr]


_register_nexus_shared()

import pytest
import torch
import torch.nn.functional as F
import numpy as np
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from httpx import ASGITransport, AsyncClient
from starlette.exceptions import HTTPException as StarletteHTTPException


# ── Mock model ─────────────────────────────────────────────────────────────────

class _MockConfig:
    d_model   = 64
    n_classes = 5
    vocab_size = 100


class MockModel:
    """
    Drop-in replacement for NexusTransformer that returns fixed random outputs.
    Shapes match the real model so all downstream logic is exercised.
    """

    def __init__(self):
        self.config = _MockConfig()

    def __call__(self, input_ids: torch.Tensor, attention_mask=None) -> dict:
        B, S = input_ids.shape
        D    = self.config.d_model
        C    = self.config.n_classes
        torch.manual_seed(int(input_ids.sum().item()) % 2**31)
        hidden = torch.randn(B, S, D)
        pooled = torch.randn(B, D)
        logits = torch.randn(B, C)
        return {"logits": logits, "hidden_states": hidden, "pooled": pooled}

    @property
    def encoder(self):
        cfg = self.config

        class _FakeEncoder:
            class token_emb:
                weight = torch.randn(100, 64)

            def __call__(inner, input_ids, attention_mask=None):
                B, S = input_ids.shape
                torch.manual_seed(int(input_ids.sum().item()) % 2**31)
                return torch.randn(B, S, cfg.d_model)

        return _FakeEncoder()

    def count_parameters(self) -> int:
        return 12345

    def eval(self):
        return self

    def to(self, device):
        return self


# ── Mock tokenizer ─────────────────────────────────────────────────────────────

class MockTokenizer:
    """Minimal tokenizer that produces plausible fixed-length encodings."""

    def __init__(self, max_len: int = 32):
        self._max_len    = max_len
        self._vocab_size = 100
        self._trained    = True

    def encode(
        self,
        text: str,
        add_special_tokens: bool = True,
        max_length: int = 512,
        padding: bool = False,
    ) -> dict:
        import re
        # Match [MASK] (case-insensitive) before lowercasing or after
        words = re.findall(r"\[MASK\]|\[mask\]|[a-zA-Z0-9']+", text, flags=re.IGNORECASE)
        ids   = []
        if add_special_tokens:
            ids.append(2)  # [CLS]
        for w in words:
            if w.upper() == "[MASK]":
                ids.append(4)  # [MASK] token
            else:
                ids.append(hash(w.lower()) % 90 + 5)
        if add_special_tokens:
            ids.append(3)  # [SEP]
        ids   = ids[:max_length]
        mask  = [1] * len(ids)
        if padding and len(ids) < max_length:
            pad  = max_length - len(ids)
            ids  += [0] * pad
            mask += [0] * pad
        return {"input_ids": ids, "attention_mask": mask}

    def decode(self, ids: List[int], skip_special_tokens: bool = True) -> str:
        specials = {0, 1, 2, 3, 4}
        tokens = [f"tok{i}" for i in ids if (not skip_special_tokens or i not in specials)]
        return " ".join(tokens)

    def __len__(self) -> int:
        return self._vocab_size


# ── Test app factory ───────────────────────────────────────────────────────────

def _make_test_app(mock_model=None, mock_tokenizer=None, mock_redis=None):
    """
    Build a minimal FastAPI app with pre-injected mock state.
    No lifespan — avoids real Redis/torch init in CI.
    State is set directly on app.state before the first request.
    """
    from app.config import Settings
    from app.routers.ai import router as ai_router

    settings = Settings(
        redis_url="redis://localhost:6379",
        model_checkpoint="",
        debug=True,
    )

    model     = mock_model     or MockModel()
    tokenizer = mock_tokenizer or MockTokenizer()

    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Inject state before any request is handled
    app.state.settings     = settings
    app.state.device       = "cpu"
    app.state.model        = model
    app.state.tokenizer    = tokenizer
    app.state.redis        = mock_redis
    app.state.batcher      = None   # no cross-request batching in unit tests
    app.state.startup_time = time.monotonic()

    app.include_router(ai_router)

    @app.get("/health", tags=["health"])
    async def health():
        uptime = time.monotonic() - app.state.startup_time
        return {
            "status":       "ok",
            "service":      settings.app_name,
            "version":      settings.version,
            "uptime":       round(uptime, 2),
            "device":       app.state.device,
            "model_loaded": app.state.model is not None,
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

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        import uuid as _uuid
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error":      str(exc.detail),
                "code":       f"HTTP_{exc.status_code}",
                "details":    {"message": str(exc.detail)},
                "request_id": str(_uuid.uuid4()),
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        import uuid as _uuid
        import json as _j
        def _safe(v):
            try: _j.dumps(v); return v
            except TypeError: return str(v)
        safe_errors = [
            {k: _safe(v) for k, v in err.items()}
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "error":      "Validation error",
                "code":       "VALIDATION_ERROR",
                "details":    {"errors": safe_errors},
                "request_id": str(_uuid.uuid4()),
            },
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        import uuid as _uuid
        return JSONResponse(
            status_code=500,
            content={
                "error":      "Internal server error",
                "code":       "INTERNAL_ERROR",
                "details":    {"message": str(exc)},
                "request_id": str(_uuid.uuid4()),
            },
        )

    return app


# ── Pytest fixtures ────────────────────────────────────────────────────────────

@pytest.fixture
def test_app():
    return _make_test_app()


@pytest.fixture
def test_app_no_model():
    return _make_test_app(mock_model=None, mock_tokenizer=None)


@pytest.fixture
async def client(test_app):
    async with AsyncClient(
        transport=ASGITransport(app=test_app), base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture
def mock_model():
    return MockModel()


@pytest.fixture
def mock_tokenizer():
    return MockTokenizer()
