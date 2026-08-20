export interface GraphNode {
  id: string;
  label: string;
  type: string;
  color: string;
  summary?: string;
  sourceUrl: string;
  sourceLabel?: string;
  relationCount: number;
  // runtime positional fields injected by react-force-graph-2d
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  id: number;
  source: string | GraphNode;
  target: string | GraphNode;
  relationType: string;
  weight: number;
}

export interface NeighborNode {
  id: string;
  label: string;
  type: string;
  color: string;
  relationType: string;
  weight: number;
}

export interface GraphNodeDetail extends GraphNode {
  confidence?: number;
  trendScore: number;
  scrapedAt?: string;
  neighbors: NeighborNode[];
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[];
}

export interface ClustersMap {
  [nodeId: string]: number;
}

export interface NodesResponse {
  nodes: GraphNode[];
  total: number;
  limit: number;
  offset: number;
}

export interface EdgesResponse {
  edges: GraphEdge[];
}

export interface ClustersResponse {
  clusters: ClustersMap;
  clusterCount: number;
  cachedUntil?: string;
  algorithm: string;
}

export interface SubgraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
