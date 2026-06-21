import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchClusters, fetchEdges, fetchNodes, fetchSubgraph } from "./api";
import GraphCanvas from "./components/GraphCanvas";
import DetailDrawer from "./components/DetailDrawer";
import SearchBar from "./components/SearchBar";
import ColorLegend from "./components/ColorLegend";
import type {
  ClustersMap,
  GraphData,
  GraphNode,
  GraphNodeDetail,
} from "./types";

const INITIAL_LIMIT = 100;

export default function App() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNodeDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [clusterMode, setClusterMode] = useState(false);
  const [clusters, setClusters] = useState<ClustersMap>({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const graphRef = useRef<any>(null);

  const load = useCallback(async (s: string, t: string | null, off: number, replace: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const nodesRes = await fetchNodes(s || undefined, t || undefined, INITIAL_LIMIT, off);
      const ids = nodesRes.nodes.map((n) => n.id);
      const edgesRes = await fetchEdges(ids);

      const links = edgesRes.edges.map((e) => ({ ...e }));

      setGraphData((prev) => {
        if (replace) {
          return { nodes: nodesRes.nodes, links };
        }
        const existingIds = new Set(prev.nodes.map((n) => n.id));
        const newNodes = nodesRes.nodes.filter((n) => !existingIds.has(n.id));
        return { nodes: [...prev.nodes, ...newNodes], links };
      });

      setTotal(nodesRes.total);

      // Collect unique entity types for filter
      const types = [...new Set(nodesRes.nodes.map((n) => n.type))].sort();
      if (replace) setEntityTypes(types);

    } catch (e: any) {
      setError(e.message ?? "Failed to load graph data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(search, typeFilter, 0, true);
    setOffset(0);
  }, [search, typeFilter]);

  const loadMore = useCallback(() => {
    const nextOffset = offset + INITIAL_LIMIT;
    setOffset(nextOffset);
    load(search, typeFilter, nextOffset, false);
  }, [offset, search, typeFilter, load]);

  const handleNodeClick = useCallback(async (node: GraphNode) => {
    try {
      const { fetchNodeDetail } = await import("./api");
      const detail = await fetchNodeDetail(node.id);
      setSelectedNode(detail);
      setDrawerOpen(true);
    } catch {
      // ignore
    }
  }, []);

  const handleNeighborClick = useCallback(async (neighborId: string) => {
    try {
      const subgraph = await fetchSubgraph(neighborId);
      const ids = subgraph.nodes.map((n) => n.id);

      setGraphData((prev) => {
        const existingIds = new Set(prev.nodes.map((n) => n.id));
        const newNodes = subgraph.nodes.filter((n) => !existingIds.has(n.id));
        const allNodes = [...prev.nodes, ...newNodes];
        const allIds = new Set(allNodes.map((n) => n.id));
        const newLinks = subgraph.edges
          .map((e) => ({ ...e }))
          .filter((e) => allIds.has(String((e.source as any)?.id ?? e.source)) && allIds.has(String((e.target as any)?.id ?? e.target)));
        return { nodes: allNodes, links: [...prev.links, ...newLinks] };
      });

      const { fetchNodeDetail } = await import("./api");
      const detail = await fetchNodeDetail(neighborId);
      setSelectedNode(detail);

      // Center on neighbor
      const targetNode = graphData.nodes.find((n) => n.id === neighborId);
      if (targetNode && graphRef.current) {
        graphRef.current.centerAt(targetNode.x, targetNode.y, 800);
        graphRef.current.zoom(3, 800);
      }
    } catch {
      // ignore
    }
  }, [graphData.nodes]);

  const handleToggleCluster = useCallback(async () => {
    if (!clusterMode) {
      try {
        const res = await fetchClusters();
        setClusters(res.clusters);
      } catch {
        // ignore
      }
    }
    setClusterMode((prev) => !prev);
  }, [clusterMode]);

  const handleFitScreen = useCallback(() => {
    graphRef.current?.zoomToFit(400, 40);
  }, []);

  const hasMore = offset + INITIAL_LIMIT < total;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f0f18" }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        background: "rgba(17,17,30,0.95)", borderBottom: "1px solid #1e1e3f",
        zIndex: 10, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
          <span style={{ fontSize: 20 }}>🕸️</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#c4b5fd", letterSpacing: "0.02em" }}>
            NexusGraph
          </span>
        </div>

        <SearchBar value={search} onChange={setSearch} />

        <select
          data-testid="select-type-filter"
          value={typeFilter ?? ""}
          onChange={(e) => setTypeFilter(e.target.value || null)}
          style={{
            background: "#1a1a2e", color: "#a5b4fc", border: "1px solid #2e2e4f",
            borderRadius: 6, padding: "6px 10px", fontSize: 13, cursor: "pointer",
          }}
        >
          <option value="">All types</option>
          {entityTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <button
          data-testid="button-toggle-cluster"
          onClick={handleToggleCluster}
          style={{
            background: clusterMode ? "#4f46e5" : "#1a1a2e",
            color: clusterMode ? "#fff" : "#a5b4fc",
            border: "1px solid #2e2e4f", borderRadius: 6,
            padding: "6px 14px", fontSize: 13, cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {clusterMode ? "✦ Clusters On" : "◈ Clusters"}
        </button>

        <button
          data-testid="button-fit-screen"
          onClick={handleFitScreen}
          style={{
            background: "#1a1a2e", color: "#a5b4fc",
            border: "1px solid #2e2e4f", borderRadius: 6,
            padding: "6px 14px", fontSize: 13, cursor: "pointer",
          }}
        >
          ⊕ Fit
        </button>

        {hasMore && !loading && (
          <button
            data-testid="button-load-more"
            onClick={loadMore}
            style={{
              background: "#1a1a2e", color: "#34d399",
              border: "1px solid #1f4f3f", borderRadius: 6,
              padding: "6px 14px", fontSize: 13, cursor: "pointer",
            }}
          >
            +{Math.min(INITIAL_LIMIT, total - offset - INITIAL_LIMIT)} more
          </button>
        )}

        <div style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>
          {graphData.nodes.length} nodes · {graphData.links.length} edges
          {total > graphData.nodes.length && ` (${total} total)`}
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {error && (
          <div style={{
            position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
            background: "#7f1d1d", color: "#fca5a5", padding: "10px 20px",
            borderRadius: 8, zIndex: 20, fontSize: 13,
          }}>
            ⚠ {error}
          </div>
        )}

        {loading && graphData.nodes.length === 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 12, color: "#6366f1",
          }}>
            <div style={{ fontSize: 40, animation: "spin 1.5s linear infinite" }}>⧖</div>
            <div style={{ fontSize: 14, color: "#a5b4fc" }}>Loading knowledge graph…</div>
          </div>
        )}

        <GraphCanvas
          graphRef={graphRef}
          graphData={graphData}
          search={search}
          clusterMode={clusterMode}
          clusters={clusters}
          onNodeClick={handleNodeClick}
        />

        <ColorLegend entityTypes={entityTypes} nodes={graphData.nodes} />
      </div>

      {/* ── Detail drawer ── */}
      <DetailDrawer
        node={selectedNode}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNeighborClick={handleNeighborClick}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
