"""
Regression contract tests — pins exact response field names and types for
POST /v1/graph/quantum/partition.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def app(monkeypatch):
    with patch("app.database.init_db"), patch("app.database.close_db", new_callable=AsyncMock):
        from app.main import create_app
        return create_app()


@pytest.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


NODES = ["alpha", "beta", "gamma", "delta"]
EDGES = [
    {"source": "alpha", "target": "beta", "weight": 1.0},
    {"source": "beta", "target": "gamma", "weight": 2.0},
    {"source": "gamma", "target": "delta", "weight": 0.5},
]

REQUIRED_FIELDS = {
    "partition_a": list,
    "partition_b": list,
    "cut_weight": float,
    "classical_cut_weight": float,
    "improvement_pct": float,
    "fallback_used": bool,
}


@pytest.mark.asyncio
async def test_field_names_contract(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    assert resp.status_code == 200
    body = resp.json()
    for field in REQUIRED_FIELDS:
        assert field in body, f"Contract violation: '{field}' missing"


@pytest.mark.asyncio
async def test_field_types_contract(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    body = resp.json()
    for field, t in REQUIRED_FIELDS.items():
        assert isinstance(body[field], t), (
            f"Contract violation: '{field}' expected {t.__name__}, got {type(body[field]).__name__}"
        )


@pytest.mark.asyncio
async def test_partitions_are_lists_of_strings_contract(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    body = resp.json()
    for node in body["partition_a"] + body["partition_b"]:
        assert isinstance(node, str), f"Node IDs must be strings, got {type(node)}"


@pytest.mark.asyncio
async def test_cut_weight_non_negative_contract(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    body = resp.json()
    assert body["cut_weight"] >= 0.0
    assert body["classical_cut_weight"] >= 0.0


@pytest.mark.asyncio
async def test_no_error_on_success_contract(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    body = resp.json()
    assert body.get("error") is None


@pytest.mark.asyncio
async def test_cut_weight_matches_returned_partitions_contract(client):
    """
    Core correctness invariant: the returned cut_weight must equal the actual
    weight of edges crossing the returned partition boundary.  This test was
    added to guard against the rebalancing step producing a stale cut_weight
    that does not reflect the final partition_a / partition_b.
    """
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    assert resp.status_code == 200
    body = resp.json()

    set_a = set(body["partition_a"])
    edge_map = {
        (e["source"], e["target"]): e["weight"] for e in EDGES
    }
    edge_map.update(
        {(e["target"], e["source"]): e["weight"] for e in EDGES}
    )

    recomputed = sum(
        w
        for (u, v), w in edge_map.items()
        if (u in set_a) != (v in set_a)
    ) / 2.0

    assert abs(body["cut_weight"] - recomputed) < 1e-4, (
        f"cut_weight {body['cut_weight']} does not match recomputed {recomputed} "
        f"for partitions {body['partition_a']} | {body['partition_b']}"
    )


@pytest.mark.asyncio
async def test_error_response_includes_fallback_used_contract(client):
    """
    Non-200 error responses from the quantum endpoint must include fallback_used
    so callers can distinguish quantum-vs-simulation failure context.
    The handler returns {error, fallback_used} at the top level (not under detail).
    """
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": ["only_one"], "edges": []},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert "fallback_used" in body, (
        f"Error response must include top-level 'fallback_used' field; got: {body}"
    )
    assert "error" in body, (
        f"Error response must include top-level 'error' field; got: {body}"
    )
    assert isinstance(body["fallback_used"], bool)
