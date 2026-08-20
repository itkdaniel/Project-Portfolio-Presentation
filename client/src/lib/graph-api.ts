/**
 * Main-platform NexusGraph client.
 *
 * Keep this module on the Express gateway path. Browsers must not know the
 * graph service address or port.
 */
export const GRAPH_PROXY = "/api/apps/graph/proxy/v1/graph";

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  color: string;
  summary?: string | null;
  sourceUrl: string;
  sourceLabel?: string | null;
  relationCount: number;
}

export interface GraphEdge {
  id: number;
  source: string;
  target: string;
  relationType: string;
  weight: number;
}

export interface NeighborNode extends GraphNode {
  relationType: string;
  weight: number;
}

export interface GraphNodeDetail extends GraphNode {
  confidence?: number | null;
  trendScore: number;
  scrapedAt?: string | null;
  neighbors: NeighborNode[];
  neighborsTruncated: boolean;
}

export interface NodesResponse {
  nodes: GraphNode[];
  total: number;
  limit: number;
  offset: number;
  returned: number;
  hasMore: boolean;
  nextOffset?: number | null;
  truncated: boolean;
}

export interface FocusedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootId?: string | null;
  depth: number;
  returnedNodeCount: number;
  returnedEdgeCount: number;
  truncated: boolean;
  displayMode: "nodes" | "cluster-summary";
  clusters: Record<string, number>;
  clusterSummaries: Array<{ id: number; nodeCount: number; representativeId?: string | null }>;
  canExpand: boolean;
  nextDepth?: number | null;
  limits: {
    maxDepth?: number | null;
    degreeLimit?: number | null;
    nodeLimit?: number | null;
    edgeLimit?: number | null;
  };
}

async function graphRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${GRAPH_PROXY}${path}`, { signal });
  if (response.ok) return response.json() as Promise<T>;

  let message = `The knowledge graph is unavailable (HTTP ${response.status}).`;
  try {
    const body = await response.json();
    message = body?.detail?.message || body?.message || message;
  } catch {
    // Keep the safe status-based message when an upstream returns no JSON.
  }
  throw new Error(message);
}

export function searchGraphNodes(
  search: string,
  type: string | null,
  signal?: AbortSignal,
): Promise<NodesResponse> {
  const params = new URLSearchParams({ limit: "50", offset: "0" });
  if (search.trim()) params.set("search", search.trim());
  if (type) params.set("type", type);
  return graphRequest<NodesResponse>(`/nodes?${params.toString()}`, signal);
}

export function fetchFocusedGraph(
  nodeId: string,
  depth = 1,
  signal?: AbortSignal,
): Promise<FocusedGraph> {
  return graphRequest<FocusedGraph>(
    `/subgraph/${encodeURIComponent(nodeId)}?depth=${depth}`,
    signal,
  );
}

export function fetchGraphNodeDetail(nodeId: string, signal?: AbortSignal): Promise<GraphNodeDetail> {
  return graphRequest<GraphNodeDetail>(`/nodes/${encodeURIComponent(nodeId)}`, signal);
}