import { test, expect } from "@playwright/test";

const QUANTUM_STATIC_ENDPOINTS = [
  { method: "GET",  path: "/v1/quantum/health",    description: "Health check" },
  { method: "GET",  path: "/v1/quantum/jobs",      description: "List jobs" },
  { method: "POST", path: "/v1/quantum/jobs",      description: "Submit a quantum job" },
  { method: "GET",  path: "/v1/quantum/jobs/{id}", description: "Get job by ID" },
  { method: "POST", path: "/v1/quantum/simulate",  description: "Run simulation" },
];

test.describe("Docs — Nexus Quantum section", () => {
  test.beforeEach(async ({ page }) => {
    // Return a registry health response with static endpoints so the offline
    // banner and endpoint rows render deterministically in every test.
    await page.route("**/api/apps/quantum", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "quantum",
          port: 8200,
          status: "unhealthy",
          endpoints: QUANTUM_STATIC_ENDPOINTS,
        }),
      });
    });

    // Prevent the OpenAPI spec from resolving so liveEndpoints stays empty
    // and the offline-banner / static fallback branch is exercised.
    await page.route("**/api/apps/quantum/openapi", async (route) => {
      await route.fulfill({ status: 503 });
    });

    await page.goto("/docs");
  });

  // ── 1. Navigation ────────────────────────────────────────────────────────────

  test("navigates to /docs and sidebar renders", async ({ page }) => {
    await expect(page).toHaveURL(/\/docs/);
    await expect(page.getByTestId("sidebar-nexus-quantum")).toBeVisible();
  });

  test("clicking 'Nexus Quantum' in the sidebar activates it", async ({ page }) => {
    await page.getByTestId("sidebar-nexus-quantum").click();
    // The sidebar item becomes active (bg-primary/10 class applied) — verify
    // it has aria-pressed-like presence and the main content updates.
    await expect(page.getByTestId("docs-main-content")).toBeVisible();
  });

  // ── 2. Heading and port badge ────────────────────────────────────────────────

  test("section heading shows 'Nexus Quantum'", async ({ page }) => {
    await page.getByTestId("sidebar-nexus-quantum").click();
    const heading = page.getByTestId("docs-main-content").locator("h2").first();
    await expect(heading).toContainText("Nexus Quantum");
  });

  test("port badge 8200 is visible in the sidebar item", async ({ page }) => {
    // The badge is rendered inside the SidebarItem as a span with the port number.
    const sidebarBtn = page.getByTestId("sidebar-nexus-quantum");
    await expect(sidebarBtn).toContainText("8200");
  });

  test("port 8200 is visible in the sub-app section header", async ({ page }) => {
    await page.getByTestId("sidebar-nexus-quantum").click();
    const content = page.getByTestId("docs-main-content");
    await expect(content.locator("code").filter({ hasText: "8200" }).first()).toBeVisible();
  });

  // ── 3. Offline banner ────────────────────────────────────────────────────────

  test("offline banner appears when service is unhealthy", async ({ page }) => {
    await page.getByTestId("sidebar-nexus-quantum").click();
    const banner = page
      .getByTestId("docs-main-content")
      .locator("p", { hasText: "Service offline" });
    await expect(banner).toBeVisible({ timeout: 8000 });
    await expect(banner).toContainText("showing static endpoint list from registry");
  });

  test("offline banner matches the same pattern as other offline services", async ({ page }) => {
    // Verify a different sub-app (Nexus Scraper) shows the same banner pattern.
    await page.route("**/api/apps/scraper", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          name: "scraper",
          port: 8005,
          status: "unhealthy",
          endpoints: [{ method: "GET", path: "/v1/scrape", description: "Scrape URL" }],
        }),
      });
    });
    await page.route("**/api/apps/scraper/openapi", async (route) => {
      await route.fulfill({ status: 503 });
    });

    // Check scraper offline banner
    await page.getByTestId("sidebar-nexus-scraper").click();
    const scraperBanner = page
      .getByTestId("docs-main-content")
      .locator("p", { hasText: "Service offline" });
    await expect(scraperBanner).toBeVisible({ timeout: 8000 });

    // Switch back to quantum and verify the same pattern
    await page.getByTestId("sidebar-nexus-quantum").click();
    const quantumBanner = page
      .getByTestId("docs-main-content")
      .locator("p", { hasText: "Service offline" });
    await expect(quantumBanner).toBeVisible({ timeout: 8000 });
    await expect(quantumBanner).toContainText("Try-it sandbox will connect when the service starts");
  });

  // ── 4. Expand POST /v1/quantum/jobs → Try It panel ──────────────────────────

  test("POST /v1/quantum/jobs endpoint row is present", async ({ page }) => {
    await page.getByTestId("sidebar-nexus-quantum").click();
    // testid format: endpoint-{METHOD}-{path with / replaced by -}
    const row = page.getByTestId("endpoint-POST--v1-quantum-jobs");
    await expect(row).toBeVisible({ timeout: 8000 });
  });

  test("expanding POST /v1/quantum/jobs reveals the Try It panel with Send Request button", async ({ page }) => {
    await page.getByTestId("sidebar-nexus-quantum").click();

    const row = page.getByTestId("endpoint-POST--v1-quantum-jobs");
    await expect(row).toBeVisible({ timeout: 8000 });

    // Click the row button to expand
    await row.locator("button").click();

    // The TryItPanel renders a "Send Request" button with data-testid="btn-send"
    const sendBtn = row.locator('[data-testid="btn-send"]');
    await expect(sendBtn).toBeVisible();
    await expect(sendBtn).toContainText("Send Request");
  });

  test("Try It panel body textarea is shown for POST endpoints", async ({ page }) => {
    await page.getByTestId("sidebar-nexus-quantum").click();

    const row = page.getByTestId("endpoint-POST--v1-quantum-jobs");
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.locator("button").click();

    // POST endpoints expose a body textarea
    const bodyInput = row.locator('[data-testid="input-body"]');
    await expect(bodyInput).toBeVisible();
  });

  // ── 5. Proxy prefix ──────────────────────────────────────────────────────────

  test("proxy prefix /api/apps/quantum/proxy is shown in the section header", async ({ page }) => {
    await page.getByTestId("sidebar-nexus-quantum").click();
    const content = page.getByTestId("docs-main-content");
    // The SubAppSection renders:  Proxy via <code>/api/apps/quantum/proxy/*</code>
    await expect(
      content.locator("code", { hasText: "/api/apps/quantum/proxy" }).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("Send Request in expanded row uses /api/apps/quantum/proxy as the proxy prefix", async ({ page }) => {
    // Intercept the fetch that the Send Request button triggers and verify the URL.
    let capturedUrl: string | null = null;
    await page.route("**/api/apps/quantum/proxy/**", async (route) => {
      capturedUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.getByTestId("sidebar-nexus-quantum").click();

    const row = page.getByTestId("endpoint-POST--v1-quantum-jobs");
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.locator("button").click();

    await row.locator('[data-testid="btn-send"]').click();

    // Wait briefly for the fetch to fire
    await page.waitForTimeout(500);
    expect(capturedUrl).not.toBeNull();
    expect(capturedUrl).toContain("/api/apps/quantum/proxy");
  });
});
