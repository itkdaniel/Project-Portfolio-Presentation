import { test, expect } from "@playwright/test";

test.describe("Quantum Page — E2E", () => {
  test("navigates to /quantum and page renders", async ({ page }) => {
    await page.goto("/quantum");
    await expect(page.locator("h1")).toContainText("Nexus Quantum");
  });

  test("all four tabs are visible", async ({ page }) => {
    await page.goto("/quantum");
    await expect(page.getByTestId("tab-quantum-jobs")).toBeVisible();
    await expect(page.getByTestId("tab-quantum-simulate")).toBeVisible();
    await expect(page.getByTestId("tab-quantum-optimize")).toBeVisible();
    await expect(page.getByTestId("tab-quantum-circuits")).toBeVisible();
  });

  test("Jobs tab is active by default and renders job form", async ({ page }) => {
    await page.goto("/quantum");
    await expect(page.getByTestId("tab-panel-jobs")).toBeVisible();
    await expect(page.getByTestId("select-job-type")).toBeVisible();
    await expect(page.getByTestId("select-backend")).toBeVisible();
    await expect(page.getByTestId("textarea-job-payload")).toBeVisible();
    await expect(page.getByTestId("btn-submit-job")).toBeVisible();
  });

  test("Simulate tab renders OpenQASM editor and preset buttons", async ({ page }) => {
    await page.goto("/quantum");
    await page.getByTestId("tab-quantum-simulate").click();
    await expect(page.getByTestId("tab-panel-simulate")).toBeVisible();
    await expect(page.getByTestId("textarea-qasm")).toBeVisible();
    await expect(page.getByTestId("btn-run-simulation")).toBeVisible();
    await expect(page.getByTestId("btn-preset-bell-state")).toBeVisible();
  });

  test("Optimize tab renders sub-panel selectors", async ({ page }) => {
    await page.goto("/quantum");
    await page.getByTestId("tab-quantum-optimize").click();
    await expect(page.getByTestId("tab-panel-optimize")).toBeVisible();
    await expect(page.getByTestId("btn-optimize-panel-portfolio")).toBeVisible();
    await expect(page.getByTestId("btn-optimize-panel-route")).toBeVisible();
    await expect(page.getByTestId("btn-optimize-panel-constraint")).toBeVisible();
  });

  test("Optimize tab switches between sub-panels", async ({ page }) => {
    await page.goto("/quantum");
    await page.getByTestId("tab-quantum-optimize").click();

    await expect(page.getByTestId("optimize-portfolio")).toBeVisible();

    await page.getByTestId("btn-optimize-panel-route").click();
    await expect(page.getByTestId("optimize-route")).toBeVisible();
    await expect(page.getByTestId("optimize-portfolio")).not.toBeVisible();

    await page.getByTestId("btn-optimize-panel-constraint").click();
    await expect(page.getByTestId("optimize-constraint")).toBeVisible();
    await expect(page.getByTestId("optimize-route")).not.toBeVisible();
  });

  test("Circuits tab renders save form and library", async ({ page }) => {
    await page.goto("/quantum");
    await page.getByTestId("tab-quantum-circuits").click();
    await expect(page.getByTestId("tab-panel-circuits")).toBeVisible();
    await expect(page.getByTestId("input-circuit-name")).toBeVisible();
    await expect(page.getByTestId("textarea-circuit-qasm")).toBeVisible();
    await expect(page.getByTestId("btn-save-circuit")).toBeVisible();
  });

  test("offline banner appears when service is unavailable", async ({ page }) => {
    await page.goto("/quantum");
    // The quantum service will not be running in the E2E test environment,
    // so the amber banner should appear.
    await expect(page.getByTestId("banner-service-offline")).toBeVisible({ timeout: 8000 });
  });

  test("submit buttons are disabled when service is offline", async ({ page }) => {
    await page.goto("/quantum");
    await expect(page.getByTestId("btn-submit-job")).toBeDisabled({ timeout: 8000 });
  });

  test("Simulate tab: submit button is disabled when service is offline", async ({ page }) => {
    await page.goto("/quantum");
    await page.getByTestId("tab-quantum-simulate").click();
    await expect(page.getByTestId("btn-run-simulation")).toBeDisabled({ timeout: 8000 });
  });

  test("preset circuit loads QASM into editor", async ({ page }) => {
    await page.goto("/quantum");
    await page.getByTestId("tab-quantum-simulate").click();
    // Click the GHZ preset — its QASM starts with "// GHZ State"
    await page.getByTestId("btn-preset-ghz-state-(3-qubit)").click();
    const qasm = await page.getByTestId("textarea-qasm").inputValue();
    expect(qasm).toContain("GHZ");
    // Also verify the 3-qubit structure is present
    expect(qasm).toContain("qubit[3]");
  });

  test("quantum service status indicator is visible", async ({ page }) => {
    await page.goto("/quantum");
    await expect(page.getByTestId("quantum-service-status")).toBeVisible();
  });

  test("Circuits tab: Save button is disabled when name or QASM is empty", async ({ page }) => {
    await page.goto("/quantum");
    await page.getByTestId("tab-quantum-circuits").click();
    // Initially both fields are empty, so save should be disabled
    await expect(page.getByTestId("btn-save-circuit")).toBeDisabled();
  });

  test("job form submits and polling starts when service is mocked online", async ({ page }) => {
    const mockJob = {
      job_id: "mock-job-abc123",
      job_type: "simulation",
      backend: "local_simulator",
      status: "queued",
      created_at: new Date().toISOString(),
    };

    // Mock the health check to return healthy
    await page.route("**/api/apps/quantum", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "healthy", name: "quantum", port: 8200 }),
      });
    });

    // Mock GET /v1/quantum/jobs to return the job list (initially empty, then with the job)
    let jobSubmitted = false;
    await page.route("**/api/apps/quantum/proxy/v1/quantum/jobs", async (route) => {
      if (route.request().method() === "POST") {
        jobSubmitted = true;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(mockJob),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(jobSubmitted ? [mockJob] : []),
        });
      }
    });

    await page.goto("/quantum");

    // Offline banner should NOT be visible once health mock resolves
    await expect(page.getByTestId("banner-service-offline")).not.toBeVisible({ timeout: 5000 });

    // Submit button should be enabled
    const submitBtn = page.getByTestId("btn-submit-job");
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });

    // Submit the job form
    await submitBtn.click();

    // Polling refetch every 3 s — job list should show the submitted job
    await expect(page.getByTestId("jobs-list")).toBeVisible({ timeout: 10000 });
    // The mocked job row should appear
    await expect(page.locator(`[data-testid="job-row-${mockJob.job_id}"]`)).toBeVisible({ timeout: 6000 });
    // Status badge should show "Queued"
    await expect(page.getByTestId("badge-status-queued")).toBeVisible();
  });
});
