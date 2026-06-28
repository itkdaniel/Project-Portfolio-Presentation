"""
Unit tests for POST /v1/graph/quantum/partition.

Runs against the NexusGraph FastAPI app with DB init patched out.
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


NODES = ["A", "B", "C", "D"]
EDGES = [
    {"source": "A", "target": "B", "weight": 2.0},
    {"source": "B", "target": "C", "weight": 1.0},
    {"source": "C", "target": "D", "weight": 3.0},
    {"source": "A", "target": "D", "weight": 0.5},
]


@pytest.mark.asyncio
async def test_quantum_partition_returns_200(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_quantum_partition_response_shape(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    body = resp.json()
    required = {"partition_a", "partition_b", "cut_weight", "classical_cut_weight", "improvement_pct", "fallback_used"}
    assert required.issubset(body.keys()), f"Missing fields: {required - body.keys()}"


@pytest.mark.asyncio
async def test_quantum_partition_covers_all_nodes(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    body = resp.json()
    all_returned = set(body["partition_a"]) | set(body["partition_b"])
    assert all_returned == set(NODES), f"Partitions don't cover all nodes: {all_returned}"


@pytest.mark.asyncio
async def test_quantum_partition_no_overlap(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    body = resp.json()
    overlap = set(body["partition_a"]) & set(body["partition_b"])
    assert not overlap, f"Partitions overlap: {overlap}"


@pytest.mark.asyncio
async def test_quantum_partition_both_non_empty(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    body = resp.json()
    assert len(body["partition_a"]) >= 1
    assert len(body["partition_b"]) >= 1


@pytest.mark.asyncio
async def test_quantum_partition_cut_weight_non_negative(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    body = resp.json()
    assert body["cut_weight"] >= 0.0
    assert body["classical_cut_weight"] >= 0.0


@pytest.mark.asyncio
async def test_quantum_partition_fallback_used_is_bool(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": NODES, "edges": EDGES},
    )
    body = resp.json()
    assert isinstance(body["fallback_used"], bool)


@pytest.mark.asyncio
async def test_quantum_partition_no_edges(client):
    """Graph with no edges: cut weight should be 0."""
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": ["X", "Y", "Z"], "edges": []},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["cut_weight"] == 0.0


# ── Validation ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_quantum_partition_single_node_rejected(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": ["only-one"], "edges": []},
    )
    assert resp.status_code in (422, 400)


@pytest.mark.asyncio
async def test_quantum_partition_empty_nodes_rejected(client):
    resp = await client.post(
        "/v1/graph/quantum/partition",
        json={"nodes": [], "edges": []},
    )
    assert resp.status_code == 422
