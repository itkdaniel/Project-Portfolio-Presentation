import { test, expect } from "@playwright/test";

const root = {
  id: "root",
  label: "Nexus Root",
  type: "Technology",
  color: "#22d3ee",
  sourceUrl: "https://example.test/root",
  relationCount: 1,
};
const child = {
  id: "child",
  label: "Related Entity",
  type: "Concept",
  color: "#a78bfa",
  sourceUrl: "https://example.test/child",
  relationCount: 1,
};

function detail(node: typeof root | typeof child, neighbors: Array<typeof root | typeof child>) {
  return { ...node, trendScore: 0, confidence: null, neighbors: neighbors.map((neighbor) => ({
    ...neighbor, relationType: "related_to", weight: 1,
  })), neighborsTruncated: false };
}

test.describe("Graph explorer — gateway interaction", () => {
  test("searches through the gateway and refocuses from a related entity", async ({ page }) => {
    const calls: string[] = [];
    await page.route("**/api/apps/graph/proxy/v1/graph/**", async (route) => {
      const url = route.request().url();
      calls.push(url);
      if (url.includes("/nodes?")) return route.fulfill({ json: {
        nodes: [root, child], total: 2, limit: 50, offset: 0, returned: 2, hasMore: false, truncated: false,
      } });
      if (url.includes("/subgraph/root")) return route.fulfill({ json: {
        nodes: [root, child], edges: [{ id: 1, source: "root", target: "child", relationType: "related_to", weight: 1 }],
        rootId: "root", depth: 1, returnedNodeCount: 2, returnedEdgeCount: 1, truncated: false,
        displayMode: "nodes", clusters: {}, clusterSummaries: [], canExpand: true, nextDepth: 2, limits: { maxDepth: 2 },
      } });
      if (url.includes("/subgraph/child")) return route.fulfill({ json: {
        nodes: [child, root], edges: [{ id: 1, source: "child", target: "root", relationType: "related_to", weight: 1 }],
        rootId: "child", depth: 1, returnedNodeCount: 2, returnedEdgeCount: 1, truncated: false,
        displayMode: "nodes", clusters: {}, clusterSummaries: [], canExpand: true, nextDepth: 2, limits: { maxDepth: 2 },
      } });
      if (url.includes("/nodes/root")) return route.fulfill({ json: detail(root, [child]) });
      return route.fulfill({ json: detail(child, [root]) });
    });

    await page.goto("/graph");
    await expect(page.getByTestId("graph-result-root")).toBeVisible();
    await page.getByTestId("graph-result-root").click();
    await expect(page.getByTestId("graph-detail-panel")).toContainText("Nexus Root");
    await page.getByTestId("graph-refocus-child").click();
    await expect(page.getByTestId("graph-detail-panel")).toContainText("Related Entity");
    expect(calls.length).toBeGreaterThan(3);
    expect(calls.every((url) => url.includes("/api/apps/graph/proxy/"))).toBe(true);
  });

  test("renders cluster summaries as community controls", async ({ page }) => {
    await page.route("**/api/apps/graph/proxy/v1/graph/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/nodes?")) return route.fulfill({ json: {
        nodes: [root, child], total: 2, limit: 50, offset: 0, returned: 2, hasMore: false, truncated: false,
      } });
      if (url.includes("/subgraph/root")) return route.fulfill({ json: {
        nodes: [root, child], edges: [{ id: 1, source: "root", target: "child", relationType: "related_to", weight: 1 }],
        rootId: "root", depth: 1, returnedNodeCount: 2, returnedEdgeCount: 1, truncated: true,
        displayMode: "cluster-summary", clusters: { root: 0, child: 0 },
        clusterSummaries: [{ id: 0, nodeCount: 2, representativeId: "root" }],
        canExpand: true, nextDepth: 2, limits: { maxDepth: 2, nodeLimit: 1, edgeLimit: 1 },
      } });
      if (url.includes("/nodes/child")) return route.fulfill({ json: detail(child, [root]) });
      return route.fulfill({ json: detail(root, [child]) });
    });

    await page.goto("/graph");
    await page.getByTestId("graph-result-root").click();
    await expect(page.getByTestId("graph-community-0")).toBeVisible();
    await page.getByTestId("graph-community-0").click();
    await expect(page.getByTestId("graph-detail-panel")).toContainText("Nexus Root");
  });

  test("does not apply a delayed node detail after a newer focus", async ({ page }) => {
    await page.route("**/api/apps/graph/proxy/v1/graph/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/nodes?")) return route.fulfill({ json: {
        nodes: [root, child], total: 2, limit: 50, offset: 0, returned: 2, hasMore: false, truncated: false,
      } });
      if (url.includes("/subgraph/")) return route.fulfill({ json: {
        nodes: [root, child], edges: [{ id: 1, source: "root", target: "child", relationType: "related_to", weight: 1 }],
        rootId: "root", depth: 1, returnedNodeCount: 2, returnedEdgeCount: 1, truncated: false,
        displayMode: "nodes", clusters: {}, clusterSummaries: [], canExpand: true, nextDepth: 2, limits: { maxDepth: 2 },
      } });
      if (url.includes("/nodes/child")) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return route.fulfill({ json: detail(child, [root]) });
      }
      return route.fulfill({ json: detail(root, [child]) });
    });

    await page.goto("/graph");
    await page.getByTestId("graph-result-root").click();
    await expect(page.getByTestId("graph-detail-panel")).toContainText("Nexus Root");
    await page.getByTestId("graph-node-child").click();
    await page.getByTestId("graph-result-root").click();
    await expect(page.getByTestId("graph-detail-panel")).toContainText("Nexus Root");
    await page.waitForTimeout(650);
    await expect(page.getByTestId("graph-detail-panel")).toContainText("Nexus Root");
  });
});