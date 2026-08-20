import type { GraphNode } from "./types";

const LAYOUT_STORAGE_PREFIX = "nexus-graph:layout:v1";

interface SavedGraphPosition {
  id: string;
  x: number;
  y: number;
}

/**
 * Keep layouts separate for each graph query so a saved position from one
 * search/filter result cannot move an unrelated result set.
 */
export function getLayoutStorageKey(search: string, typeFilter: string | null): string {
  return `${LAYOUT_STORAGE_PREFIX}:${JSON.stringify({
    search,
    type: typeFilter ?? "",
  })}`;
}

function isFinitePosition(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Apply saved positions as fixed coordinates before force-graph receives the
 * nodes. Storage is intentionally best-effort: disabled, full, or malformed
 * browser storage should never prevent the graph from loading.
 */
export function restoreGraphLayout(nodes: GraphNode[], storageKey: string): GraphNode[] {
  if (typeof window === "undefined") return nodes;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return nodes;

    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return nodes;

    const positions = new Map(
      saved
        .filter(
          (position): position is SavedGraphPosition =>
            position !== null &&
            typeof position === "object" &&
            typeof (position as SavedGraphPosition).id === "string" &&
            isFinitePosition((position as SavedGraphPosition).x) &&
            isFinitePosition((position as SavedGraphPosition).y),
        )
        .map((position) => [position.id, position] as const),
    );

    return nodes.map((node) => {
      const position = positions.get(node.id);
      if (!position) return node;
      return {
        ...node,
        x: position.x,
        y: position.y,
        fx: position.x,
        fy: position.y,
      };
    });
  } catch {
    return nodes;
  }
}

export function saveGraphLayout(nodes: GraphNode[], storageKey: string): void {
  if (typeof window === "undefined") return;

  const positions: SavedGraphPosition[] = nodes
    .filter((node) => isFinitePosition(node.x) && isFinitePosition(node.y))
    .map((node) => ({ id: node.id, x: node.x as number, y: node.y as number }));

  if (positions.length === 0) return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(positions));
  } catch {
    // Browser storage is optional and must not break graph interactions.
  }
}
