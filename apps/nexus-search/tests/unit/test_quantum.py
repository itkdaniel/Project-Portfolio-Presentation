"""
Unit tests for POST /v1/search/quantum/tune.

Uses httpx AsyncClient against the nexus-search app.
Mocks the database and redis so no external services are needed.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from httpx import ASGITransport, AsyncClient

from app.routers.quantum import router as quantum_router


@pytest.fixture
def quantum_app():
    """Minimal FastAPI app with only the quantum router — no DB/Redis needed."""
    app = FastAPI(title="test")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.include_router(quantum_router)
    return app


@pytest.fixture
async def qclient(quantum_app):
    async with AsyncClient(
        transport=ASGITransport(app=quantum_app), base_url="http://test"
    ) as ac:
        yield ac


SAMPLE_PAIRS = [
    {"query": "authentication service", "relevant_doc_ids": ["doc1", "doc2"]},
    {"query": "docker kubernetes", "relevant_doc_ids": ["doc3"]},
    {"query": "machine learning embeddings", "relevant_doc_ids": ["doc2", "doc4"]},
]


# ── Happy path ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_quantum_tune_returns_200(qclient):
    payload = {"training_pairs": SAMPLE_PAIRS}
    resp = await qclient.post("/v1/search/quantum/tune", json=payload)
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_quantum_tune_response_shape(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": SAMPLE_PAIRS})
    body = resp.json()
    required = {"optimal_k1", "optimal_b", "quantum_ndcg", "baseline_ndcg", "fallback_used"}
    assert required.issubset(body.keys()), f"Missing fields: {required - body.keys()}"


@pytest.mark.asyncio
async def test_quantum_tune_k1_in_valid_range(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": SAMPLE_PAIRS})
    body = resp.json()
    assert 0.0 < body["optimal_k1"] <= 5.0, f"optimal_k1 out of range: {body['optimal_k1']}"


@pytest.mark.asyncio
async def test_quantum_tune_b_in_valid_range(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": SAMPLE_PAIRS})
    body = resp.json()
    assert 0.0 <= body["optimal_b"] <= 1.0, f"optimal_b out of range: {body['optimal_b']}"


@pytest.mark.asyncio
async def test_quantum_tune_ndcg_scores_are_non_negative(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": SAMPLE_PAIRS})
    body = resp.json()
    assert body["quantum_ndcg"] >= 0.0
    assert body["baseline_ndcg"] >= 0.0


@pytest.mark.asyncio
async def test_quantum_tune_fallback_used_is_bool(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": SAMPLE_PAIRS})
    body = resp.json()
    assert isinstance(body["fallback_used"], bool)


@pytest.mark.asyncio
async def test_quantum_tune_single_pair(qclient):
    payload = {"training_pairs": [{"query": "jwt auth", "relevant_doc_ids": ["d1"]}]}
    resp = await qclient.post("/v1/search/quantum/tune", json=payload)
    assert resp.status_code == 200


# ── Validation ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_quantum_tune_empty_pairs_rejected(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={"training_pairs": []})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_quantum_tune_missing_body_rejected(qclient):
    resp = await qclient.post("/v1/search/quantum/tune", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_quantum_tune_num_steps_too_low_rejected(qclient):
    resp = await qclient.post(
        "/v1/search/quantum/tune",
        json={"training_pairs": SAMPLE_PAIRS, "num_steps": 1},
    )
    assert resp.status_code == 422
