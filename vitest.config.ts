import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", ".cache/**", "dist/**"],

    reporters: [
      "verbose",
      ["json", { outputFile: "test-results/unit-results.json" }],
    ],

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "test-results/coverage",
      include: ["server/**/*.ts", "shared/**/*.ts"],
      exclude: [
        "server/vite.ts",
        "server/static.ts",
        "server/index.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        lines:      60,
        functions:  60,
        branches:   50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client/src"),
    },
  },
});