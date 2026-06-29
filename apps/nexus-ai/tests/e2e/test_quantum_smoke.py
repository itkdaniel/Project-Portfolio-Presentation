"""
E2E smoke tests for POST /v1/ai/quantum/embed.

Boots the full test app (mock model + tokenizer pre-injected) via
ASGITransport — no real server or GPU needed. These tests exist to
catch import-chain breakage (e.g. nexus_shared not resolvable) and
routing regressions as the sub-app evolves.
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import _make_test_app


QUANTUM_PATH = "/v1/ai/quantum/embed"

SAMPLE_PAYLOAD = {
    "texts": ["microservices docker kubernetes", "pytorch transformer model"],
    "target_dim": 4,
    "num_layers": 2,
}


@pytest.fixture
def app():
    from app.routers.quantum import router as quantum_router
    application = _make_test_app()
    application.include_router(quantum_router)
    return application


@pytest.fixture
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


class TestQuantumSmokeNexusAI:
    """Smoke: endpoint is reachable and returns the correct envelope shape."""

    async def test_quantum_embed_reachable(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert r.status_code == 200, r.text

    async def test_response_has_all_required_fields(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        required = {
            "classical_embeddings",
            "quantum_embeddings",
            "fidelity",
            "target_dim",
            "fallback_used",
        }
        assert required.issubset(body.keys()), (
            f"Missing fields: {required - body.keys()}"
        )

    async def test_embedding_count_matches_input(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        n = len(SAMPLE_PAYLOAD["texts"])
        assert len(body["quantum_embeddings"]) == n
        assert len(body["classical_embeddings"]) == n

    async def test_embedding_dim_matches_target(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        td = SAMPLE_PAYLOAD["target_dim"]
        for emb in body["quantum_embeddings"]:
            assert len(emb) == td, f"Expected dim {td}, got {len(emb)}"

    async def test_fidelity_in_unit_interval(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        fidelity = r.json()["fidelity"]
        assert isinstance(fidelity, float)
        assert 0.0 <= fidelity <= 1.0, f"Fidelity out of range: {fidelity}"

    async def test_fallback_used_is_bool(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert isinstance(r.json()["fallback_used"], bool)

    async def test_fallback_true_when_no_azure_env(self, client):
        """Without AZURE_QUANTUM_WORKSPACE_ID the local simulation is used."""
        import os
        os.environ.pop("AZURE_QUANTUM_WORKSPACE_ID", None)
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert r.json()["fallback_used"] is True

    async def test_target_dim_echoed(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert r.json()["target_dim"] == SAMPLE_PAYLOAD["target_dim"]

    async def test_empty_texts_list_rejected(self, client):
        r = await client.post(QUANTUM_PATH, json={"texts": []})
        assert r.status_code == 422

    async def test_too_many_texts_rejected(self, client):
        r = await client.post(
            QUANTUM_PATH, json={"texts": ["x"] * 33, "target_dim": 4}
        )
        assert r.status_code == 422

    async def test_single_text_returns_one_embedding(self, client):
        r = await client.post(
            QUANTUM_PATH, json={"texts": ["single text"], "target_dim": 4}
        )
        assert r.status_code == 200
        body = r.json()
        assert len(body["quantum_embeddings"]) == 1
        assert len(body["classical_embeddings"]) == 1

    async def test_embeddings_are_lists_of_floats(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        for emb in body["quantum_embeddings"]:
            assert isinstance(emb, list)
            for v in emb:
                assert isinstance(v, (int, float))
