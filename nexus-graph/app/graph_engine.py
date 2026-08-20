"""
NexusGraph engine — graph queries, Louvain clustering, ego-graph.
All queries run against the shared NexusConsult PostgreSQL database.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import text

from app.config import get_settings
from app.database import get_session
from app.models.graph import (
    ClustersResponse,
    ClusterSummary,
    EdgesResponse,
    GraphEdge,
    GraphLimits,
    GraphNode,
    GraphNodeDetail,
    NeighborNode,
    NodesResponse,
    SubgraphResponse,
)

logger = logging.getLogger(__name__)

# ── In-process cluster cache (cachetools-style manual TTL) ────────────────────
_cluster_cache: dict[str, Any] = {}
_cluster_cached_at: float = 0.0
_CLUSTER_TTL = 600.0  # 10 minutes


def _cluster_cache_valid(ttl: float | None = None) -> bool:
    """Return whether the bounded cluster cache is still fresh."""
    return bool(_cluster_cache) and (time.monotonic() - _cluster_cached_at) < (ttl or _CLUSTER_TTL)


_TYPE_COLORS: dict[str, str] = {
    "Person":       "#f59e0b",
    "Organization": "#3b82f6",
    "Technology":   "#8b5cf6",
    "Concept":      "#06b6d4",
    "Event":        "#ef4444",
    "Location":     "#10b981",
    "Product":      "#f97316",
    "Article":      "#6366f1",
    "Repository":   "#14b8a6",
    "Dataset":      "#ec4899",
}

_DEFAULT_COLOR = "#6366f1"


def _resolve_color(entity_type: str, db_color: str | None) -> str:
    if db_color and db_color != "#6366f1":
        return db_color
    return _TYPE_COLORS.get(entity_type, _DEFAULT_COLOR)


def _safe_source_url(value: Any) -> str:
    """Return a browser-safe external source URL or an empty string.

    Entity sources can originate with scrapers, so the graph API never emits
    executable or relative URL schemes into browser-facing node metadata.
    """
    if not isinstance(value, str):
        return ""
    candidate = value.strip()
    parsed = urlparse(candidate)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return ""
    return candidate


def _to_graph_node(row: Any) -> GraphNode:
    return GraphNode(
        id=str(row["id"]),
        label=row.get("label") or row.get("title") or "",
        type=row["type"] or "Unknown",
        color=_resolve_color(row["type"] or "", row["color"]),
        summary=row.get("summary"),
        sourceUrl=_safe_source_url(row.get("source_url")),
        sourceLabel=row.get("source_label"),
        relationCount=int(row.get("relation_count") or 0),
    )


def _louvain_membership(node_ids: list[str], edges: list[GraphEdge]) -> tuple[dict[str, int], int]:
    """Run Louvain over an already bounded graph; never load the full database graph."""
    if not node_ids:
        return {}, 0
    node_index = {node_id: index for index, node_id in enumerate(node_ids)}
    edge_list = [
        (node_index[edge.source], node_index[edge.target])
        for edge in edges
        if edge.source in node_index and edge.target in node_index
    ]
    try:
        import igraph as ig  # type: ignore[import]

        graph = ig.Graph(n=len(node_ids), edges=edge_list, directed=False)
        membership = graph.community_multilevel().membership
        return ({node_ids[index]: membership[index] for index in range(len(node_ids))}, len(set(membership)))
    except Exception as exc:
        logger.warning("igraph clustering failed (%s) — falling back to one community", exc)
        return {node_id: 0 for node_id in node_ids}, 1


def _cluster_summaries(nodes: list[GraphNode], clusters: dict[str, int]) -> list[ClusterSummary]:
    grouped: dict[int, list[GraphNode]] = {}
    for node in nodes:
        grouped.setdefault(clusters.get(node.id, 0), []).append(node)
    return [
        ClusterSummary(
            id=cluster_id,
            nodeCount=len(members),
            representativeId=max(members, key=lambda node: (node.relationCount, node.label)).id if members else None,
        )
        for cluster_id, members in sorted(grouped.items())
    ]


# ── nodes ─────────────────────────────────────────────────────────────────────

async def get_nodes(
    search: str | None,
    type_filter: str | None,
    limit: int,
    offset: int,
) -> NodesResponse:
    async with get_session() as session:
        params: dict[str, Any] = {"limit": limit + 1, "offset": offset}

        where_clauses = ["1=1"]
        if search:
            where_clauses.append("e.title ILIKE :search")
            params["search"] = f"%{search}%"
        if type_filter:
            where_clauses.append("e.type = :type_filter")
            params["type_filter"] = type_filter

        where_sql = " AND ".join(where_clauses)

        data_sql = text(f"""
            SELECT
                e.id,
                e.title          AS label,
                e.type,
                et.color,
                e.summary,
                e.source_url     AS source_url,
                e.source_label,
                (
                    SELECT COUNT(*) FROM entity_relations er
                    WHERE er.from_entity_id = e.id OR er.to_entity_id = e.id
                ) AS relation_count
            FROM entities e
            LEFT JOIN entity_types et ON et.name = e.type
            WHERE {where_sql}
            ORDER BY relation_count DESC, e.scraped_at DESC
            LIMIT :limit OFFSET :offset
        """)

        count_sql = text(f"""
            SELECT COUNT(*) FROM entities e WHERE {where_sql}
        """)

        count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
        total_row = await session.execute(count_sql, count_params)
        total = total_row.scalar() or 0

        rows = (await session.execute(data_sql, params)).mappings().all()

    has_more = len(rows) > limit
    nodes = [_to_graph_node(row) for row in rows[:limit]]
    return NodesResponse(
        nodes=nodes,
        total=total,
        limit=limit,
        offset=offset,
        returned=len(nodes),
        hasMore=has_more,
        nextOffset=offset + len(nodes) if has_more else None,
        truncated=has_more,
    )


# ── node detail ───────────────────────────────────────────────────────────────

async def get_node_detail(node_id: str) -> GraphNodeDetail | None:
    async with get_session() as session:
        row = (await session.execute(text("""
            SELECT
                e.id, e.title, e.type, e.summary, e.source_url, e.source_label,
                e.confidence, e.trend_score, e.scraped_at,
                et.color
            FROM entities e
            LEFT JOIN entity_types et ON et.name = e.type
            WHERE e.id = :id
        """), {"id": node_id})).mappings().first()

        if row is None:
            return None

        settings = get_settings()
        neighbor_rows = (await session.execute(text("""
            SELECT
                e2.id, e2.title, e2.type, et2.color,
                er.relation_type, er.weight,
                er.from_entity_id
            FROM entity_relations er
            JOIN entities e2
              ON e2.id = CASE
                    WHEN er.from_entity_id = :id THEN er.to_entity_id
                    ELSE er.from_entity_id
                 END
            LEFT JOIN entity_types et2 ON et2.name = e2.type
            WHERE er.from_entity_id = :id OR er.to_entity_id = :id
            ORDER BY er.weight DESC
            LIMIT :limit
        """), {"id": node_id, "limit": settings.graph_max_subgraph_degree + 1})).mappings().all()

    neighbors = [
        NeighborNode(
            id=str(r["id"]),
            label=r["title"] or "",
            type=r["type"] or "Unknown",
            color=_resolve_color(r["type"] or "", r["color"]),
            relationType=r["relation_type"],
            weight=float(r["weight"] or 1.0),
        )
        for r in neighbor_rows[:settings.graph_max_subgraph_degree]
    ]

    scraped_str = row["scraped_at"].isoformat() if row["scraped_at"] else None

    return GraphNodeDetail(
        id=str(row["id"]),
        label=row["title"] or "",
        type=row["type"] or "Unknown",
        color=_resolve_color(row["type"] or "", row["color"]),
        summary=row["summary"],
        sourceUrl=_safe_source_url(row["source_url"]),
        sourceLabel=row["source_label"],
        confidence=float(row["confidence"]) if row["confidence"] is not None else None,
        trendScore=float(row["trend_score"] or 0.0),
        scrapedAt=scraped_str,
        relationCount=len(neighbor_rows),
        neighbors=neighbors,
        neighborsTruncated=len(neighbor_rows) > settings.graph_max_subgraph_degree,
    )


# ── edges ─────────────────────────────────────────────────────────────────────

async def get_edges(ids: list[str]) -> EdgesResponse:
    if not ids:
        return EdgesResponse(edges=[], returned=0, edgeLimit=get_settings().graph_max_subgraph_edges)

    edge_limit = get_settings().graph_max_subgraph_edges
    async with get_session() as session:
        rows = (await session.execute(text("""
            SELECT id, from_entity_id, to_entity_id, relation_type, weight
            FROM entity_relations
            WHERE from_entity_id = ANY(:ids) AND to_entity_id = ANY(:ids)
            ORDER BY weight DESC, id ASC
            LIMIT :limit
        """), {"ids": ids, "limit": edge_limit + 1})).mappings().all()

    edges = [
        GraphEdge(
            id=r["id"],
            source=str(r["from_entity_id"]),
            target=str(r["to_entity_id"]),
            relationType=r["relation_type"],
            weight=float(r["weight"] or 1.0),
        )
        for r in rows[:edge_limit]
    ]
    return EdgesResponse(
        edges=edges,
        returned=len(edges),
        truncated=len(rows) > edge_limit,
        edgeLimit=edge_limit,
    )


# ── clusters (Louvain via igraph) ─────────────────────────────────────────────

async def get_clusters() -> ClustersResponse:
    global _cluster_cache, _cluster_cached_at
    settings = get_settings()
    ttl = float(settings.cluster_cache_ttl)

    if _cluster_cache_valid(ttl):
        return ClustersResponse(**_cluster_cache)

    async with get_session() as session:
        node_rows = (await session.execute(
            text("SELECT id FROM entities ORDER BY scraped_at DESC, id ASC LIMIT :limit"),
            {"limit": settings.graph_cluster_max_nodes + 1},
        )).fetchall()
        node_truncated = len(node_rows) > settings.graph_cluster_max_nodes
        node_ids = [str(row[0]) for row in node_rows[:settings.graph_cluster_max_nodes]]
        edge_rows = (await session.execute(
            text("""
                SELECT id, from_entity_id, to_entity_id, relation_type, weight
                FROM entity_relations
                WHERE from_entity_id = ANY(:ids) AND to_entity_id = ANY(:ids)
                ORDER BY weight DESC, id ASC
                LIMIT :limit
            """),
            {"ids": node_ids, "limit": settings.graph_cluster_max_edges + 1},
        )).mappings().all() if node_ids else []

    if not node_ids:
        resp = ClustersResponse(
            clusters={},
            clusterCount=0,
            algorithm="louvain",
            limits=GraphLimits(
                nodeLimit=settings.graph_cluster_max_nodes,
                edgeLimit=settings.graph_cluster_max_edges,
            ),
        )
        _cluster_cache = resp.model_dump()
        _cluster_cached_at = time.monotonic()
        return resp

    edge_truncated = len(edge_rows) > settings.graph_cluster_max_edges
    edges = [
        GraphEdge(
            id=row["id"],
            source=str(row["from_entity_id"]),
            target=str(row["to_entity_id"]),
            relationType=row["relation_type"],
            weight=float(row["weight"] or 1.0),
        )
        for row in edge_rows[:settings.graph_cluster_max_edges]
    ]
    clusters_map, n_clusters = _louvain_membership(node_ids, edges)
    cached_until = (datetime.now(timezone.utc) + timedelta(seconds=ttl)).replace(microsecond=0).isoformat()

    resp = ClustersResponse(
        clusters=clusters_map,
        clusterCount=n_clusters,
        cachedUntil=cached_until,
        algorithm="louvain",
        nodeCount=len(node_ids),
        edgeCount=len(edges),
        truncated=node_truncated or edge_truncated,
        limits=GraphLimits(
            nodeLimit=settings.graph_cluster_max_nodes,
            edgeLimit=settings.graph_cluster_max_edges,
        ),
    )
    _cluster_cache = resp.model_dump()
    _cluster_cached_at = time.monotonic()
    return resp


def invalidate_cluster_cache() -> None:
    global _cluster_cache, _cluster_cached_at
    _cluster_cache = {}
    _cluster_cached_at = 0.0


# ── subgraph (ego-graph radius 2) ─────────────────────────────────────────────

async def get_subgraph(
    node_id: str,
    *,
    depth: int = 1,
    degree_limit: int | None = None,
    node_limit: int | None = None,
    edge_limit: int | None = None,
) -> SubgraphResponse | None:
    """Return a deterministic, bounded focused graph rooted at ``node_id``.

    The recursive traversal applies a per-node relationship cap before nodes are
    selected.  The result therefore remains bounded even for high-degree roots.
    """
    settings = get_settings()
    depth = min(depth, settings.graph_max_subgraph_depth)
    degree_limit = degree_limit or settings.graph_max_subgraph_degree
    node_limit = node_limit or settings.graph_max_subgraph_nodes
    edge_limit = edge_limit or settings.graph_max_subgraph_edges

    async with get_session() as session:
        # Verify node exists
        exists = (await session.execute(
            text("SELECT id FROM entities WHERE id = :id"), {"id": node_id}
        )).fetchone()
        if exists is None:
            return None

        # Per-hop, per-node bounded traversal. The LATERAL relation slice is
        # ordered deterministically so clients receive stable focused views.
        subgraph_rows = (await session.execute(text("""
            WITH RECURSIVE walk(id, traversal_depth) AS (
                SELECT CAST(:id AS varchar), 0
                UNION
                SELECT rel.neighbor_id, walk.traversal_depth + 1
                FROM walk
                CROSS JOIN LATERAL (
                    SELECT CASE
                        WHEN er.from_entity_id::varchar = walk.id THEN er.to_entity_id::varchar
                        ELSE er.from_entity_id::varchar
                    END AS neighbor_id
                    FROM entity_relations er
                    WHERE er.from_entity_id::varchar = walk.id
                       OR er.to_entity_id::varchar = walk.id
                    ORDER BY er.weight DESC, er.id ASC
                    LIMIT :degree_limit
                ) rel
                WHERE walk.traversal_depth < :depth
            ),
            focused_ids AS (
                SELECT id, MIN(traversal_depth) AS traversal_depth
                FROM walk
                GROUP BY id
            )
            SELECT
                e.id, e.title, e.type, et.color,
                e.summary, e.source_url, e.source_label,
                (
                    SELECT COUNT(*) FROM entity_relations er2
                    WHERE er2.from_entity_id = e.id OR er2.to_entity_id = e.id
                ) AS relation_count
            FROM entities e
            JOIN focused_ids fi ON fi.id = e.id::varchar
            LEFT JOIN entity_types et ON et.name = e.type
            ORDER BY fi.traversal_depth ASC, relation_count DESC, e.id ASC
            LIMIT :node_fetch_limit
        """), {
            "id": node_id,
            "depth": depth,
            "degree_limit": degree_limit,
            "node_fetch_limit": node_limit + 1,
        })).mappings().all()

        node_truncated = len(subgraph_rows) > node_limit
        subgraph_rows = subgraph_rows[:node_limit]
        subgraph_ids = [str(row["id"]) for row in subgraph_rows]

        if len(subgraph_ids) > 1:
            edge_rows = (await session.execute(text("""
                SELECT id, from_entity_id, to_entity_id, relation_type, weight
                FROM entity_relations
                WHERE from_entity_id = ANY(:ids) AND to_entity_id = ANY(:ids)
                ORDER BY weight DESC, id ASC
                LIMIT :edge_fetch_limit
            """), {"ids": subgraph_ids, "edge_fetch_limit": edge_limit + 1})).mappings().all()
        else:
            edge_rows = []

    edge_truncated = len(edge_rows) > edge_limit
    nodes = [_to_graph_node(row) for row in subgraph_rows]
    edges = [
        GraphEdge(
            id=r["id"],
            source=str(r["from_entity_id"]),
            target=str(r["to_entity_id"]),
            relationType=r["relation_type"],
            weight=float(r["weight"] or 1.0),
        )
        for r in edge_rows[:edge_limit]
    ]
    is_summary = len(nodes) > settings.graph_display_threshold or node_truncated or edge_truncated
    clusters, _ = _louvain_membership([node.id for node in nodes], edges) if is_summary else ({}, 0)
    return SubgraphResponse(
        nodes=nodes,
        edges=edges,
        rootId=node_id,
        depth=depth,
        returnedNodeCount=len(nodes),
        returnedEdgeCount=len(edges),
        truncated=node_truncated or edge_truncated,
        displayMode="cluster-summary" if is_summary else "nodes",
        clusters=clusters,
        clusterSummaries=_cluster_summaries(nodes, clusters) if is_summary else [],
        canExpand=depth < settings.graph_max_subgraph_depth,
        nextDepth=depth + 1 if depth < settings.graph_max_subgraph_depth else None,
        limits=GraphLimits(
            maxDepth=settings.graph_max_subgraph_depth,
            degreeLimit=degree_limit,
            nodeLimit=node_limit,
            edgeLimit=edge_limit,
        ),
    )


# ── create relation ───────────────────────────────────────────────────────────

async def create_relation(
    from_entity_id: str,
    to_entity_id: str,
    relation_type: str,
    weight: float,
) -> GraphEdge:
    async with get_session() as session:
        # Verify both entities exist
        for eid in (from_entity_id, to_entity_id):
            row = (await session.execute(
                text("SELECT id FROM entities WHERE id = :id"), {"id": eid}
            )).fetchone()
            if row is None:
                raise ValueError(f"Entity not found: {eid}")

        result = await session.execute(text("""
            INSERT INTO entity_relations (from_entity_id, to_entity_id, relation_type, weight)
            VALUES (:from_id, :to_id, :rel_type, :weight)
            RETURNING id
        """), {
            "from_id": from_entity_id,
            "to_id":   to_entity_id,
            "rel_type": relation_type,
            "weight":  weight,
        })
        new_id = result.scalar()
        await session.commit()

    invalidate_cluster_cache()
    return GraphEdge(
        id=new_id,
        source=from_entity_id,
        target=to_entity_id,
        relationType=relation_type,
        weight=weight,
    )
