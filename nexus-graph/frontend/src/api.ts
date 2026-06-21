import type {
  ClustersResponse,
  EdgesResponse,
  GraphNodeDetail,
  NodesResponse,
  SubgraphResponse,
} from "./types";

const BASE = "";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchNodes(
  search?: string,
  type?: string,
  limit = 100,
  offset = 0
): Promise<NodesResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search) params.set("search", search);
  if (type) params.set("type", type);
  return fetchJson(`/v1/graph/nodes?${params}`);
}

export async function fetchNodeDetail(id: string): Promise<GraphNodeDetail> {
  return fetchJson(`/v1/graph/nodes/${encodeURIComponent(id)}`);
}

export async function fetchEdges(ids: string[]): Promise<EdgesResponse> {
  if (!ids.length) return { edges: [] };
  return fetchJson(`/v1/graph/edges?ids=${ids.map(encodeURIComponent).join(",")}`);
}

export async function fetchClusters(): Promise<ClustersResponse> {
  return fetchJson("/v1/graph/clusters");
}

export async function fetchSubgraph(id: string): Promise<SubgraphResponse> {
  return fetchJson(`/v1/graph/subgraph/${encodeURIComponent(id)}`);
}
