import React from "react";
import type { GraphNodeDetail } from "../types";

interface Props {
  node: GraphNodeDetail | null;
  open: boolean;
  onClose: () => void;
  onNeighborClick: (id: string) => void;
}

const TYPE_BG: Record<string, string> = {
  Person:       "rgba(245,158,11,0.15)",
  Organization: "rgba(59,130,246,0.15)",
  Technology:   "rgba(139,92,246,0.15)",
  Concept:      "rgba(6,182,212,0.15)",
  Event:        "rgba(239,68,68,0.15)",
  Location:     "rgba(16,185,129,0.15)",
  Product:      "rgba(249,115,22,0.15)",
  Article:      "rgba(99,102,241,0.15)",
  Repository:   "rgba(20,184,166,0.15)",
  Dataset:      "rgba(236,72,153,0.15)",
};

export default function DetailDrawer({ node, open, onClose, onNeighborClick }: Props) {
  if (!open || !node) return null;

  const typeBg = TYPE_BG[node.type] ?? "rgba(99,102,241,0.15)";

  return (
    <div
      data-testid="detail-drawer"
      style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: 340,
        background: "rgba(13,13,26,0.97)", backdropFilter: "blur(12px)",
        borderLeft: "1px solid #1e1e3f", display: "flex", flexDirection: "column",
        zIndex: 50, boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
        animation: "slideIn 0.2s ease-out",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "16px 16px 12px", borderBottom: "1px solid #1e1e3f",
        display: "flex", alignItems: "flex-start", gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            display: "inline-block", padding: "2px 8px", borderRadius: 4,
            background: typeBg, color: node.color, fontSize: 11,
            fontWeight: 600, letterSpacing: "0.05em", marginBottom: 6,
            textTransform: "uppercase",
          }}>
            {node.type}
          </div>
          <div data-testid="text-node-title" style={{
            fontSize: 15, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.4,
          }}>
            {node.label}
          </div>
        </div>
        <button
          data-testid="button-close-drawer"
          onClick={onClose}
          style={{
            background: "transparent", border: "none", color: "#64748b",
            fontSize: 18, cursor: "pointer", padding: "2px 6px", lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {node.summary && (
          <div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>SUMMARY</div>
            <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{node.summary}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Stat label="Relations" value={String(node.relationCount)} />
          {node.confidence != null && (
            <Stat label="Confidence" value={`${(node.confidence * 100).toFixed(0)}%`} />
          )}
          {node.trendScore > 0 && (
            <Stat label="Trend" value={node.trendScore.toFixed(1)} />
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>SOURCE</div>
          <a
            data-testid="link-source-url"
            href={node.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#6366f1", fontSize: 12, textDecoration: "none",
              wordBreak: "break-all", lineHeight: 1.5,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            {node.sourceLabel ? `${node.sourceLabel} — ` : ""}{node.sourceUrl}
          </a>
        </div>

        {node.scrapedAt && (
          <div style={{ fontSize: 11, color: "#475569" }}>
            Scraped {new Date(node.scrapedAt).toLocaleDateString()}
          </div>
        )}

        {node.neighbors.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 8 }}>
              CONNECTIONS ({node.neighbors.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {node.neighbors.map((n) => (
                <button
                  key={n.id}
                  data-testid={`button-neighbor-${n.id}`}
                  onClick={() => onNeighborClick(n.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e3f",
                    borderRadius: 6, padding: "7px 10px", cursor: "pointer",
                    textAlign: "left", transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.12)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: n.color, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, fontSize: 12, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.label}
                  </span>
                  <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>
                    {n.relationType}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", borderRadius: 6,
      padding: "6px 10px", textAlign: "center",
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#a5b4fc" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{label}</div>
    </div>
  );
}
