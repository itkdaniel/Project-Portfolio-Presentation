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


class GraphLimits(BaseModel):
    """The server-enforced bounds applied to a graph response."""

    maxDepth: int | None = None
    degreeLimit: int | None = None
    nodeLimit: int | None = None
    edgeLimit: int | None = None


class GraphNodeDetail(GraphNode):
    confidence: float | None = None
    trendScore: float = 0.0
    scrapedAt: str | None = None
    neighbors: list[NeighborNode] = Field(default_factory=list)
    neighborsTruncated: bool = False


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
    returned: int = 0
    hasMore: bool = False
    nextOffset: int | None = None
    truncated: bool = False


class EdgesResponse(BaseModel):
    edges: list[GraphEdge]
    returned: int = 0
    truncated: bool = False
    edgeLimit: int | None = None


class ClustersResponse(BaseModel):
    clusters: dict[str, int]
    clusterCount: int
    cachedUntil: str | None = None
    algorithm: str = "louvain"
    nodeCount: int = 0
    edgeCount: int = 0
    truncated: bool = False
    limits: GraphLimits = Field(default_factory=GraphLimits)


class ClusterSummary(BaseModel):
    id: int
    nodeCount: int
    representativeId: str | None = None


class SubgraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    rootId: str | None = None
    depth: int = 1
    returnedNodeCount: int = 0
    returnedEdgeCount: int = 0
    truncated: bool = False
    displayMode: str = "nodes"
    clusters: dict[str, int] = Field(default_factory=dict)
    clusterSummaries: list[ClusterSummary] = Field(default_factory=list)
    canExpand: bool = False
    nextDepth: int | None = None
    limits: GraphLimits = Field(default_factory=GraphLimits)


class CreateRelationRequest(BaseModel):
    fromEntityId: str = Field(..., description="Source entity UUID")
    toEntityId: str = Field(..., description="Target entity UUID")
    relationType: str = Field(default="related_to")
    weight: float = Field(default=1.0, ge=0.0, le=10.0)


GraphNodeDetail.model_rebuild()
