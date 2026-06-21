import React, { useState } from "react";
import type { GraphNode } from "../types";

const TYPE_COLORS: Record<string, string> = {
  Person:       "#f59e0b",
  Organization: "#3b82f6",
  Technology:   "#8b5cf6",
  Concept:      "#06b6d4",
  Event:        "#ef4444",
  Location:     "#10b981",
  Product:      "#f97316",
  Article:      "#6366f1",
  Repository:   "#14b8a6",
  Dataset:      "#ec4899",
};

interface Props {
  entityTypes: string[];
  nodes: GraphNode[];
}

export default function ColorLegend({ entityTypes, nodes }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  if (entityTypes.length === 0) return null;

  const countByType: Record<string, number> = {};
  for (const n of nodes) countByType[n.type] = (countByType[n.type] ?? 0) + 1;

  return (
    <div
      data-testid="color-legend"
      style={{
        position: "absolute", bottom: 16, left: 16,
        background: "rgba(13,13,26,0.92)", backdropFilter: "blur(10px)",
        border: "1px solid #1e1e3f", borderRadius: 8,
        padding: collapsed ? "8px 12px" : "12px 14px",
        maxWidth: 200, zIndex: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", userSelect: "none",
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.05em" }}>
          ENTITY TYPES
        </span>
        <span style={{ color: "#64748b", fontSize: 12, marginLeft: 8 }}>
          {collapsed ? "▲" : "▼"}
        </span>
      </div>

      {!collapsed && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {entityTypes.map((type) => {
            const color = nodes.find((n) => n.type === type)?.color ?? TYPE_COLORS[type] ?? "#6366f1";
            const count = countByType[type] ?? 0;
            return (
              <div key={type} data-testid={`legend-item-${type}`} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: color, flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: "#94a3b8", flex: 1 }}>{type}</span>
                <span style={{ fontSize: 11, color: "#475569" }}>{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
