"""
E2E smoke tests for POST /v1/graph/quantum/partition.

Boots the NexusGraph FastAPI app with DB patched out via ASGITransport —
no real server or database needed. These tests exist to catch
import-chain breakage (e.g. nexus_shared not resolvable) and routing
regressions as the sub-app evolves.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


QUANTUM_PATH = "/v1/graph/quantum/partition"

NODES = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]
EDGES = [
    {"source": "alpha", "target": "beta",  "weight": 2.0},
    {"source": "beta",  "target": "gamma", "weight": 1.5},
    {"source": "gamma", "target": "delta", "weight": 3.0},
    {"source": "delta", "target": "epsilon","weight": 0.8},
    {"source": "epsilon","target": "zeta",  "weight": 1.2},
    {"source": "alpha", "target": "delta",  "weight": 0.5},
]

SAMPLE_PAYLOAD = {"nodes": NODES, "edges": EDGES, "num_rounds": 50}


@pytest.fixture
def app():
    with (
        patch("app.database.init_db"),
        patch("app.database.close_db", new_callable=AsyncMock),
    ):
        from app.main import create_app
        return create_app()


@pytest.fixture
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


class TestQuantumSmokeNexusGraph:
    """Smoke: endpoint is reachable and returns the correct envelope shape."""

    async def test_quantum_partition_reachable(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert r.status_code == 200, r.text

    async def test_response_has_all_required_fields(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        required = {
            "partition_a",
            "partition_b",
            "cut_weight",
            "classical_cut_weight",
            "improvement_pct",
            "fallback_used",
        }
        assert required.issubset(body.keys()), (
            f"Missing fields: {required - body.keys()}"
        )

    async def test_partitions_cover_all_nodes(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        returned = set(body["partition_a"]) | set(body["partition_b"])
        assert returned == set(NODES), (
            f"Partitions don't cover all nodes: {returned}"
        )

    async def test_partitions_are_disjoint(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        overlap = set(body["partition_a"]) & set(body["partition_b"])
        assert not overlap, f"Partitions overlap: {overlap}"

    async def test_both_partitions_non_empty(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        assert len(body["partition_a"]) >= 1
        assert len(body["partition_b"]) >= 1

    async def test_cut_weight_non_negative(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        body = r.json()
        assert body["cut_weight"] >= 0.0
        assert body["classical_cut_weight"] >= 0.0

    async def test_fallback_used_is_bool(self, client):
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert isinstance(r.json()["fallback_used"], bool)

    async def test_fallback_true_when_no_azure_env(self, client):
        import os
        os.environ.pop("AZURE_QUANTUM_WORKSPACE_ID", None)
        r = await client.post(QUANTUM_PATH, json=SAMPLE_PAYLOAD)
        assert r.json()["fallback_used"] is True

    async def test_no_edges_cut_weight_is_zero(self, client):
        r = await client.post(
            QUANTUM_PATH,
            json={"nodes": ["x", "y", "z", "w"], "edges": [], "num_rounds": 50},
        )
        assert r.status_code == 200
        assert r.json()["cut_weight"] == 0.0

    async def test_single_node_rejected(self, client):
        r = await client.post(
            QUANTUM_PATH, json={"nodes": ["only"], "edges": []}
        )
        assert r.status_code in (400, 422)

    async def test_empty_nodes_rejected(self, client):
        r = await client.post(QUANTUM_PATH, json={"nodes": [], "edges": []})
        assert r.status_code == 422

    async def test_minimal_two_node_graph(self, client):
        r = await client.post(
            QUANTUM_PATH,
            json={
                "nodes": ["node-a", "node-b"],
                "edges": [{"source": "node-a", "target": "node-b", "weight": 1.0}],
                "num_rounds": 50,
            },
        )
        assert r.status_code == 200
        body = r.json()
        all_nodes = set(body["partition_a"]) | set(body["partition_b"])
        assert all_nodes == {"node-a", "node-b"}
