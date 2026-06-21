import React, { useCallback, useEffect, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { convexHull, expandHull } from "../convexHull";
import type { ClustersMap, GraphData, GraphNode } from "../types";

// Stable cluster colors
const CLUSTER_PALETTE = [
  "rgba(99,102,241,0.18)",   // indigo
  "rgba(16,185,129,0.18)",   // green
  "rgba(245,158,11,0.18)",   // amber
  "rgba(239,68,68,0.18)",    // red
  "rgba(59,130,246,0.18)",   // blue
  "rgba(236,72,153,0.18)",   // pink
  "rgba(6,182,212,0.18)",    // cyan
  "rgba(139,92,246,0.18)",   // violet
  "rgba(249,115,22,0.18)",   // orange
  "rgba(20,184,166,0.18)",   // teal
];
const CLUSTER_STROKE = [
  "rgba(99,102,241,0.55)",
  "rgba(16,185,129,0.55)",
  "rgba(245,158,11,0.55)",
  "rgba(239,68,68,0.55)",
  "rgba(59,130,246,0.55)",
  "rgba(236,72,153,0.55)",
  "rgba(6,182,212,0.55)",
  "rgba(139,92,246,0.55)",
  "rgba(249,115,22,0.55)",
  "rgba(20,184,166,0.55)",
];

interface Props {
  graphRef: React.MutableRefObject<any>;
  graphData: GraphData;
  search: string;
  clusterMode: boolean;
  clusters: ClustersMap;
  onNodeClick: (node: GraphNode) => void;
}

export default function GraphCanvas({
  graphRef,
  graphData,
  search,
  clusterMode,
  clusters,
  onNodeClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = React.useState({ w: 800, h: 600 });

  useEffect(() => {
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const drawNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const label = n.label;
      const radius = Math.max(4, Math.min(12, 4 + Math.sqrt(n.relationCount || 0)));
      const isMatch = search && label.toLowerCase().includes(search.toLowerCase());
      const isDim = search && !isMatch;

      ctx.globalAlpha = isDim ? 0.2 : 1.0;

      // Glow for matches
      if (isMatch) {
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 12;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = n.color;
      ctx.fill();

      // Ring on match
      if (isMatch) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;

      // Label (only at sufficient zoom)
      if (globalScale > 1.5) {
        const fontSize = Math.max(6, 10 / globalScale);
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isDim ? "#4a5568" : "#e2e8f0";
        ctx.fillText(
          label.length > 20 ? label.slice(0, 18) + "…" : label,
          node.x,
          node.y + radius + 2 / globalScale
        );
      }

      ctx.globalAlpha = 1.0;
    },
    [search]
  );

  const drawClusterOverlays = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!clusterMode || Object.keys(clusters).length === 0) return;

      // Group node positions by cluster
      const clusterPoints: Record<number, { x: number; y: number; label: string; relationCount: number }[]> = {};
      for (const node of graphData.nodes as any[]) {
        const cid = clusters[node.id];
        if (cid === undefined || node.x == null || node.y == null) continue;
        if (!clusterPoints[cid]) clusterPoints[cid] = [];
        clusterPoints[cid].push({ x: node.x, y: node.y, label: node.label, relationCount: node.relationCount ?? 0 });
      }

      for (const [cidStr, points] of Object.entries(clusterPoints)) {
        const cid = Number(cidStr);
        if (points.length < 2) continue;

        const hull = expandHull(convexHull(points), 18);
        if (hull.length < 3) continue;

        const fill = CLUSTER_PALETTE[cid % CLUSTER_PALETTE.length];
        const stroke = CLUSTER_STROKE[cid % CLUSTER_STROKE.length];

        ctx.beginPath();
        ctx.moveTo(hull[0].x, hull[0].y);
        for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cluster label at centroid — use the most-connected node's label
        const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
        const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
        const repr = [...points].sort((a, b) => b.relationCount - a.relationCount)[0];
        const clusterLabel = repr.label.length > 18 ? repr.label.slice(0, 16) + "…" : repr.label;
        ctx.font = "bold 9px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = stroke.replace("0.55", "0.9");
        ctx.fillText(clusterLabel, cx, cy);
      }
    },
    [clusterMode, clusters, graphData.nodes]
  );

  return (
    <div
      ref={containerRef}
      data-testid="graph-canvas-container"
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    >
      <ForceGraph2D
        ref={graphRef}
        width={dims.w}
        height={dims.h}
        graphData={graphData as any}
        nodeId="id"
        nodeLabel={(n: any) => (n as GraphNode).label}
        nodeVal={(n: any) => Math.max(1, Math.sqrt((n as GraphNode).relationCount || 1))}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => "replace"}
        linkColor={() => "rgba(99,102,241,0.3)"}
        linkWidth={1}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        onNodeClick={(node: any) => onNodeClick(node as GraphNode)}
        onRenderFramePost={drawClusterOverlays}
        backgroundColor="#0f0f18"
        cooldownTicks={120}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />
    </div>
  );
}
