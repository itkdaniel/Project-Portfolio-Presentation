"""
E2E smoke tests for POST /v1/search/quantum/tune.

Boots the full nexus-search app (in-memory SQLite + fakeredis) via
ASGITransport — no real server needed. These tests exist to catch
import-chain breakage (e.g. nexus_shared not resolvable) and routing
regressions as the sub-app evolves.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.algorithms.search import reset_indexes
from app.config import Settings
from app.main import create_app


QUANTUM_PATH = "/v1/search/quantum/tune"

SAMPLE_PAIRS = [
    {"query": "authentication service", "relevant_doc_ids": ["doc-1", "doc-2"]},
    {"query": "docker kubernetes deployment", "relevant_doc_ids": ["doc-3"]},
    {"query": "machine learning embeddings", "relevant_doc_ids": ["doc-2", "doc-4"]},
]

SAMPLE_PAYLOAD = {"training_pairs": SAMPLE_PAIRS, "num_steps": 50}


@pytest.fixture(scope="function")
def settings():
    return Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        redis_url="redis://localhost:6379",
        debug=True,
        jwt_secret="test-secret-quantum-smoke",
        port=8002,
    )


@pytest.fixture(scope="function")
def fake_redis():
    import fakeredis.aioredis as fakeredis
    return fakeredis.FakeRedis(decode_responses=True)


@pytest_asyncio.fixture(scope="function")
async def app(settings, fake_redis):
    reset_indexes()
    application = create_app(settings)
    import app.database as db_module
    db_module._redis_client = fake_redis
    async with application.router.lifespan_context(application):
        yield application
    reset_indexes()


@pytest_asyncio.fixture(scope="function")
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


class TestQuantumSmokeNexusSearch:
    """Smoke: endpoint is reachable and returns the correct envelope shape."""

    async def test_quantum_tune_reachable(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert r.status_code == 200, r.text

    async def test_response_has_all_required_fields(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        required = {"optimal_k1", "optimal_b", "quantum_ndcg", "baseline_ndcg", "fallback_used"}
        assert required.issubset(body.keys()), (
            f"Missing fields: {required - body.keys()}"
        )

    async def test_k1_in_valid_range(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        k1 = r.json()["optimal_k1"]
        assert isinstance(k1, float)
        assert 0.1 <= k1 <= 5.0, f"k1 out of range: {k1}"

    async def test_b_in_unit_interval(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        b = r.json()["optimal_b"]
        assert isinstance(b, float)
        assert 0.0 <= b <= 1.0, f"b out of range: {b}"

    async def test_ndcg_scores_are_non_negative(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        assert body["quantum_ndcg"] >= 0.0
        assert body["baseline_ndcg"] >= 0.0

    async def test_fallback_used_is_bool(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert isinstance(r.json()["fallback_used"], bool)

    async def test_fallback_true_when_no_azure_env(self, client):
        import os
        os.environ.pop("AZURE_QUANTUM_WORKSPACE_ID", None)
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert r.json()["fallback_used"] is True

    async def test_empty_training_pairs_rejected(self, client):
        r = await client.post(QUANTUM_PATH, json={"training_pairs": []})
        assert r.status_code == 422

    async def test_missing_training_pairs_rejected(self, client):
        r = await client.post(QUANTUM_PATH, json={})
        assert r.status_code == 422

    async def test_num_steps_below_minimum_rejected(self, client):
        payload = {**SAMPLE_PAYLOAD, "num_steps": 1}
        r = await client.post(QUANTUM_PATH, json=payload)
        assert r.status_code == 422

    async def test_num_steps_above_maximum_rejected(self, client):
        payload = {**SAMPLE_PAYLOAD, "num_steps": 9999}
        r = await client.post(QUANTUM_PATH, json=payload)
        assert r.status_code == 422

    async def test_single_pair_accepted(self, client):
        r = await client.post(
            QUANTUM_PATH,
            json={
                "training_pairs": [
                    {"query": "auth", "relevant_doc_ids": ["doc-1"]}
                ],
                "num_steps": 50,
            },
        )
        assert r.status_code == 200
