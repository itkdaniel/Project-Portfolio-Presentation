"""
DB-backed integration tests for POST /v1/search/quantum/tune.

Unlike the smoke tests (which use synthetic "doc-1", "doc-2" IDs), these
tests seed 10+ projects via the admin API so the training pairs reference
real project IDs that live in the SQLite test database. This catches
regressions where a schema migration or ID-handling change causes the
tune endpoint to silently mis-score results against the corpus.

Fixtures reuse the `seeded_client` pattern from conftest.py but extend it
to 12 projects covering multiple technology domains for realistic BM25
signal.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import AsyncGenerator, List, Tuple

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.algorithms.search import reset_indexes
from app.config import Settings
from app.main import create_app


QUANTUM_PATH = "/v1/search/quantum/tune"

# 12 projects spanning distinct domains — gives BM25 enough signal to
# discriminate between clusters when building training pairs.
_CORPUS: List[dict] = [
    {
        "name": "Auth Service",
        "description": "HMAC-SHA256 JWT authentication microservice with refresh tokens",
        "type": "backend",
        "tags": ["auth", "jwt", "security", "hmac"],
    },
    {
        "name": "Auth Gateway",
        "description": "OAuth2 and OpenID Connect gateway for enterprise SSO",
        "type": "backend",
        "tags": ["auth", "oauth", "oidc", "security"],
    },
    {
        "name": "Analytics Engine",
        "description": "Real-time data streaming pipeline with Kafka and ClickHouse",
        "type": "backend",
        "tags": ["kafka", "streaming", "analytics", "clickhouse"],
    },
    {
        "name": "ML Pipeline",
        "description": "Machine learning training pipeline with PyTorch and MLflow",
        "type": "backend",
        "tags": ["pytorch", "mlflow", "ml", "training"],
    },
    {
        "name": "Commerce API",
        "description": "Headless e-commerce GraphQL API with Stripe payment integration",
        "type": "backend",
        "tags": ["graphql", "stripe", "ecommerce", "payments"],
    },
    {
        "name": "Search Service",
        "description": "BM25 full-text search with semantic re-ranking via embeddings",
        "type": "backend",
        "tags": ["search", "bm25", "nlp", "embeddings"],
    },
    {
        "name": "Kubernetes Operator",
        "description": "Custom Kubernetes operator for managing stateful workloads",
        "type": "infrastructure",
        "tags": ["kubernetes", "operator", "k8s", "devops"],
    },
    {
        "name": "CI/CD Platform",
        "description": "GitHub Actions-based CI/CD platform with Docker build caching",
        "type": "infrastructure",
        "tags": ["cicd", "github-actions", "docker", "devops"],
    },
    {
        "name": "Embedding Model",
        "description": "Transformer encoder fine-tuned for sentence embeddings and similarity",
        "type": "ml",
        "tags": ["transformer", "embeddings", "nlp", "pytorch"],
    },
    {
        "name": "Data Lake",
        "description": "Petabyte-scale data lake with Parquet partitioning and Delta Lake",
        "type": "backend",
        "tags": ["datalake", "parquet", "delta", "analytics"],
    },
    {
        "name": "API Gateway",
        "description": "Rate-limiting reverse proxy with JWT validation and request routing",
        "type": "infrastructure",
        "tags": ["gateway", "proxy", "jwt", "ratelimit"],
    },
    {
        "name": "Notification Service",
        "description": "Multi-channel notification dispatcher for email, SMS, and push",
        "type": "backend",
        "tags": ["notifications", "email", "sms", "push"],
    },
]


def _make_token(secret: str, role: str = "admin", exp_offset: int = 86400) -> str:
    """Build a minimal HMAC-SHA256 JWT for testing (mirrors conftest.py)."""
    payload = {"sub": "1", "role": role, "exp": int(time.time()) + exp_offset}
    header = {"alg": "HS256", "typ": "JWT"}

    def b64(d: dict) -> str:
        return (
            base64.urlsafe_b64encode(
                json.dumps(d, separators=(",", ":")).encode()
            )
            .rstrip(b"=")
            .decode()
        )

    h64, p64 = b64(header), b64(payload)
    sig = hmac.new(secret.encode(), f"{h64}.{p64}".encode(), hashlib.sha256).digest()
    s64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{h64}.{p64}.{s64}"


@pytest.fixture(scope="function")
def settings() -> Settings:
    return Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        redis_url="redis://localhost:6379",
        debug=True,
        jwt_secret="test-secret-quantum-db",
        port=8003,
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
async def db_seeded_client(
    app, settings
) -> AsyncGenerator[Tuple[AsyncClient, List[str]], None]:
    """
    Seed all 12 corpus projects via the admin API, then yield:
        (anonymous_client, project_ids_in_insertion_order)

    The project_ids list contains real UUIDs from the SQLite DB —
    exactly what training pairs should reference so that BM25 scoring
    exercises the full DB-backed corpus path.
    """
    token = _make_token(settings.jwt_secret, role="admin")
    headers = {"Authorization": f"Bearer {token}"}
    ids: List[str] = []

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=headers,
    ) as admin_ac:
        for proj in _CORPUS:
            resp = await admin_ac.post("/v1/projects/", json=proj)
            assert resp.status_code == 201, f"Seed failed for {proj['name']}: {resp.text}"
            ids.append(resp.json()["id"])

    assert len(ids) == 12, f"Expected 12 seeded projects, got {len(ids)}"

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac, ids


def _build_training_pairs(ids: List[str]) -> List[dict]:
    """
    Construct training pairs that reference the real seeded project IDs.

    Indices align with _CORPUS order:
      0,1   — auth cluster (Auth Service, Auth Gateway)
      2,9   — analytics cluster (Analytics Engine, Data Lake)
      3,8   — ML cluster (ML Pipeline, Embedding Model)
      4     — commerce
      5     — search
      6,7   — infra/devops (K8s Operator, CI/CD Platform)
      10    — API gateway (jwt overlap with auth cluster)
      11    — notifications
    """
    return [
        # Auth domain — two relevant docs per query
        {
            "query": "authentication JWT security",
            "relevant_doc_ids": [ids[0], ids[1]],
        },
        {
            "query": "OAuth2 enterprise SSO gateway",
            "relevant_doc_ids": [ids[1], ids[10]],
        },
        # Analytics/data domain
        {
            "query": "real-time streaming data pipeline Kafka",
            "relevant_doc_ids": [ids[2], ids[9]],
        },
        {
            "query": "data lake Parquet analytics",
            "relevant_doc_ids": [ids[9], ids[2]],
        },
        # ML domain
        {
            "query": "machine learning PyTorch training",
            "relevant_doc_ids": [ids[3], ids[8]],
        },
        {
            "query": "transformer sentence embeddings NLP",
            "relevant_doc_ids": [ids[8], ids[5]],
        },
        # Infrastructure/DevOps domain
        {
            "query": "Kubernetes operator stateful workloads",
            "relevant_doc_ids": [ids[6]],
        },
        {
            "query": "CI/CD Docker GitHub Actions deployment",
            "relevant_doc_ids": [ids[7], ids[6]],
        },
        # Commerce
        {
            "query": "e-commerce GraphQL Stripe payments",
            "relevant_doc_ids": [ids[4]],
        },
        # Search
        {
            "query": "BM25 full-text search semantic re-ranking",
            "relevant_doc_ids": [ids[5]],
        },
        # Cross-domain: gateway/proxy overlaps auth and infra
        {
            "query": "rate limiting API gateway proxy JWT",
            "relevant_doc_ids": [ids[10], ids[0]],
        },
        # Notifications
        {
            "query": "email SMS push notification dispatcher",
            "relevant_doc_ids": [ids[11]],
        },
    ]


class TestQuantumDbIntegration:
    """
    Integration tests: training pairs reference real DB-backed project IDs.

    If the DB integration breaks (schema migration, ID serialisation change,
    BM25 corpus no longer populated from DB rows) these tests will fail
    with wrong NDCG scores or a 5xx, surfacing the regression before it
    reaches production.
    """

    async def test_tune_with_real_project_ids_succeeds(self, db_seeded_client):
        client, ids = db_seeded_client
        pairs = _build_training_pairs(ids)
        payload = {"training_pairs": pairs, "num_steps": 100}
        r = await client.post(QUANTUM_PATH, json=payload)
        assert r.status_code == 200, r.text

    async def test_response_contains_all_fields(self, db_seeded_client):
        client, ids = db_seeded_client
        payload = {"training_pairs": _build_training_pairs(ids), "num_steps": 100}
        body = (await client.post(QUANTUM_PATH, json=payload)).json()
        required = {"optimal_k1", "optimal_b", "quantum_ndcg", "baseline_ndcg", "fallback_used"}
        assert required.issubset(body.keys()), f"Missing: {required - body.keys()}"

    async def test_optimized_k1_in_valid_range(self, db_seeded_client):
        client, ids = db_seeded_client
        payload = {"training_pairs": _build_training_pairs(ids), "num_steps": 100}
        k1 = (await client.post(QUANTUM_PATH, json=payload)).json()["optimal_k1"]
        assert isinstance(k1, float)
        assert 0.1 <= k1 <= 5.0, f"k1 out of range: {k1}"

    async def test_optimized_b_in_unit_interval(self, db_seeded_client):
        client, ids = db_seeded_client
        payload = {"training_pairs": _build_training_pairs(ids), "num_steps": 100}
        b = (await client.post(QUANTUM_PATH, json=payload)).json()["optimal_b"]
        assert isinstance(b, float)
        assert 0.0 <= b <= 1.0, f"b out of range: {b}"

    async def test_ndcg_scores_are_non_negative(self, db_seeded_client):
        client, ids = db_seeded_client
        payload = {"training_pairs": _build_training_pairs(ids), "num_steps": 100}
        body = (await client.post(QUANTUM_PATH, json=payload)).json()
        assert body["quantum_ndcg"] >= 0.0, "quantum_ndcg must be non-negative"
        assert body["baseline_ndcg"] >= 0.0, "baseline_ndcg must be non-negative"

    async def test_quantum_ndcg_not_worse_than_baseline(self, db_seeded_client):
        """
        Core correctness check: after annealing against the real corpus the
        optimized parameters should not degrade NDCG relative to the baseline.
        A 5% tolerance absorbs numerical noise from the short annealing run.
        """
        client, ids = db_seeded_client
        payload = {"training_pairs": _build_training_pairs(ids), "num_steps": 200}
        body = (await client.post(QUANTUM_PATH, json=payload)).json()
        baseline = body["baseline_ndcg"]
        quantum = body["quantum_ndcg"]
        tolerance = 0.05
        assert quantum >= baseline - tolerance, (
            f"Quantum NDCG ({quantum:.4f}) degraded more than {tolerance:.0%} "
            f"below baseline ({baseline:.4f}) — annealer may be broken"
        )

    async def test_fallback_used_with_no_azure_env(self, db_seeded_client):
        """Verify fallback_used is True when no Azure Quantum credentials exist."""
        import os
        os.environ.pop("AZURE_QUANTUM_WORKSPACE_ID", None)
        client, ids = db_seeded_client
        payload = {"training_pairs": _build_training_pairs(ids), "num_steps": 100}
        body = (await client.post(QUANTUM_PATH, json=payload)).json()
        assert body["fallback_used"] is True

    async def test_all_12_projects_seeded_in_db(self, db_seeded_client):
        """
        Sanity-check that all 12 projects actually landed in the DB and are
        visible via the public list endpoint. If this fails, the training
        pairs constructed above would reference phantom IDs.
        """
        client, ids = db_seeded_client
        r = await client.get("/v1/projects/")
        assert r.status_code == 200, r.text
        returned_ids = {p["id"] for p in r.json()}
        for pid in ids:
            assert pid in returned_ids, (
                f"Project {pid} was seeded but not found in GET /v1/projects/"
            )

    async def test_single_domain_pairs_still_tune(self, db_seeded_client):
        """
        Training pairs restricted to the auth cluster (IDs 0 and 1) should
        still produce a valid tune response — the endpoint must not require
        IDs to span the full corpus.
        """
        client, ids = db_seeded_client
        auth_pairs = [
            {"query": "authentication JWT", "relevant_doc_ids": [ids[0], ids[1]]},
            {"query": "OAuth gateway security", "relevant_doc_ids": [ids[1]]},
            {"query": "HMAC token refresh", "relevant_doc_ids": [ids[0]]},
        ]
        payload = {"training_pairs": auth_pairs, "num_steps": 100}
        r = await client.post(QUANTUM_PATH, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert 0.1 <= body["optimal_k1"] <= 5.0
        assert 0.0 <= body["optimal_b"] <= 1.0

    async def test_maximum_corpus_pairs_accepted(self, db_seeded_client):
        """
        Build as many training pairs as the endpoint allows (max_length=200)
        using real project IDs to stress the validation and scoring path.
        """
        client, ids = db_seeded_client
        base_pairs = _build_training_pairs(ids)
        # Cycle through base pairs to reach 200 entries
        many_pairs = [base_pairs[i % len(base_pairs)] for i in range(200)]
        payload = {"training_pairs": many_pairs, "num_steps": 50}
        r = await client.post(QUANTUM_PATH, json=payload)
        assert r.status_code == 200, r.text

    async def test_mixed_real_and_unknown_ids_handled_gracefully(self, db_seeded_client):
        """
        If a training pair contains both a real project ID and a non-existent
        one, the endpoint must not crash — it should either score what it can
        or return a coherent error, never a 500.
        """
        client, ids = db_seeded_client
        mixed_pairs = [
            {"query": "auth security", "relevant_doc_ids": [ids[0], "non-existent-id-xyz"]},
            {"query": "kubernetes infra", "relevant_doc_ids": [ids[6]]},
        ]
        payload = {"training_pairs": mixed_pairs, "num_steps": 50}
        r = await client.post(QUANTUM_PATH, json=mixed_pairs)
        # Accept 200 (graceful scoring) or 422 (validation rejection)
        # but never a 5xx server error
        assert r.status_code in (200, 422), (
            f"Unexpected status {r.status_code} for mixed real/unknown IDs: {r.text}"
        )

    async def test_duplicate_pairs_k1_b_remain_valid(self, db_seeded_client):
        """
        Submitting 50 identical (query, relevant_doc_ids) pairs must not cause
        the annealer to overfit and produce out-of-range k1/b values or a
        collapsed NDCG score.

        The endpoint deduplicates before annealing, so the effective training
        signal is a single unique pair — the result must still satisfy the same
        parameter-range and score constraints as a well-formed diverse corpus.
        """
        client, ids = db_seeded_client
        single_pair = {
            "query": "authentication JWT security",
            "relevant_doc_ids": [ids[0], ids[1]],
        }
        duplicate_pairs = [single_pair] * 50
        payload = {"training_pairs": duplicate_pairs, "num_steps": 150}
        r = await client.post(QUANTUM_PATH, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()

        k1 = body["optimal_k1"]
        b = body["optimal_b"]
        quantum_ndcg = body["quantum_ndcg"]
        baseline_ndcg = body["baseline_ndcg"]

        assert 0.1 <= k1 <= 5.0, f"k1 out of valid range after duplicate input: {k1}"
        assert 0.0 <= b <= 1.0, f"b out of valid range after duplicate input: {b}"
        assert quantum_ndcg >= 0.0, f"quantum_ndcg collapsed to negative: {quantum_ndcg}"
        assert baseline_ndcg >= 0.0, f"baseline_ndcg collapsed to negative: {baseline_ndcg}"

        # NDCG must not degrade beyond a 10% tolerance relative to baseline
        tolerance = 0.10
        assert quantum_ndcg >= baseline_ndcg - tolerance, (
            f"Quantum NDCG ({quantum_ndcg:.4f}) degraded more than {tolerance:.0%} "
            f"below baseline ({baseline_ndcg:.4f}) when trained on duplicate pairs"
        )

    async def test_duplicate_pairs_metadata_reports_deduplication(self, db_seeded_client):
        """
        When 50 identical pairs are submitted the response metadata must report:
          training_pairs_received == 50
          training_pairs_unique   == 1

        This confirms the deduplication step ran and its results are visible to
        callers so they can detect misconfigured retry loops server-side without
        having to inspect their own payloads.
        """
        client, ids = db_seeded_client
        single_pair = {
            "query": "BM25 full-text search semantic re-ranking",
            "relevant_doc_ids": [ids[5]],
        }
        duplicate_pairs = [single_pair] * 50
        payload = {"training_pairs": duplicate_pairs, "num_steps": 50}
        r = await client.post(QUANTUM_PATH, json=payload)
        assert r.status_code == 200, r.text
        body = r.json()

        assert "training_pairs_received" in body, (
            "Response must contain 'training_pairs_received' metadata field"
        )
        assert "training_pairs_unique" in body, (
            "Response must contain 'training_pairs_unique' metadata field"
        )
        assert body["training_pairs_received"] == 50, (
            f"Expected training_pairs_received=50, got {body['training_pairs_received']}"
        )
        assert body["training_pairs_unique"] == 1, (
            f"Expected training_pairs_unique=1 after deduplication of 50 identical pairs, "
            f"got {body['training_pairs_unique']}"
        )
