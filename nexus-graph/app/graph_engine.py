"""
NexusGraph engine — graph queries, Louvain clustering, ego-graph.
All queries run against the shared NexusConsult PostgreSQL database.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

from app.database import get_session
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

logger = logging.getLogger(__name__)

# ── In-process cluster cache (cachetools-style manual TTL) ────────────────────
_cluster_cache: dict[str, Any] = {}
_cluster_cached_at: float = 0.0
_CLUSTER_TTL = 600.0  # 10 minutes


def _cluster_cache_valid() -> bool:
    return bool(_cluster_cache) and (time.monotonic() - _cluster_cached_at) < _CLUSTER_TTL


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


# ── nodes ─────────────────────────────────────────────────────────────────────

async def get_nodes(
    search: str | None,
    type_filter: str | None,
    limit: int,
    offset: int,
) -> NodesResponse:
    async with get_session() as session:
        params: dict[str, Any] = {"limit": limit, "offset": offset}

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

    nodes = [
        GraphNode(
            id=str(r["id"]),
            label=r["label"] or "",
            type=r["type"] or "Unknown",
            color=_resolve_color(r["type"] or "", r["color"]),
            summary=r["summary"],
            sourceUrl=r["source_url"] or "",
            sourceLabel=r["source_label"],
            relationCount=int(r["relation_count"] or 0),
        )
        for r in rows
    ]
    return NodesResponse(nodes=nodes, total=total, limit=limit, offset=offset)


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
            LIMIT 50
        """), {"id": node_id})).mappings().all()

    neighbors = [
        NeighborNode(
            id=str(r["id"]),
            label=r["title"] or "",
            type=r["type"] or "Unknown",
            color=_resolve_color(r["type"] or "", r["color"]),
            relationType=r["relation_type"],
            weight=float(r["weight"] or 1.0),
        )
        for r in neighbor_rows
    ]

    scraped_str = row["scraped_at"].isoformat() if row["scraped_at"] else None

    return GraphNodeDetail(
        id=str(row["id"]),
        label=row["title"] or "",
        type=row["type"] or "Unknown",
        color=_resolve_color(row["type"] or "", row["color"]),
        summary=row["summary"],
        sourceUrl=row["source_url"] or "",
        sourceLabel=row["source_label"],
        confidence=float(row["confidence"]) if row["confidence"] is not None else None,
        trendScore=float(row["trend_score"] or 0.0),
        scrapedAt=scraped_str,
        relationCount=len(neighbors),
        neighbors=neighbors,
    )


# ── edges ─────────────────────────────────────────────────────────────────────

async def get_edges(ids: list[str]) -> EdgesResponse:
    if not ids:
        return EdgesResponse(edges=[])

    async with get_session() as session:
        rows = (await session.execute(text("""
            SELECT id, from_entity_id, to_entity_id, relation_type, weight
            FROM entity_relations
            WHERE from_entity_id = ANY(:ids) AND to_entity_id = ANY(:ids)
            ORDER BY weight DESC
        """), {"ids": ids})).mappings().all()

    edges = [
        GraphEdge(
            id=r["id"],
            source=str(r["from_entity_id"]),
            target=str(r["to_entity_id"]),
            relationType=r["relation_type"],
            weight=float(r["weight"] or 1.0),
        )
        for r in rows
    ]
    return EdgesResponse(edges=edges)


# ── clusters (Louvain via igraph) ─────────────────────────────────────────────

