"""
Integration tests for NexusGraph API routes (mock engine).
Uses HTTPX AsyncClient against the FastAPI app.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from app.models.graph import (
    ClustersResponse,
    EdgesResponse,
    GraphEdge,
    GraphNode,
    GraphNodeDetail,
    NeighborNode,
    NodesResponse,
    SubgraphResponse,
)


@pytest.fixture
def app():
    """Create a fresh app instance with DB init skipped."""
    with patch("app.database.init_db"), patch("app.database.close_db", new_callable=AsyncMock):
        from app.main import create_app
        return create_app()


@pytest.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── /health ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_returns_200(client):
    res = await client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "nexus-graph"
    assert "version" in body
    assert "uptime_seconds" in body


# ── /info ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_info_returns_service_metadata(client):
    res = await client.get("/info")
    assert res.status_code == 200
    body = res.json()
    assert body["service"] == "nexus-graph"
    assert isinstance(body["port"], int) and body["port"] > 0
    assert isinstance(body["endpoints"], list)
    assert len(body["endpoints"]) >= 9

    methods = {ep["method"] for ep in body["endpoints"]}
    assert "GET" in methods
    assert "POST" in methods

    paths = [ep["path"] for ep in body["endpoints"]]
    assert "/v1/graph/nodes" in paths
    assert "/v1/graph/clusters" in paths
    assert "/v1/graph/relations" in paths


@pytest.mark.asyncio
async def test_info_endpoints_have_required_fields(client):
    res = await client.get("/info")
    for ep in res.json()["endpoints"]:
        assert "method" in ep
        assert "path" in ep
        assert "auth" in ep
        assert isinstance(ep["auth"], bool)


# ── /openapi.json ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_openapi_json_is_valid(client):
    res = await client.get("/openapi.json")
    assert res.status_code == 200
    spec = res.json()
    assert "openapi" in spec
    assert "paths" in spec
    assert "/v1/graph/nodes" in spec["paths"]
    assert "/v1/graph/clusters" in spec["paths"]


# ── GET /v1/graph/nodes ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_nodes_returns_200(client):
    mock_resp = NodesResponse(
        nodes=[
            GraphNode(id="n1", label="Python", type="Technology", color="#8b5cf6",
                      sourceUrl="https://python.org", relationCount=5),
        ],
        total=1, limit=100, offset=0,
    )
    with patch("app.routers.graph.engine.get_nodes", new_callable=AsyncMock, return_value=mock_resp):
        res = await client.get("/v1/graph/nodes")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["nodes"][0]["label"] == "Python"


@pytest.mark.asyncio
async def test_get_nodes_passes_search_param(client):
    mock_resp = NodesResponse(nodes=[], total=0, limit=50, offset=0)
    with patch("app.routers.graph.engine.get_nodes", new_callable=AsyncMock, return_value=mock_resp) as mock_fn:
        res = await client.get("/v1/graph/nodes?search=python&limit=50")
    assert res.status_code == 200
    mock_fn.assert_called_once_with(search="python", type_filter=None, limit=50, offset=0)


@pytest.mark.asyncio
async def test_get_nodes_passes_type_filter(client):
    mock_resp = NodesResponse(nodes=[], total=0, limit=100, offset=0)
    with patch("app.routers.graph.engine.get_nodes", new_callable=AsyncMock, return_value=mock_resp) as mock_fn:
        await client.get("/v1/graph/nodes?type=Person")
    mock_fn.assert_called_once_with(search=None, type_filter="Person", limit=100, offset=0)


@pytest.mark.asyncio
async def test_get_nodes_rejects_limit_too_large(client):
    mock_resp = NodesResponse(nodes=[], total=0, limit=500, offset=0)
    with patch("app.routers.graph.engine.get_nodes", new_callable=AsyncMock, return_value=mock_resp):
        res = await client.get("/v1/graph/nodes?limit=501")
    assert res.status_code == 422


# ── GET /v1/graph/nodes/:id ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_node_detail_returns_200(client):
    detail = GraphNodeDetail(
        id="n1", label="Python", type="Technology", color="#8b5cf6",
        sourceUrl="https://python.org", relationCount=3, trendScore=1.5,
        neighbors=[NeighborNode(id="n2", label="FastAPI", type="Technology",
                                color="#8b5cf6", relationType="uses", weight=1.0)],
    )
    with patch("app.routers.graph.engine.get_node_detail", new_callable=AsyncMock, return_value=detail):
        res = await client.get("/v1/graph/nodes/n1")
    assert res.status_code == 200
    body = res.json()
    assert body["label"] == "Python"
    assert len(body["neighbors"]) == 1
    assert body["neighbors"][0]["relationType"] == "uses"


@pytest.mark.asyncio
async def test_get_node_detail_404(client):
    with patch("app.routers.graph.engine.get_node_detail", new_callable=AsyncMock, return_value=None):
        res = await client.get("/v1/graph/nodes/nonexistent")
    assert res.status_code == 404
    assert "not_found" in res.json()["detail"]["error"]


# ── GET /v1/graph/edges ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_edges_returns_200(client):
    mock_resp = EdgesResponse(edges=[
        GraphEdge(id=1, source="a", target="b", relationType="mentions", weight=1.0),
    ])
    with patch("app.routers.graph.engine.get_edges", new_callable=AsyncMock, return_value=mock_resp):
        res = await client.get("/v1/graph/edges?ids=a,b,c")
    assert res.status_code == 200
    body = res.json()
    assert len(body["edges"]) == 1
    assert body["edges"][0]["relationType"] == "mentions"


@pytest.mark.asyncio
async def test_get_edges_missing_ids_returns_422(client):
    res = await client.get("/v1/graph/edges")
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_get_edges_empty_ids_string_returns_400(client):
    res = await client.get("/v1/graph/edges?ids=")
    assert res.status_code == 400


# ── GET /v1/graph/clusters ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_clusters_returns_200(client):
    mock_resp = ClustersResponse(
        clusters={"n1": 0, "n2": 0, "n3": 1},
        clusterCount=2,
        algorithm="louvain",
    )
    with patch("app.routers.graph.engine.get_clusters", new_callable=AsyncMock, return_value=mock_resp):
        res = await client.get("/v1/graph/clusters")
    assert res.status_code == 200
    body = res.json()
    assert body["clusterCount"] == 2
    assert body["algorithm"] == "louvain"
    assert body["clusters"]["n1"] == 0
    assert body["clusters"]["n3"] == 1


# ── GET /v1/graph/subgraph/:id ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_subgraph_returns_200(client):
    mock_resp = SubgraphResponse(
        nodes=[
            GraphNode(id="n1", label="Root", type="Technology", color="#8b5cf6",
                      sourceUrl="https://example.com", relationCount=2),
            GraphNode(id="n2", label="Neighbor", type="Concept", color="#06b6d4",
                      sourceUrl="https://example.com/n", relationCount=1),
        ],
        edges=[GraphEdge(id=1, source="n1", target="n2", relationType="related_to", weight=1.0)],
    )
    with patch("app.routers.graph.engine.get_subgraph", new_callable=AsyncMock, return_value=mock_resp):
        res = await client.get("/v1/graph/subgraph/n1")
    assert res.status_code == 200
    body = res.json()
    assert len(body["nodes"]) == 2
    assert len(body["edges"]) == 1


@pytest.mark.asyncio
async def test_get_subgraph_404(client):
    with patch("app.routers.graph.engine.get_subgraph", new_callable=AsyncMock, return_value=None):
        res = await client.get("/v1/graph/subgraph/nonexistent")
    assert res.status_code == 404


# ── POST /v1/graph/relations ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_post_relation_returns_201(client):
    mock_edge = GraphEdge(id=99, source="n1", target="n2", relationType="mentions", weight=1.5)
    with patch("app.routers.graph.engine.create_relation", new_callable=AsyncMock, return_value=mock_edge):
        res = await client.post("/v1/graph/relations", json={
            "fromEntityId": "n1",
            "toEntityId": "n2",
            "relationType": "mentions",
            "weight": 1.5,
        })
    assert res.status_code == 201
    body = res.json()
    assert body["id"] == 99
    assert body["relationType"] == "mentions"


@pytest.mark.asyncio
async def test_post_relation_same_source_target_returns_400(client):
    res = await client.post("/v1/graph/relations", json={
        "fromEntityId": "same",
        "toEntityId": "same",
    })
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_post_relation_missing_entity_returns_404(client):
    with patch("app.routers.graph.engine.create_relation",
               new_callable=AsyncMock, side_effect=ValueError("Entity not found: x")):
        res = await client.post("/v1/graph/relations", json={
            "fromEntityId": "x",
            "toEntityId": "y",
        })
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_post_relation_weight_out_of_range_returns_422(client):
    res = await client.post("/v1/graph/relations", json={
        "fromEntityId": "a",
        "toEntityId": "b",
        "weight": 99.9,
    })
    assert res.status_code == 422
