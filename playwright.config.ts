import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/e2e-results.json" }],
  ],

  use: {
    baseURL: "http://localhost:5000",
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
    actionTimeout: 10000,
    navigationTimeout: 20000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:5000",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});