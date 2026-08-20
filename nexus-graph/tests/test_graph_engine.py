"""
Unit tests for NexusGraph engine functions.
All DB interactions are mocked — no live database required.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── helpers ───────────────────────────────────────────────────────────────────

def make_mapping(**kwargs):
    """Return a dict-like object that supports .mappings().all() style access."""
    m = MagicMock()
    m.__getitem__ = lambda self, k: kwargs[k]
    m.__contains__ = lambda self, k: k in kwargs
    for k, v in kwargs.items():
        setattr(m, k, v)
    return m


# ── _resolve_color ─────────────────────────────────────────────────────────────

def test_resolve_color_known_type():
    from app.graph_engine import _resolve_color
    assert _resolve_color("Person", None) == "#f59e0b"
    assert _resolve_color("Technology", None) == "#8b5cf6"


def test_resolve_color_db_override():
    from app.graph_engine import _resolve_color
    assert _resolve_color("Person", "#aabbcc") == "#aabbcc"


def test_resolve_color_default_color_falls_back_to_type():
    from app.graph_engine import _resolve_color
    # DB color is the same as the default — should use type-specific colour
    assert _resolve_color("Location", "#6366f1") == "#10b981"


def test_resolve_color_unknown_type():
    from app.graph_engine import _resolve_color
    result = _resolve_color("FutureThing", None)
    assert result.startswith("#")


def test_source_url_rejects_executable_and_relative_schemes():
    from app.graph_engine import _safe_source_url

    assert _safe_source_url("https://example.test/source") == "https://example.test/source"
    assert _safe_source_url("javascript:alert(1)") == ""
    assert _safe_source_url("/internal-source") == ""


# ── cluster cache ─────────────────────────────────────────────────────────────

def test_cluster_cache_starts_invalid():
    import app.graph_engine as eng
    eng._cluster_cache = {}
    eng._cluster_cached_at = 0.0
    assert eng._cluster_cache_valid() is False


def test_cluster_cache_valid_after_set():
    import time
    import app.graph_engine as eng
    eng._cluster_cache = {"clusters": {}, "clusterCount": 0, "cachedUntil": None, "algorithm": "louvain"}
    eng._cluster_cached_at = time.monotonic()
    assert eng._cluster_cache_valid() is True


def test_invalidate_cluster_cache():
    import app.graph_engine as eng
    eng._cluster_cache = {"some": "data"}
    eng._cluster_cached_at = 9999999.0
    eng.invalidate_cluster_cache()
    assert eng._cluster_cache_valid() is False


# ── get_nodes ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_nodes_returns_paginated_results():
    rows = [
        {
            "id": "uuid-1", "label": "Python", "type": "Technology",
            "color": "#8b5cf6", "summary": "A language",
            "source_url": "https://python.org", "source_label": "HN",
            "relation_count": 5,
        },
        {
            "id": "uuid-2", "label": "FastAPI", "type": "Technology",
            "color": "#8b5cf6", "summary": "Fast web framework",
            "source_url": "https://fastapi.tiangolo.com", "source_label": None,
            "relation_count": 3,
        },
    ]
    mock_rows = MagicMock()
    mock_rows.mappings.return_value.all.return_value = rows
    mock_scalar = MagicMock()
    mock_scalar.scalar.return_value = 2

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[mock_scalar, mock_rows])

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.graph_engine.get_session", return_value=mock_ctx):
        from app.graph_engine import get_nodes
        result = await get_nodes(search=None, type_filter=None, limit=10, offset=0)

    assert result.total == 2
    assert len(result.nodes) == 2
    assert result.nodes[0].label == "Python"
    assert result.nodes[0].type == "Technology"
    assert result.nodes[0].relationCount == 5
    assert result.limit == 10
    assert result.offset == 0
    assert result.returned == 2
    assert result.hasMore is False


@pytest.mark.asyncio
async def test_get_nodes_empty_db():
    mock_rows = MagicMock()
    mock_rows.mappings.return_value.all.return_value = []
    mock_scalar = MagicMock()
    mock_scalar.scalar.return_value = 0

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[mock_scalar, mock_rows])

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.graph_engine.get_session", return_value=mock_ctx):
        from app.graph_engine import get_nodes
        result = await get_nodes(search=None, type_filter=None, limit=100, offset=0)

    assert result.total == 0
    assert result.nodes == []


# ── get_node_detail ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_node_detail_returns_detail_with_neighbors():
    node_row = {
        "id": "uuid-1", "title": "Python", "type": "Technology",
        "summary": "A language", "source_url": "https://python.org",
        "source_label": "HN", "confidence": 0.95, "trend_score": 2.1,
        "scraped_at": None, "color": "#8b5cf6",
    }
    neighbor_row = {
        "id": "uuid-2", "title": "FastAPI", "type": "Technology",
        "color": "#8b5cf6", "relation_type": "uses", "weight": 1.0,
        "from_entity_id": "uuid-1",
    }

    mock_detail = MagicMock()
    mock_detail.mappings.return_value.first.return_value = node_row

    mock_neighbors = MagicMock()
    mock_neighbors.mappings.return_value.all.return_value = [neighbor_row]

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[mock_detail, mock_neighbors])

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.graph_engine.get_session", return_value=mock_ctx):
        from app.graph_engine import get_node_detail
        result = await get_node_detail("uuid-1")

    assert result is not None
    assert result.label == "Python"
    assert result.confidence == pytest.approx(0.95)
    assert len(result.neighbors) == 1
    assert result.neighbors[0].relationType == "uses"


@pytest.mark.asyncio
async def test_get_node_detail_not_found():
    mock_result = MagicMock()
    mock_result.mappings.return_value.first.return_value = None

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.graph_engine.get_session", return_value=mock_ctx):
        from app.graph_engine import get_node_detail
        result = await get_node_detail("nonexistent-id")

    assert result is None


# ── get_edges ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_edges_with_ids():
    edge_rows = [
        {"id": 1, "from_entity_id": "a", "to_entity_id": "b", "relation_type": "mentions", "weight": 1.5},
        {"id": 2, "from_entity_id": "b", "to_entity_id": "c", "relation_type": "uses",     "weight": 2.0},
    ]
    mock_result = MagicMock()
    mock_result.mappings.return_value.all.return_value = edge_rows

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.graph_engine.get_session", return_value=mock_ctx):
        from app.graph_engine import get_edges
        result = await get_edges(["a", "b", "c"])

    assert len(result.edges) == 2
    assert result.edges[0].relationType == "mentions"
    assert result.edges[1].weight == pytest.approx(2.0)


@pytest.mark.asyncio
async def test_get_edges_empty_ids():
    from app.graph_engine import get_edges
    result = await get_edges([])
    assert result.edges == []


@pytest.mark.asyncio
async def test_get_edges_marks_truncated_response(monkeypatch):
    import app.graph_engine as eng

    monkeypatch.setattr(eng, "get_settings", lambda: type("Settings", (), {"graph_max_subgraph_edges": 1})())
    edge_rows = [
        {"id": 1, "from_entity_id": "a", "to_entity_id": "b", "relation_type": "mentions", "weight": 2.0},
        {"id": 2, "from_entity_id": "a", "to_entity_id": "c", "relation_type": "uses", "weight": 1.0},
    ]
    mock_result = MagicMock()
    mock_result.mappings.return_value.all.return_value = edge_rows
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.graph_engine.get_session", return_value=mock_ctx):
        result = await eng.get_edges(["a", "b", "c"])

    assert [edge.id for edge in result.edges] == [1]
    assert result.returned == 1
    assert result.truncated is True


@pytest.mark.asyncio
async def test_get_subgraph_returns_observable_bounds(monkeypatch):
    import app.graph_engine as eng

    settings = type("Settings", (), {
        "graph_max_subgraph_depth": 2,
        "graph_max_subgraph_degree": 4,
        "graph_max_subgraph_nodes": 10,
        "graph_max_subgraph_edges": 10,
        "graph_display_threshold": 1,
    })()
    monkeypatch.setattr(eng, "get_settings", lambda: settings)
    exists = MagicMock()
    exists.fetchone.return_value = ("root",)
    node_rows = MagicMock()
    node_rows.mappings.return_value.all.return_value = [
        {"id": "root", "title": "Root", "type": "Technology", "color": None, "summary": None,
         "source_url": "https://example.test/root", "source_label": None, "relation_count": 2},
        {"id": "child", "title": "Child", "type": "Concept", "color": None, "summary": None,
         "source_url": "https://example.test/child", "source_label": None, "relation_count": 1},
    ]
    edge_rows = MagicMock()
    edge_rows.mappings.return_value.all.return_value = [
        {"id": 1, "from_entity_id": "root", "to_entity_id": "child", "relation_type": "related_to", "weight": 1.0},
    ]
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[exists, node_rows, edge_rows])
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.graph_engine.get_session", return_value=mock_ctx):
        response = await eng.get_subgraph("root", depth=1, degree_limit=3, node_limit=8, edge_limit=9)

    assert response is not None
    assert response.rootId == "root"
    assert response.returnedNodeCount == 2
    assert response.limits.degreeLimit == 3
    assert response.limits.nodeLimit == 8
    assert response.displayMode == "cluster-summary"


# ── get_clusters ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_clusters_empty_db():
    import app.graph_engine as eng
    eng.invalidate_cluster_cache()

    mock_nodes_result = MagicMock()
    mock_nodes_result.fetchall.return_value = []
    mock_edges_result = MagicMock()
    mock_edges_result.fetchall.return_value = []

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[mock_nodes_result, mock_edges_result])

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.graph_engine.get_session", return_value=mock_ctx):
        from app.graph_engine import get_clusters
        result = await get_clusters()

    assert result.clusters == {}
    assert result.clusterCount == 0
    assert result.algorithm == "louvain"


@pytest.mark.asyncio
async def test_get_clusters_uses_cache_on_second_call():
    import app.graph_engine as eng
    import time
    eng._cluster_cache = {
        "clusters": {"uuid-1": 0, "uuid-2": 1},
        "clusterCount": 2,
        "cachedUntil": None,
        "algorithm": "louvain",
    }
    eng._cluster_cached_at = time.monotonic()

    from app.graph_engine import get_clusters
    result = await get_clusters()
    assert result.clusters == {"uuid-1": 0, "uuid-2": 1}
    assert result.clusterCount == 2


# ── create_relation ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_relation_raises_for_missing_entity():
    mock_result = MagicMock()
    mock_result.fetchone.return_value = None

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.graph_engine.get_session", return_value=mock_ctx):
        from app.graph_engine import create_relation
        with pytest.raises(ValueError, match="not found"):
            await create_relation("missing", "other", "related_to", 1.0)
