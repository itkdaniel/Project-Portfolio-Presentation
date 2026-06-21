from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from app import graph_engine as engine
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


@router.get("/nodes", response_model=NodesResponse, summary="List entity nodes")
async def list_nodes(
    search: str | None = Query(None, description="Filter nodes by label (case-insensitive)"),
    type: str | None = Query(None, description="Filter by entity type"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> NodesResponse:
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
    return await engine.get_edges(id_list)


@router.get("/clusters", response_model=ClustersResponse, summary="Louvain community detection (10 min cache)")
async def get_clusters() -> ClustersResponse:
    return await engine.get_clusters()


@router.get("/subgraph/{node_id}", response_model=SubgraphResponse, summary="Ego-graph radius 2 around a node")
async def get_subgraph(node_id: str) -> SubgraphResponse:
    subgraph = await engine.get_subgraph(node_id)
    if subgraph is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": f"Entity '{node_id}' not found"})
    return subgraph


@router.post("/relations", response_model=GraphEdge, status_code=201, summary="Create a manual relation (admin)")
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
