/**
 * /graph — focused NexusGraph explorer served through the main platform.
 *
 * It intentionally talks only to the same-origin service-manager gateway.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Loader2,
  Minus,
  Network,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  fetchFocusedGraph,
  fetchGraphNodeDetail,
  searchGraphNodes,
  type FocusedGraph,
  type GraphNode,
  type GraphNodeDetail,
} from "@/lib/graph-api";

const EMPTY_GRAPH: FocusedGraph = {
  nodes: [],
  edges: [],
  depth: 1,
  returnedNodeCount: 0,
  returnedEdgeCount: 0,
  truncated: false,
  displayMode: "nodes",
  clusters: {},
  clusterSummaries: [],
  canExpand: false,
  limits: {},
};

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function CommunityMap({
  graph,
  scale,
  onRefocus,
}: {
  graph: FocusedGraph;
  scale: number;
  onRefocus: (node: GraphNode) => void;
}) {
  const communities = graph.clusterSummaries
    .map((summary) => ({ summary, representative: graph.nodes.find((node) => node.id === summary.representativeId) }))
    .filter((community): community is { summary: FocusedGraph["clusterSummaries"][number]; representative: GraphNode } => Boolean(community.representative));

  return (
    <div
      className="relative min-h-[430px] overflow-hidden rounded-xl border border-white/10 bg-slate-950/80"
      data-testid="graph-community-map"
      aria-label="Community summary of the focused relationship graph"
    >
      <div className="absolute inset-0 origin-center transition-transform duration-300" style={{ transform: `scale(${scale})` }}>
        {communities.map(({ summary, representative }, index) => {
          const angle = (index / Math.max(communities.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const x = 50 + Math.cos(angle) * 31;
          const y = 50 + Math.sin(angle) * 31;
          return (
            <button
              key={summary.id}
              type="button"
              onClick={() => onRefocus(representative)}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border border-cyan-300/45 bg-slate-900/95 px-4 py-3 text-left shadow-lg transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              style={{ left: `${x}%`, top: `${y}%`, borderColor: representative.color }}
              aria-label={`Explore community ${summary.id + 1} through ${representative.label}`}
              data-testid={`graph-community-${summary.id}`}
            >
              <span className="block text-sm font-semibold text-white">Community {summary.id + 1}</span>
              <span className="block text-xs text-cyan-100">{summary.nodeCount} entities</span>
              <span className="mt-1 block max-w-[150px] truncate text-xs text-white/55">Explore {representative.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FocusedMap({
  graph,
  scale,
  onInspect,
  onRefocus,
}: {
  graph: FocusedGraph;
  scale: number;
  onInspect: (node: GraphNode) => void;
  onRefocus: (node: GraphNode) => void;
}) {
  if (graph.displayMode === "cluster-summary") {
    return <CommunityMap graph={graph} scale={scale} onRefocus={onRefocus} />;
  }
  const root = graph.nodes.find((node) => node.id === graph.rootId) ?? graph.nodes[0];
  const others = graph.nodes.filter((node) => node.id !== root?.id);
  const positions = new Map<string, { x: number; y: number }>();
  if (root) positions.set(root.id, { x: 50, y: 50 });
  others.forEach((node, index) => {
    const angle = (index / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const ring = others.length > 16 ? 38 : 31;
    positions.set(node.id, { x: 50 + Math.cos(angle) * ring, y: 50 + Math.sin(angle) * ring });
  });

  return (
    <div
      className="relative min-h-[430px] overflow-hidden rounded-xl border border-white/10 bg-slate-950/80"
      data-testid="graph-focused-map"
      aria-label="Focused relationship graph"
    >
      {graph.nodes.length === 0 ? (
        <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-muted-foreground">
          Select an entity from the search results to view its relationships.
        </div>
      ) : (
        <div
          className="absolute inset-0 origin-center transition-transform duration-300"
          style={{ transform: `scale(${scale})` }}
        >
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {graph.edges.map((edge) => {
              const source = positions.get(edge.source);
              const target = positions.get(edge.target);
              if (!source || !target) return null;
              return (
                <line
                  key={edge.id}
                  x1={`${source.x}%`}
                  y1={`${source.y}%`}
                  x2={`${target.x}%`}
                  y2={`${target.y}%`}
                  stroke="rgba(103, 232, 249, 0.38)"
                  strokeWidth={Math.max(1, Math.min(3, edge.weight))}
                  markerEnd="url(#graph-arrow)"
                />
              );
            })}
            <defs>
              <marker id="graph-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <polygon points="0 0, 7 3.5, 0 7" fill="rgba(103, 232, 249, 0.65)" />
              </marker>
            </defs>
          </svg>
          {graph.nodes.map((node) => {
            const pos = positions.get(node.id)!;
            const isRoot = node.id === root?.id;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onInspect(node)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-left shadow-lg transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                  isRoot ? "border-cyan-200 bg-cyan-400/25" : "border-white/20 bg-slate-900/95"
                }`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, borderColor: isRoot ? node.color : undefined }}
                aria-label={`Inspect ${node.label}, ${node.type}`}
                data-testid={`graph-node-${node.id}`}
              >
                <span className="block max-w-[108px] truncate text-xs font-semibold text-white">{node.label}</span>
                <span className="block max-w-[108px] truncate text-[10px] text-white/55">{node.type}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  node,
  onClose,
  onRefocus,
}: {
  node: GraphNodeDetail | null;
  onClose: () => void;
  onRefocus: (node: GraphNode) => void;
}) {
  if (!node) return null;
  const sourceUrl = safeExternalUrl(node.sourceUrl);
  return (
    <aside
      className="rounded-xl border border-cyan-400/20 bg-slate-950/95 p-5 shadow-2xl"
      role="dialog"
      aria-modal="false"
      aria-labelledby="graph-detail-heading"
      data-testid="graph-detail-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge variant="outline" style={{ borderColor: node.color, color: node.color }}>{node.type}</Badge>
          <h2 id="graph-detail-heading" className="mt-2 text-lg font-semibold text-white">{node.label}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close entity details">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {node.summary && <p className="mt-4 text-sm leading-6 text-white/65">{node.summary}</p>}
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-white/5 p-3">
          <dt className="text-xs uppercase tracking-wide text-white/45">Relations</dt>
          <dd className="mt-1 font-semibold text-white">{node.relationCount}</dd>
        </div>
        <div className="rounded-lg bg-white/5 p-3">
          <dt className="text-xs uppercase tracking-wide text-white/45">Confidence</dt>
          <dd className="mt-1 font-semibold text-white">
            {node.confidence == null ? "Not scored" : `${Math.round(node.confidence * 100)}%`}
          </dd>
        </div>
      </dl>
      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Source</p>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 break-all text-sm text-cyan-300 hover:text-cyan-200"
          >
            {node.sourceLabel || node.sourceUrl}<ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : <p className="mt-1 text-sm text-white/55">No source information is available.</p>}
      </div>
      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/45">
          Related entities ({node.neighbors.length}{node.neighborsTruncated ? "+" : ""})
        </p>
        <div className="mt-2 space-y-2">
          {node.neighbors.map((neighbor) => (
            <button
              key={neighbor.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:border-cyan-300/50 hover:bg-cyan-400/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              onClick={() => onRefocus(neighbor)}
              data-testid={`graph-refocus-${neighbor.id}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">{neighbor.label}</span>
                <span className="block truncate text-xs text-white/45">{neighbor.relationType}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-cyan-300" />
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default function GraphPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [results, setResults] = useState<GraphNode[]>([]);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [graph, setGraph] = useState<FocusedGraph>(EMPTY_GRAPH);
  const [focusError, setFocusError] = useState<string | null>(null);
  const [focusing, setFocusing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GraphNodeDetail | null>(null);
  const [scale, setScale] = useState(1);
  const searchController = useRef<AbortController | null>(null);
  const focusController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);

  const types = useMemo(() => [...new Set(results.map((node) => node.type))].sort(), [results]);
  const selected = graph.nodes.find((node) => node.id === selectedId) || null;

  useEffect(() => {
    const controller = new AbortController();
    searchController.current?.abort();
    searchController.current = controller;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const response = await searchGraphNodes(search, type, controller.signal);
        setResults(response.nodes);
      } catch (error) {
        if (!isAbort(error)) {
          setResults([]);
          setSearchError(error instanceof Error ? error.message : "Unable to search the knowledge graph.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, type]);

  const inspect = useCallback(async (node: GraphNode) => {
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setSelectedId(node.id);
    try {
      const response = await fetchGraphNodeDetail(node.id, controller.signal);
      if (!controller.signal.aborted && detailController.current === controller) setDetail(response);
    } catch (error) {
      if (!isAbort(error) && detailController.current === controller) {
        setFocusError(error instanceof Error ? error.message : "Unable to load entity details.");
      }
    }
  }, []);

  const focus = useCallback(async (node: GraphNode, depth = 1) => {
    focusController.current?.abort();
    detailController.current?.abort();
    const controller = new AbortController();
    focusController.current = controller;
    setFocusing(true);
    setFocusError(null);
    setSelectedId(node.id);
    setDetail(null);
    setScale(1);
    try {
      const [focused, nodeDetail] = await Promise.all([
        fetchFocusedGraph(node.id, depth, controller.signal),
        fetchGraphNodeDetail(node.id, controller.signal),
      ]);
      if (!controller.signal.aborted) {
        setGraph(focused);
        setDetail(nodeDetail);
      }
    } catch (error) {
      if (!isAbort(error)) setFocusError(error instanceof Error ? error.message : "Unable to load this focused graph.");
    } finally {
      if (!controller.signal.aborted) setFocusing(false);
    }
  }, []);

  const refresh = useCallback(() => {
    if (selected) void focus(selected, graph.depth);
  }, [focus, graph.depth, selected]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pb-16 pt-28 md:px-6">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-cyan-300">
              <Network className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-[0.18em]">Nexus Graph</span>
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold text-white md:text-4xl">Entity relationships, in focus.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Search for an entity, then explore a bounded relationship graph through the platform gateway.
            </p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={!selected || focusing} data-testid="graph-refresh">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh focus
          </Button>
        </div>

        {(searchError || focusError) && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{searchError || focusError} The graph service may be offline; try again when it is healthy.</span>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)_340px]">
          <section className="rounded-xl border border-white/10 bg-card/40 p-4" aria-labelledby="graph-search-heading">
            <h2 id="graph-search-heading" className="font-semibold text-white">Find an entity</h2>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search entities"
                aria-label="Search knowledge graph entities"
                data-testid="graph-search-input"
              />
            </div>
            <select
              className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={type || ""}
              onChange={(event) => setType(event.target.value || null)}
              aria-label="Filter entities by type"
            >
              <option value="">All entity types</option>
              {types.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="mt-4 max-h-[500px] space-y-2 overflow-y-auto pr-1">
              {searching && <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching</div>}
              {!searching && results.length === 0 && !searchError && <p className="p-3 text-sm text-muted-foreground">No matching entities were found.</p>}
              {results.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => void focus(node)}
                  className={`w-full rounded-lg border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
                    node.id === selectedId ? "border-cyan-300/70 bg-cyan-400/10" : "border-white/10 hover:border-white/30 hover:bg-white/[0.03]"
                  }`}
                  data-testid={`graph-result-${node.id}`}
                >
                  <span className="block truncate text-sm font-medium text-white">{node.label}</span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{node.type}</span><span>{node.relationCount} relations</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="min-w-0 rounded-xl border border-white/10 bg-card/40 p-4" aria-live="polite">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">Focused graph</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {graph.nodes.length ? `${graph.returnedNodeCount} nodes · ${graph.returnedEdgeCount} directed relations · depth ${graph.depth}` : "Choose an entity to begin"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setScale((value) => Math.max(0.7, value - 0.15))} aria-label="Zoom out">
                  <Minus className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setScale((value) => Math.min(1.5, value + 0.15))} aria-label="Zoom in">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {focusing && <div className="absolute z-10 flex items-center gap-2 rounded-md bg-slate-950/80 px-3 py-2 text-sm text-cyan-100"><Loader2 className="h-4 w-4 animate-spin" /> Loading focus</div>}
            <FocusedMap
              graph={graph}
              scale={scale}
              onInspect={(node) => void inspect(node)}
              onRefocus={(node) => void focus(node)}
            />
            {(graph.truncated || graph.displayMode === "cluster-summary") && (
              <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-3 text-sm text-cyan-100">
                <strong>Summarized view.</strong> This focus is capped at {graph.limits.nodeLimit ?? "the configured"} nodes and {graph.limits.edgeLimit ?? "the configured"} relations.
                {graph.clusterSummaries.length > 0 && (
                  <span> Louvain detected {graph.clusterSummaries.length} communities in the displayed data.</span>
                )}
              </div>
            )}
            {graph.canExpand && selected && (
              <Button className="mt-4" variant="secondary" onClick={() => void focus(selected, graph.nextDepth || graph.depth + 1)} disabled={focusing}>
                Expand one more relationship hop
              </Button>
            )}
          </section>

          <DetailPanel node={detail} onClose={() => setDetail(null)} onRefocus={(node) => void focus(node)} />
        </div>
      </main>
      <Footer />
    </div>
  );
}