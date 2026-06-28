"""
Regression contract tests for POST /v1/ai/quantum/embed.

Pins exact response field names and types so any breaking change to the
quantum embed endpoint is caught immediately.
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import _make_test_app


@pytest.fixture
def quantum_app():
    from app.routers.quantum import router as quantum_router
    app = _make_test_app()
    app.include_router(quantum_router)
    return app


@pytest.fixture
def quantum_app_no_model():
    """App with no model loaded — quantum/embed returns 503 with {error, fallback_used}."""
    from fastapi import Request
    from fastapi.exceptions import RequestValidationError as RVE
    from fastapi.responses import JSONResponse
    from starlette.exceptions import HTTPException as SHTTPException

    from app.routers.quantum import router as quantum_router
    app = _make_test_app()
    # Explicitly clear the model so the endpoint returns 503
    app.state.model = None
    app.state.tokenizer = None
    app.include_router(quantum_router)

    @app.exception_handler(SHTTPException)
    async def _http(request: Request, exc: SHTTPException):
        from app.routers.quantum import get_backend as _qb
        if "/quantum/" in request.url.path:
            detail = exc.detail
            err_msg = detail.get("error", str(detail)) if isinstance(detail, dict) else str(detail)
            return JSONResponse(
                status_code=exc.status_code,
                content={"error": err_msg, "fallback_used": _qb().fallback_used},
            )
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})

    @app.exception_handler(RVE)
    async def _val(request: Request, exc: RVE):
        from app.routers.quantum import get_backend as _qb
        if "/quantum/" in request.url.path:
            first = exc.errors()[0].get("msg", "Validation error") if exc.errors() else "Validation error"
            return JSONResponse(
                status_code=422,
                content={"error": str(first), "fallback_used": _qb().fallback_used},
            )
        return JSONResponse(status_code=422, content={"error": "Validation error"})

    return app


@pytest.fixture
async def qclient(quantum_app):
    async with AsyncClient(
        transport=ASGITransport(app=quantum_app), base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture
async def qclient_no_model(quantum_app_no_model):
    async with AsyncClient(
        transport=ASGITransport(app=quantum_app_no_model), base_url="http://test"
    ) as ac:
        yield ac


REQUIRED_FIELDS = {
    "classical_embeddings": list,
    "quantum_embeddings": list,
    "fidelity": float,
    "target_dim": int,
    "fallback_used": bool,
}


@pytest.mark.asyncio
async def test_response_field_names_contract(qclient):
    resp = await qclient.post("/v1/ai/quantum/embed", json={"texts": ["hello"], "target_dim": 4})
    assert resp.status_code == 200
    body = resp.json()
    for field in REQUIRED_FIELDS:
        assert field in body, f"Contract violation: field '{field}' missing from response"


@pytest.mark.asyncio
async def test_response_field_types_contract(qclient):
    resp = await qclient.post("/v1/ai/quantum/embed", json={"texts": ["hello"], "target_dim": 4})
    body = resp.json()
    for field, expected_type in REQUIRED_FIELDS.items():
        assert isinstance(body[field], expected_type), (
            f"Contract violation: '{field}' expected {expected_type.__name__}, "
            f"got {type(body[field]).__name__}"
        )


@pytest.mark.asyncio
async def test_quantum_embeddings_are_list_of_lists_contract(qclient):
    resp = await qclient.post(
        "/v1/ai/quantum/embed", json={"texts": ["hello", "world"], "target_dim": 4}
    )
    body = resp.json()
    for emb in body["quantum_embeddings"]:
        assert isinstance(emb, list), "Each quantum embedding must be a list"
        for v in emb:
            assert isinstance(v, (int, float)), "Embedding values must be numeric"


@pytest.mark.asyncio
async def test_classical_embeddings_are_list_of_lists_contract(qclient):
    resp = await qclient.post(
        "/v1/ai/quantum/embed", json={"texts": ["hello", "world"], "target_dim": 4}
    )
    body = resp.json()
    for emb in body["classical_embeddings"]:
        assert isinstance(emb, list), "Each classical embedding must be a list"


@pytest.mark.asyncio
async def test_fidelity_is_float_in_unit_interval_contract(qclient):
    resp = await qclient.post("/v1/ai/quantum/embed", json={"texts": ["test"], "target_dim": 4})
    body = resp.json()
    fidelity = body["fidelity"]
    assert isinstance(fidelity, float), f"fidelity must be float, got {type(fidelity)}"
    assert 0.0 <= fidelity <= 1.0, f"fidelity must be in [0,1], got {fidelity}"


@pytest.mark.asyncio
async def test_no_extra_error_field_on_success_contract(qclient):
    resp = await qclient.post("/v1/ai/quantum/embed", json={"texts": ["hello"], "target_dim": 4})
    body = resp.json()
    assert body.get("error") is None, f"error field should be null on success, got: {body.get('error')}"


@pytest.mark.asyncio
async def test_503_error_includes_fallback_used_contract(qclient_no_model):
    """
    When the model is not loaded, the endpoint returns 503 with {error, fallback_used}.
    Verify fallback_used is always present in non-200 responses.
    """
    resp = await qclient_no_model.post(
        "/v1/ai/quantum/embed", json={"texts": ["hello"], "target_dim": 4}
    )
    assert resp.status_code == 503
    body = resp.json()
    assert "error" in body, "error field must be present on 503 responses"
    assert "fallback_used" in body, "fallback_used must be present on 503 responses"
    assert isinstance(body["fallback_used"], bool)
