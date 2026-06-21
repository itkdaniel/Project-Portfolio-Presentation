from __future__ import annotations

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    color: str = "#6366f1"
    summary: str | None = None
    sourceUrl: str
    sourceLabel: str | None = None
    relationCount: int = 0


class GraphNodeDetail(GraphNode):
    confidence: float | None = None
    trendScore: float = 0.0
    scrapedAt: str | None = None
    neighbors: list[NeighborNode] = []


class NeighborNode(BaseModel):
    id: str
    label: str
    type: str
    color: str = "#6366f1"
    relationType: str
    weight: float = 1.0


class GraphEdge(BaseModel):
    id: int
    source: str
    target: str
    relationType: str
    weight: float = 1.0


class NodesResponse(BaseModel):
    nodes: list[GraphNode]
    total: int
    limit: int
    offset: int


class EdgesResponse(BaseModel):
    edges: list[GraphEdge]


class ClustersResponse(BaseModel):
    clusters: dict[str, int]
    clusterCount: int
    cachedUntil: str | None = None
    algorithm: str = "louvain"


class SubgraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class CreateRelationRequest(BaseModel):
    fromEntityId: str = Field(..., description="Source entity UUID")
    toEntityId: str = Field(..., description="Target entity UUID")
    relationType: str = Field(default="related_to")
    weight: float = Field(default=1.0, ge=0.0, le=10.0)


GraphNodeDetail.model_rebuild()
