import { test, expect } from "@playwright/test";

test.describe("Booking Page — E2E", () => {
  test("navigates to booking page from nav", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Book Session/i }).first().click();
    await expect(page).toHaveURL("/book");
    await expect(page.getByText("Book a")).toBeVisible();
  });

  test("shows step progress indicators", async ({ page }) => {
    await page.goto("/book");
    await expect(page.getByText("Date")).toBeVisible();
    await expect(page.getByText("Time")).toBeVisible();
    await expect(page.getByText("Details")).toBeVisible();
  });

  test("calendar renders with navigation buttons", async ({ page }) => {
    await page.goto("/book");
    const calendar = page.locator("[data-testid='calendar-date-picker']");
    await expect(calendar).toBeVisible();
    await expect(page.locator(".rdp-nav button").first()).toBeVisible();
  });

  test("selecting a date reveals time slots", async ({ page }) => {
    await page.goto("/book");
    // Click first available (non-disabled) weekday button
    const dayButtons = page.locator(".rdp-day button:not([disabled])");
    const count = await dayButtons.count();
    if (count > 0) {
      await dayButtons.first().click();
      // Time slots panel should appear
      await expect(page.getByText(/Step 2/i)).toBeVisible();
    }
  });

  test("form is disabled until date and time are selected", async ({ page }) => {
    await page.goto("/book");
    const form = page.locator('[data-testid="button-submit-booking"]');
    await expect(form).toBeDisabled();
  });

  test("form validates email format", async ({ page }) => {
    await page.goto("/book");
    // Select date first
    const dayButtons = page.locator(".rdp-day button:not([disabled])");
    const count = await dayButtons.count();
    if (count < 1) return;
    await dayButtons.first().click();

    // Select time slot
    const timeBtn = page.locator('[data-testid^="btn-time-"]').first();
    if (await timeBtn.count() > 0) await timeBtn.click();

    // Fill invalid email
    await page.fill('[data-testid="input-name"]', "Jane");
    await page.fill('[data-testid="input-email"]', "not-an-email");
    await page.click('[data-testid="button-submit-booking"]');
    await expect(page.getByText(/valid email/i)).toBeVisible();
  });

  test("full booking submission shows confirmation screen", async ({ page }) => {
    await page.goto("/book");

    // Step 1: select first available weekday
    const dayButtons = page.locator(".rdp-day button:not([disabled])");
    await expect(dayButtons.first()).toBeVisible({ timeout: 10000 });
    await dayButtons.first().click();

    // Step 2: select first available time slot
    const timeBtn = page.locator('[data-testid^="btn-time-"]').first();
    await expect(timeBtn).toBeVisible({ timeout: 5000 });
    await timeBtn.click();

    // Step 3: fill in the details form
    await page.fill('[data-testid="input-name"]', "Jane Smith");
    await page.fill('[data-testid="input-email"]', "jane.smith@example.com");
    await page.fill('[data-testid="input-company"]', "Acme Corp");

    // Open the Radix UI meeting-type select and pick the first option
    await page.click('[data-testid="select-meeting-type"]');
    await page.getByRole("option", { name: "Technical Discovery Call" }).click();

    await page.fill('[data-testid="input-details"]', "We need help migrating our monolith to microservices and improving CI/CD pipelines.");

    // Submit the form
    await page.click('[data-testid="button-submit-booking"]');

    // Confirm success screen appears
    await expect(page.getByRole("heading", { name: /Session Confirmed/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/jane\.smith@example\.com/i)).toBeVisible();
  });
});

test.describe("Home Page — E2E", () => {
  test("hero section loads with simulation controls", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Resilient/i)).toBeVisible();
    await expect(page.getByText("Start Traffic")).toBeVisible();
  });

  test("project showcase loads with tab navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#portfolio", { timeout: 10000 });
    // seed-e2e.ts ensures at least 2 published projects exist before E2E runs
    const tabs = page.locator("[data-testid^='tab-project-']");
    await expect(tabs.first()).toBeVisible({ timeout: 10000 });
    await tabs.first().click();
    // Detail panel should be visible after selecting a tab
    await expect(page.locator("#portfolio")).toBeVisible();
  });

  test("load balancer simulation runs", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Start Traffic").click();
    await page.waitForTimeout(1500);
    await expect(page.getByText("Stop Traffic")).toBeVisible();
    await page.getByText("Stop Traffic").click();
  });
});