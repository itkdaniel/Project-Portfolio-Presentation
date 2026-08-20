from __future__ import annotations

import os

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app import graph_engine as engine
from app.config import get_settings
from app.models.graph import (
    ClustersResponse,
    CreateRelationRequest,
    EdgesResponse,
    GraphEdge,
    GraphNodeDetail,
    NodesResponse,
    SubgraphResponse,
)

router = APIRouter(prefix="/v1/graph", tags=["graph"])


def require_admin_token(x_admin_token: str | None = Header(default=None)) -> None:
    """Enforce admin token when NEXUS_GRAPH_ADMIN_TOKEN is configured.

    Read directly from os.environ on every request so that tests using
    monkeypatch.setenv / patch.dict(os.environ) see the correct value without
    fighting the lru_cache on get_settings().

    When the env var is not set (or empty), auth is not enforced — suitable for
    local development only.  In production set NEXUS_GRAPH_ADMIN_TOKEN to a
    secret value and pass it as the ``X-Admin-Token`` request header.
    """
    configured_token = os.environ.get("NEXUS_GRAPH_ADMIN_TOKEN", "")
    if not configured_token:
        return
    if not x_admin_token:
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "message": "X-Admin-Token header is required"},
        )
    if x_admin_token != configured_token:
        raise HTTPException(
            status_code=403,
            detail={"error": "forbidden", "message": "Invalid admin token"},
        )


@router.get("/nodes", response_model=NodesResponse, summary="List entity nodes")
async def list_nodes(
    search: str | None = Query(None, description="Filter nodes by label (case-insensitive)"),
    type: str | None = Query(None, description="Filter by entity type"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> NodesResponse:
    settings = get_settings()
    if limit > settings.graph_max_search_limit:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "limit_exceeded",
                "message": f"limit cannot exceed {settings.graph_max_search_limit}",
            },
        )
    return await engine.get_nodes(search=search, type_filter=type, limit=limit, offset=offset)


@router.get("/nodes/{node_id}", response_model=GraphNodeDetail, summary="Single node detail")
async def get_node(node_id: str) -> GraphNodeDetail:
    node = await engine.get_node_detail(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": f"Entity '{node_id}' not found"})
    return node


@router.get("/edges", response_model=EdgesResponse, summary="Edges between given node IDs")
async def list_edges(
    ids: str = Query(..., description="Comma-separated entity IDs, e.g. ?ids=uuid1,uuid2,uuid3"),
) -> EdgesResponse:
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    if not id_list:
        raise HTTPException(status_code=400, detail={"error": "bad_request", "message": "ids parameter is required"})
    max_ids = get_settings().graph_max_edge_ids
    if len(id_list) > max_ids:
        raise HTTPException(
            status_code=422,
            detail={"error": "limit_exceeded", "message": f"ids cannot contain more than {max_ids} entities"},
        )
    return await engine.get_edges(id_list)


@router.get("/clusters", response_model=ClustersResponse, summary="Bounded Louvain community detection")
async def get_clusters() -> ClustersResponse:
    return await engine.get_clusters()


@router.get("/subgraph/{node_id}", response_model=SubgraphResponse, summary="Bounded focused graph around an entity")
async def get_subgraph(
    node_id: str,
    depth: int = Query(1, ge=1, le=2, description="Traversal depth; use the nextDepth response to expand"),
    degree_limit: int | None = Query(None, ge=1, le=100, description="Maximum relationships examined per node"),
    node_limit: int | None = Query(None, ge=1, le=500, description="Maximum nodes returned"),
    edge_limit: int | None = Query(None, ge=1, le=1000, description="Maximum directed edges returned"),
) -> SubgraphResponse:
    settings = get_settings()
    requested = (
        (depth, settings.graph_max_subgraph_depth, "depth"),
        (degree_limit, settings.graph_max_subgraph_degree, "degree_limit"),
        (node_limit, settings.graph_max_subgraph_nodes, "node_limit"),
        (edge_limit, settings.graph_max_subgraph_edges, "edge_limit"),
    )
    for value, maximum, name in requested:
        if value is not None and value > maximum:
            raise HTTPException(
                status_code=422,
                detail={"error": "limit_exceeded", "message": f"{name} cannot exceed {maximum}"},
            )
    subgraph = await engine.get_subgraph(
        node_id,
        depth=depth,
        degree_limit=degree_limit,
        node_limit=node_limit,
        edge_limit=edge_limit,
    )
    if subgraph is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": f"Entity '{node_id}' not found"})
    return subgraph


@router.post(
    "/relations",
    response_model=GraphEdge,
    status_code=201,
    summary="Create a manual relation (admin)",
    dependencies=[Depends(require_admin_token)],
)
async def create_relation(body: CreateRelationRequest) -> GraphEdge:
    if body.fromEntityId == body.toEntityId:
        raise HTTPException(status_code=400, detail={"error": "bad_request", "message": "fromEntityId and toEntityId must differ"})
    try:
        return await engine.create_relation(
            from_entity_id=body.fromEntityId,
            to_entity_id=body.toEntityId,
            relation_type=body.relationType,
            weight=body.weight,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": str(exc)})
