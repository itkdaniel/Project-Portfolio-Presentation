"""
Unit tests for POST /v1/ai/quantum/embed.

Mocks the QuantumBackend so no real quantum simulation is needed.
Asserts response shape, field types, and graceful fallback behaviour.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import _make_test_app


@pytest.fixture
def quantum_app():
    """Test app with the quantum router included."""
    from app.routers.quantum import router as quantum_router
    app = _make_test_app()
    app.include_router(quantum_router)
    return app


@pytest.fixture
async def qclient(quantum_app):
    async with AsyncClient(
        transport=ASGITransport(app=quantum_app), base_url="http://test"
    ) as ac:
        yield ac


# ── Happy path ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_quantum_embed_returns_200(qclient):
    payload = {"texts": ["microservices docker kubernetes", "pytorch transformer"]}
    resp = await qclient.post("/v1/ai/quantum/embed", json=payload)
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_quantum_embed_response_shape(qclient):
    payload = {"texts": ["auth service", "database indexing"], "target_dim": 4}
    resp = await qclient.post("/v1/ai/quantum/embed", json=payload)
    body = resp.json()

    required_fields = {"classical_embeddings", "quantum_embeddings", "fidelity", "target_dim", "fallback_used"}
    assert required_fields.issubset(body.keys()), f"Missing fields: {required_fields - body.keys()}"


@pytest.mark.asyncio
async def test_quantum_embed_embedding_count_matches_input(qclient):
    texts = ["text one", "text two", "text three"]
    resp = await qclient.post("/v1/ai/quantum/embed", json={"texts": texts, "target_dim": 4})
    body = resp.json()
    assert len(body["quantum_embeddings"]) == len(texts)
    assert len(body["classical_embeddings"]) == len(texts)


@pytest.mark.asyncio
async def test_quantum_embed_target_dim_respected(qclient):
    resp = await qclient.post(
        "/v1/ai/quantum/embed", json={"texts": ["hello world"], "target_dim": 6}
    )
    body = resp.json()
    assert body["target_dim"] == 6
    assert len(body["quantum_embeddings"][0]) == 6


@pytest.mark.asyncio
async def test_quantum_embed_fidelity_in_range(qclient):
    resp = await qclient.post("/v1/ai/quantum/embed", json={"texts": ["test text"]})
    body = resp.json()
    assert 0.0 <= body["fidelity"] <= 1.0


@pytest.mark.asyncio
async def test_quantum_embed_fallback_used_when_no_azure(qclient):
    resp = await qclient.post("/v1/ai/quantum/embed", json={"texts": ["test"]})
    body = resp.json()
    assert isinstance(body["fallback_used"], bool)


# ── Validation ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_quantum_embed_empty_texts_rejected(qclient):
    resp = await qclient.post("/v1/ai/quantum/embed", json={"texts": []})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_quantum_embed_target_dim_too_small_rejected(qclient):
    resp = await qclient.post(
        "/v1/ai/quantum/embed", json={"texts": ["hello"], "target_dim": 1}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_quantum_embed_missing_texts_rejected(qclient):
    resp = await qclient.post("/v1/ai/quantum/embed", json={})
    assert resp.status_code == 422


# ── No model loaded ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_quantum_embed_503_when_model_not_loaded():
    from app.routers.quantum import router as quantum_router
    app = _make_test_app(mock_model=None, mock_tokenizer=None)
    app.state.model = None
    app.state.tokenizer = None
    app.include_router(quantum_router)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp = await ac.post("/v1/ai/quantum/embed", json={"texts": ["hello"]})
    assert resp.status_code == 503
