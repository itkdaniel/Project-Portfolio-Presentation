"""
Regression contract tests — pins exact response field names and types for
POST /v1/search/quantum/tune.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.routers.quantum import router as quantum_router


@pytest.fixture
def quantum_app():
    app = FastAPI(title="test")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.include_router(quantum_router)

    @app.exception_handler(StarletteHTTPException)
    async def _http_handler(request: Request, exc: StarletteHTTPException):
        from app.routers.quantum import get_backend as _qb
        detail = exc.detail
        err_msg = detail.get("error", str(detail)) if isinstance(detail, dict) else str(detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": err_msg, "fallback_used": _qb().fallback_used},
        )

    @app.exception_handler(RequestValidationError)
    async def _val_handler(request: Request, exc: RequestValidationError):
        from app.routers.quantum import get_backend as _qb
        first_msg = exc.errors()[0].get("msg", "Validation error") if exc.errors() else "Validation error"
        return JSONResponse(
            status_code=422,
            content={"error": str(first_msg), "fallback_used": _qb().fallback_used},
        )

    return app


@pytest.fixture
async def qclient(quantum_app):
    async with AsyncClient(
        transport=ASGITransport(app=quantum_app), base_url="http://test"
    ) as ac:
        yield ac


PAIRS = [
    {"query": "microservices", "relevant_doc_ids": ["p1", "p2"]},
    {"query": "embeddings nlp", "relevant_doc_ids": ["p3"]},
]

REQUIRED_FIELDS = {
    "optimal_k1": float,
    "optimal_b": float,
    "quantum_ndcg": float,
    "baseline_ndcg": float,
    "fallback_used": bool,
}


@pytest.mark.asyncio
async def test_field_names_contract(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": PAIRS})
    assert resp.status_code == 200
    body = resp.json()
    for field in REQUIRED_FIELDS:
        assert field in body, f"Contract violation: '{field}' missing"


@pytest.mark.asyncio
async def test_field_types_contract(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": PAIRS})
    body = resp.json()
    for field, t in REQUIRED_FIELDS.items():
        assert isinstance(body[field], t), (
            f"Contract violation: '{field}' expected {t.__name__}, got {type(body[field]).__name__}"
        )


@pytest.mark.asyncio
async def test_optimal_k1_positive_contract(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": PAIRS})
    body = resp.json()
    assert body["optimal_k1"] > 0, "optimal_k1 must be positive"


@pytest.mark.asyncio
async def test_optimal_b_unit_interval_contract(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": PAIRS})
    body = resp.json()
    assert 0.0 <= body["optimal_b"] <= 1.0, f"optimal_b must be in [0,1]: {body['optimal_b']}"


@pytest.mark.asyncio
async def test_no_error_on_success_contract(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": PAIRS})
    body = resp.json()
    assert body.get("error") is None


@pytest.mark.asyncio
async def test_error_response_includes_fallback_used_on_validation_contract(qclient):
    """
    Non-200 responses from the quantum endpoint must include fallback_used.
    Trigger a validation error by sending an empty training_pairs list.
    """
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": []})
    assert resp.status_code == 422
    body = resp.json()
    assert "error" in body, "error field must be present on non-200 responses"
    assert "fallback_used" in body, "fallback_used must be present on non-200 responses"
    assert isinstance(body["fallback_used"], bool)
