import { test, expect } from "@playwright/test";

// ── Docs Page ─────────────────────────────────────────────────────────────────

test.describe("Docs Page — E2E", () => {
  test("clicking 'Docs' in the navbar navigates to /docs", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-testid="nav-docs"]');
    await expect(page).toHaveURL("/docs");
  });

  test("/docs page loads with API Documentation heading", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByText("API Documentation")).toBeVisible();
  });

  test("sidebar shows the core 'NexusConsult Core' entry", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.locator('[data-testid="sidebar-nexusconsult-core"]')).toBeVisible();
  });

  test("sidebar shows all 11 sub-app entries (1 core + 11 = 12 total)", async ({ page }) => {
    await page.goto("/docs");
    const expectedLabels = [
      "Nexus Booking",
      "Nexus Tax",
      "Nexus Search",
      "Nexus AI",
      "Nexus Scraper",
      "Nexus Graph",
      "NexusCrypto",
      "Crypto Market",
      "Crypto Wallet",
      "Crypto DEX",
      "Crypto Analytics",
    ];
    for (const label of expectedLabels) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test("sidebar has 'NexusConsult Services' and 'NexusCrypto Ecosystem' section headers", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByText("NexusConsult Services")).toBeVisible();
    await expect(page.getByText("NexusCrypto Ecosystem")).toBeVisible();
  });

  test("clicking a sub-app sidebar item switches the main content", async ({ page }) => {
    await page.goto("/docs");
    await page.click('[data-testid="sidebar-nexus-booking"]');
    await expect(page.getByText("Nexus Booking").first()).toBeVisible();
    // Port info for booking service
    await expect(page.getByText("8003")).toBeVisible();
  });

  test("CORE_API group tabs are displayed and clickable", async ({ page }) => {
    await page.goto("/docs");
    // Auth tab is active by default
    await expect(page.locator('[data-testid="tab-group-auth"]')).toBeVisible();
    // Click the Projects tab
    await page.click('[data-testid="tab-group-projects"]');
    await expect(page.getByText("List published projects")).toBeVisible();
  });

  test("clicking an endpoint row expands the try-it panel", async ({ page }) => {
    await page.goto("/docs");
    // The first endpoint row in the auth group (POST /api/auth/login)
    const loginEndpoint = page.locator('[data-testid="endpoint-POST--api-auth-login"]');
    await expect(loginEndpoint).toBeVisible();
    await loginEndpoint.click();
    // The try-it send button should now be visible
    await expect(page.locator('[data-testid="btn-send"]')).toBeVisible();
  });

  test("clicking an expanded endpoint row again collapses the try-it panel", async ({ page }) => {
    await page.goto("/docs");
    const loginEndpoint = page.locator('[data-testid="endpoint-POST--api-auth-login"]');
    await loginEndpoint.click();
    await expect(page.locator('[data-testid="btn-send"]')).toBeVisible();
    // Click again to collapse
    await loginEndpoint.click();
    await expect(page.locator('[data-testid="btn-send"]')).not.toBeVisible();
  });

  test("try-it panel shows query string input and send button", async ({ page }) => {
    await page.goto("/docs");
    // Open an endpoint row
    await page.locator('[data-testid="endpoint-GET--api-projects"]').click();
    await expect(page.locator('[data-testid="input-querystring"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-send"]')).toBeVisible();
  });

  test("try-it panel for a POST endpoint shows request body editor", async ({ page }) => {
    await page.goto("/docs");
    await page.locator('[data-testid="endpoint-POST--api-auth-login"]').click();
    await expect(page.locator('[data-testid="input-body"]')).toBeVisible();
  });
});

// ── Architecture Page ─────────────────────────────────────────────────────────

test.describe("Architecture Page — E2E", () => {
  test("clicking 'Architecture' in the navbar navigates to /architecture", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-testid="nav-architecture"]');
    await expect(page).toHaveURL("/architecture");
  });

  test("/architecture page loads with Architecture heading", async ({ page }) => {
    await page.goto("/architecture");
    await expect(page.getByText("Architecture")).toBeVisible();
  });

  test("all 3 tabs are rendered on the architecture page", async ({ page }) => {
    await page.goto("/architecture");
    await expect(page.locator('[data-testid="tab-db-schema"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-system"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-infrastructure"]')).toBeVisible();
  });

  test("db-schema tab is active by default and shows DB group cards", async ({ page }) => {
    await page.goto("/architecture");
    await expect(page.locator('[data-testid="db-group-core"]')).toBeVisible();
  });

  test("DB group summary cards show correct table counts", async ({ page }) => {
    await page.goto("/architecture");
    // Summary stat cards are displayed at the top of the db-schema tab
    await expect(page.getByText("13").first()).toBeVisible();
    await expect(page.getByText("NexusConsult Core").first()).toBeVisible();
  });

  test("clicking 'System Architecture' tab switches content", async ({ page }) => {
    await page.goto("/architecture");
    await page.click('[data-testid="tab-system"]');
    await expect(page.getByText("System Architecture").first()).toBeVisible();
    await expect(page.getByText("Service Port Registry")).toBeVisible();
  });

  test("System Architecture tab shows all sub-app port entries", async ({ page }) => {
    await page.goto("/architecture");
    await page.click('[data-testid="tab-system"]');
    // Check a few port entries are visible
    await expect(page.getByText("Nexus AI").first()).toBeVisible();
    await expect(page.getByText("Nexus Search").first()).toBeVisible();
    await expect(page.getByText(":5000").first()).toBeVisible();
  });

  test("clicking 'Infrastructure' tab shows infrastructure content", async ({ page }) => {
    await page.goto("/architecture");
    await page.click('[data-testid="tab-infrastructure"]');
    await expect(page.getByText("Compose & K8s Files")).toBeVisible();
    await expect(page.getByText("GitHub Actions Workflows")).toBeVisible();
  });

  test("clicking a DB group header expands its content", async ({ page }) => {
    await page.goto("/architecture");
    // The first group (core) is open by default; click to collapse, then expand another
    const taxGroup = page.locator('[data-testid="db-group-tax"]');
    await taxGroup.click();
    await expect(taxGroup.getByText("Tax System Schema")).toBeVisible();
  });

  test("navigating directly to /architecture#system starts on system tab", async ({ page }) => {
    await page.goto("/architecture#system");
    await expect(page.locator('[data-testid="tab-system"]')).toBeVisible();
    await expect(page.getByText("Service Port Registry")).toBeVisible();
  });

  test("navigating directly to /architecture#infrastructure starts on infrastructure tab", async ({ page }) => {
    await page.goto("/architecture#infrastructure");
    await expect(page.locator('[data-testid="tab-infrastructure"]')).toBeVisible();
    await expect(page.getByText("Compose & K8s Files")).toBeVisible();
  });
});
