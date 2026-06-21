/** Graham scan convex hull — returns hull vertices in counter-clockwise order. */
export function convexHull(
  points: { x: number; y: number }[]
): { x: number; y: number }[] {
  if (points.length < 3) return points;

  const sorted = [...points].sort(
    (a, b) => a.x - b.x || a.y - b.y
  );

  const cross = (
    O: { x: number; y: number },
    A: { x: number; y: number },
    B: { x: number; y: number }
  ) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);

  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }

  const upper: { x: number; y: number }[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Expand hull outward by `padding` pixels for a nice visual margin. */
export function expandHull(
  hull: { x: number; y: number }[],
  padding: number
): { x: number; y: number }[] {
  if (hull.length === 0) return hull;
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
  });
}