async def get_clusters() -> ClustersResponse:
    global _cluster_cache, _cluster_cached_at

    if _cluster_cache_valid():
        return ClustersResponse(**_cluster_cache)

    async with get_session() as session:
        node_rows = (await session.execute(
            text("SELECT id FROM entities ORDER BY scraped_at DESC")
        )).fetchall()
        edge_rows = (await session.execute(
            text("SELECT from_entity_id, to_entity_id FROM entity_relations")
        )).fetchall()

    node_ids = [str(r[0]) for r in node_rows]
    if not node_ids:
        resp = ClustersResponse(clusters={}, clusterCount=0, algorithm="louvain")
        _cluster_cache = resp.model_dump()
        _cluster_cached_at = time.monotonic()
        return resp

    node_idx: dict[str, int] = {nid: i for i, nid in enumerate(node_ids)}
    edge_list = [
        (node_idx[str(r[0])], node_idx[str(r[1])])
        for r in edge_rows
        if str(r[0]) in node_idx and str(r[1]) in node_idx
    ]

    try:
        import igraph as ig  # type: ignore[import]

        g = ig.Graph(n=len(node_ids), edges=edge_list, directed=False)
        communities = g.community_multilevel()
        membership = communities.membership
        clusters_map = {node_ids[i]: membership[i] for i in range(len(node_ids))}
        n_clusters = len(set(membership))
    except Exception as exc:
        logger.warning("igraph clustering failed (%s) — falling back to singleton clusters", exc)
        clusters_map = {nid: 0 for nid in node_ids}
        n_clusters = 1

    cached_until = datetime.fromtimestamp(
        time.monotonic() + _CLUSTER_TTL - (time.monotonic() - time.monotonic()),
        tz=timezone.utc,
    ).replace(
        second=0, microsecond=0
    ).isoformat()

    resp = ClustersResponse(
        clusters=clusters_map,
        clusterCount=n_clusters,
        cachedUntil=cached_until,
        algorithm="louvain",
    )
    _cluster_cache = resp.model_dump()
    _cluster_cached_at = time.monotonic()
    return resp


def invalidate_cluster_cache() -> None:
    global _cluster_cache, _cluster_cached_at
    _cluster_cache = {}
    _cluster_cached_at = 0.0


# ── subgraph (ego-graph radius 2) ─────────────────────────────────────────────

async def get_subgraph(node_id: str) -> SubgraphResponse | None:
    async with get_session() as session:
        # Verify node exists
        exists = (await session.execute(
            text("SELECT id FROM entities WHERE id = :id"), {"id": node_id}
        )).fetchone()
        if exists is None:
            return None

        # 2-hop neighbours via CTE
        subgraph_rows = (await session.execute(text("""
            WITH hop1 AS (
                SELECT to_entity_id   AS id FROM entity_relations WHERE from_entity_id = :id
                UNION
                SELECT from_entity_id AS id FROM entity_relations WHERE to_entity_id   = :id
            ),
            hop2 AS (
                SELECT er.to_entity_id   AS id
                FROM entity_relations er JOIN hop1 ON er.from_entity_id = hop1.id
                UNION
                SELECT er.from_entity_id AS id
                FROM entity_relations er JOIN hop1 ON er.to_entity_id   = hop1.id
            ),
            all_ids AS (
                SELECT :id::varchar AS id
                UNION SELECT id FROM hop1
                UNION SELECT id FROM hop2
            )
            SELECT DISTINCT
                e.id, e.title, e.type, et.color,
                e.summary, e.source_url, e.source_label,
                (
                    SELECT COUNT(*) FROM entity_relations er2
                    WHERE er2.from_entity_id = e.id OR er2.to_entity_id = e.id
                ) AS relation_count
            FROM entities e
            JOIN all_ids ai ON ai.id = e.id
            LEFT JOIN entity_types et ON et.name = e.type
        """), {"id": node_id})).mappings().all()

        subgraph_ids = [str(r["id"]) for r in subgraph_rows]

        if len(subgraph_ids) > 1:
            edge_rows = (await session.execute(text("""
                SELECT id, from_entity_id, to_entity_id, relation_type, weight
                FROM entity_relations
                WHERE from_entity_id = ANY(:ids) AND to_entity_id = ANY(:ids)
            """), {"ids": subgraph_ids})).mappings().all()
        else:
            edge_rows = []

    nodes = [
        GraphNode(
            id=str(r["id"]),
            label=r["title"] or "",
            type=r["type"] or "Unknown",
            color=_resolve_color(r["type"] or "", r["color"]),
            summary=r["summary"],
            sourceUrl=r["source_url"] or "",
            sourceLabel=r["source_label"],
            relationCount=int(r["relation_count"] or 0),
        )
        for r in subgraph_rows
    ]
    edges = [
        GraphEdge(
            id=r["id"],
            source=str(r["from_entity_id"]),
            target=str(r["to_entity_id"]),
            relationType=r["relation_type"],
            weight=float(r["weight"] or 1.0),
        )
        for r in edge_rows
    ]
    return SubgraphResponse(nodes=nodes, edges=edges)


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
