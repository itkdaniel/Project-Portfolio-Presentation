"""
E2E tests: full HTTP round-trip against the mock-model app.
Uses httpx.AsyncClient with ASGITransport — no real server needed.
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import _make_test_app, MockModel, MockTokenizer


@pytest.fixture
def app():
    return _make_test_app()


@pytest.fixture
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ── Health & Meta ─────────────────────────────────────────────────────────────

class TestHealthEndpoint:
    async def test_health_returns_200(self, client):
        r = await client.get("/health")
        assert r.status_code == 200

    async def test_health_schema(self, client):
        r = await client.get("/health")
        body = r.json()
        assert body["status"] == "ok"
        assert "service" in body
        assert "version" in body
        assert "uptime" in body
        assert "device" in body
        assert "model_loaded" in body

    async def test_model_loaded_true(self, client):
        r = await client.get("/health")
        assert r.json()["model_loaded"] is True

    async def test_uptime_is_non_negative(self, client):
        r = await client.get("/health")
        assert r.json()["uptime"] >= 0


class TestInfoEndpoint:
    async def test_info_returns_200(self, client):
        r = await client.get("/info")
        assert r.status_code == 200

    async def test_info_has_endpoints_list(self, client):
        r = await client.get("/info")
        body = r.json()
        assert "endpoints" in body
        assert isinstance(body["endpoints"], list)
        assert len(body["endpoints"]) > 0

    async def test_info_has_version(self, client):
        r = await client.get("/info")
        assert "version" in r.json()

    async def test_docs_endpoint_accessible(self, client):
        r = await client.get("/docs")
        assert r.status_code == 200


# ── Classify ──────────────────────────────────────────────────────────────────

class TestClassifyE2E:
    async def test_classify_returns_200(self, client):
        r = await client.post("/v1/ai/classify", json={"text": "I need help with microservices", "top_k": 3})
        assert r.status_code == 200

    async def test_classify_returns_predictions(self, client):
        r    = await client.post("/v1/ai/classify", json={"text": "devops pipeline", "top_k": 3})
        body = r.json()
        assert "predictions" in body
        assert len(body["predictions"]) == 3

    async def test_classify_prediction_has_label_score(self, client):
        r    = await client.post("/v1/ai/classify", json={"text": "kubernetes scaling"})
        body = r.json()
        for pred in body["predictions"]:
            assert "label" in pred
            assert "score" in pred
            assert isinstance(pred["score"], float)

    async def test_classify_topk_1(self, client):
        r = await client.post("/v1/ai/classify", json={"text": "AI model training", "top_k": 1})
        assert len(r.json()["predictions"]) == 1

    async def test_classify_topk_5(self, client):
        r = await client.post("/v1/ai/classify", json={"text": "REST API authentication", "top_k": 5})
        assert len(r.json()["predictions"]) == 5

    async def test_classify_includes_device(self, client):
        r = await client.post("/v1/ai/classify", json={"text": "container orchestration"})
        assert "device" in r.json()

    async def test_classify_includes_request_id(self, client):
        r = await client.post("/v1/ai/classify", json={"text": "pricing inquiry"})
        assert "request_id" in r.json()

    async def test_classify_empty_text_422(self, client):
        r = await client.post("/v1/ai/classify", json={"text": ""})
        assert r.status_code == 422

    async def test_classify_text_too_long_422(self, client):
        r = await client.post("/v1/ai/classify", json={"text": "x" * 1001})
        assert r.status_code == 422

    async def test_classify_missing_text_422(self, client):
        r = await client.post("/v1/ai/classify", json={})
        assert r.status_code == 422

    async def test_classify_all_labels_are_valid(self, client):
        valid = {
            "microservices_inquiry", "devops_inquiry", "ai_ml_inquiry",
            "pricing_inquiry", "general_support",
        }
        r    = await client.post("/v1/ai/classify", json={"text": "automation", "top_k": 5})
        body = r.json()
        for pred in body["predictions"]:
            assert pred["label"] in valid


# ── Embed ─────────────────────────────────────────────────────────────────────

class TestEmbedE2E:
    async def test_embed_returns_200(self, client):
        r = await client.post("/v1/ai/embed", json={"texts": ["hello world"]})
        assert r.status_code == 200

    async def test_embed_single_returns_one_embedding(self, client):
        r = await client.post("/v1/ai/embed", json={"texts": ["hello"]})
        assert len(r.json()["embeddings"]) == 1

    async def test_embed_batch_returns_n_embeddings(self, client):
        r = await client.post("/v1/ai/embed", json={"texts": ["a", "b", "c"]})
        assert len(r.json()["embeddings"]) == 3

    async def test_embed_includes_dim(self, client):
        r = await client.post("/v1/ai/embed", json={"texts": ["test"]})
        assert "dim" in r.json()

    async def test_embed_cached_false_on_first_call(self, client):
        r = await client.post("/v1/ai/embed", json={"texts": ["unique_text_abc_xyz_123"]})
        assert r.json()["cached"] is False

    async def test_embed_includes_request_id(self, client):
        r = await client.post("/v1/ai/embed", json={"texts": ["embedding test"]})
        assert "request_id" in r.json()

    async def test_embed_empty_list_422(self, client):
        r = await client.post("/v1/ai/embed", json={"texts": []})
        assert r.status_code == 422

    async def test_embed_too_many_texts_422(self, client):
        r = await client.post("/v1/ai/embed", json={"texts": ["x"] * 33})
        assert r.status_code == 422

    async def test_embed_each_embedding_is_list_of_floats(self, client):
        r    = await client.post("/v1/ai/embed", json={"texts": ["pytorch", "transformer"]})
        body = r.json()
        for emb in body["embeddings"]:
            assert isinstance(emb, list)
            for v in emb:
                assert isinstance(v, (int, float))


# ── Similarity ────────────────────────────────────────────────────────────────

class TestSimilarityE2E:
    async def test_similarity_returns_200(self, client):
        r = await client.post("/v1/ai/similarity", json={"text_a": "hello", "text_b": "world"})
        assert r.status_code == 200

    async def test_similarity_has_score(self, client):
        r    = await client.post("/v1/ai/similarity", json={"text_a": "docker", "text_b": "kubernetes"})
        body = r.json()
        assert "similarity" in body
        assert isinstance(body["similarity"], float)

    async def test_similarity_in_range(self, client):
        r   = await client.post("/v1/ai/similarity", json={"text_a": "microservices", "text_b": "api"})
        sim = r.json()["similarity"]
        assert -1.0 <= sim <= 1.0

    async def test_similarity_echoes_texts(self, client):
        r    = await client.post("/v1/ai/similarity", json={"text_a": "foo", "text_b": "bar"})
        body = r.json()
        assert body["text_a"] == "foo"
        assert body["text_b"] == "bar"

    async def test_similarity_includes_request_id(self, client):
        r = await client.post("/v1/ai/similarity", json={"text_a": "a", "text_b": "b"})
        assert "request_id" in r.json()

    async def test_similarity_missing_text_422(self, client):
        r = await client.post("/v1/ai/similarity", json={"text_a": "only one"})
        assert r.status_code == 422


# ── Fill-mask ─────────────────────────────────────────────────────────────────

class TestFillMaskE2E:
    async def test_fill_mask_returns_200(self, client):
        r = await client.post("/v1/ai/fill-mask", json={"text": "I love [MASK] computing", "top_k": 3})
        assert r.status_code == 200

    async def test_fill_mask_has_predictions(self, client):
        r    = await client.post("/v1/ai/fill-mask", json={"text": "[MASK] is great", "top_k": 5})
        body = r.json()
        assert "predictions" in body

    async def test_fill_mask_no_mask_token_400(self, client):
        r = await client.post("/v1/ai/fill-mask", json={"text": "no mask here", "top_k": 3})
        assert r.status_code == 400

    async def test_fill_mask_includes_request_id(self, client):
        r = await client.post("/v1/ai/fill-mask", json={"text": "[MASK] systems", "top_k": 3})
        assert "request_id" in r.json()


# ── AI Status & Models ─────────────────────────────────────────────────────────

class TestClassifyBatchE2E:
    """Batch classification — single forward pass for multiple texts."""

    async def test_batch_classify_returns_200(self, client):
        r = await client.post(
            "/v1/ai/classify",
            json={"texts": ["microservices", "docker deployment"], "top_k": 3},
        )
        assert r.status_code == 200

    async def test_batch_classify_has_results(self, client):
        r    = await client.post(
            "/v1/ai/classify",
            json={"texts": ["devops pipeline", "machine learning"], "top_k": 3},
        )
        body = r.json()
        assert "results" in body
        assert len(body["results"]) == 2

    async def test_batch_classify_each_result_has_predictions(self, client):
        r    = await client.post(
            "/v1/ai/classify",
            json={"texts": ["kubernetes scaling", "pricing plan"], "top_k": 3},
        )
        for result in r.json()["results"]:
            assert "text" in result
            assert "predictions" in result
            assert len(result["predictions"]) == 3

    async def test_batch_classify_has_request_id(self, client):
        r = await client.post(
            "/v1/ai/classify",
            json={"texts": ["api gateway"], "top_k": 2},
        )
        assert "request_id" in r.json()

    async def test_classify_neither_text_nor_texts_422(self, client):
        r = await client.post("/v1/ai/classify", json={"top_k": 3})
        assert r.status_code == 422


class TestErrorEnvelopeE2E:
    """All error paths must emit {error, code, details, request_id}."""

    async def test_http_error_has_envelope(self, client):
        """503 from missing model → standard envelope."""
        # POST with model not loaded → 422 or 503; either way must have request_id
        r    = await client.post("/v1/ai/classify", json={"text": "hi", "top_k": 3})
        body = r.json()
        # envelope fields must be present on any error
        if r.status_code >= 400:
            assert "request_id" in body

    async def test_validation_error_has_envelope(self, client):
        """422 from missing required field → standard envelope with request_id."""
        r    = await client.post("/v1/ai/classify", json={"top_k": 3})
        body = r.json()
        assert r.status_code == 422
        assert "request_id" in body
        assert "code" in body
        assert "error" in body

    async def test_fill_mask_400_has_envelope(self, client):
        """400 when [MASK] missing → envelope format."""
        r    = await client.post("/v1/ai/fill-mask", json={"text": "no mask here"})
        body = r.json()
        assert r.status_code == 400
        assert "error" in body
        assert "code" in body
        assert "request_id" in body

    async def test_embed_error_envelope_on_bad_input(self, client):
        """422 for empty texts list → envelope format."""
        r    = await client.post("/v1/ai/embed", json={"texts": []})
        body = r.json()
        assert r.status_code == 422
        assert "request_id" in body


class TestAIStatusE2E:
    async def test_status_returns_200(self, client):
        r = await client.get("/v1/ai/status")
        assert r.status_code == 200

    async def test_status_model_loaded_true(self, client):
        r = await client.get("/v1/ai/status")
        assert r.json()["model_loaded"] is True

    async def test_status_has_device(self, client):
        r = await client.get("/v1/ai/status")
        assert "device" in r.json()

    async def test_status_has_batcher_active(self, client):
        r = await client.get("/v1/ai/status")
        assert "batcher_active" in r.json()

    async def test_models_returns_200(self, client):
        r = await client.get("/v1/ai/models")
        assert r.status_code == 200

    async def test_models_has_count(self, client):
        r = await client.get("/v1/ai/models")
        assert "count" in r.json()
