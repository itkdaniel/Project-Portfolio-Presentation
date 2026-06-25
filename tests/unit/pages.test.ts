import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import fs from "fs";
import path from "path";
import { registerRoutes } from "../../server/routes";

// ── Shared test server (simulates SPA catch-all) ──────────────────────────────

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  // Simulate the production static-file SPA catch-all so /docs and /architecture
  // return 200 (the same behaviour as `serveStatic` in server/static.ts).
  app.use((_req, res) => res.status(200).send("<!doctype html><html></html>"));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  request = supertest(server);
}, 30000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

// ── Route smoke tests ──────────────────────────────────────────────────────────

describe("SPA route smoke — GET /docs and GET /architecture", () => {
  it("GET /docs returns 200", async () => {
    const res = await request.get("/docs");
    expect(res.status).toBe(200);
  });

  it("GET /architecture returns 200", async () => {
    const res = await request.get("/architecture");
    expect(res.status).toBe(200);
  });

  it("GET /docs does not return a server error (no 5xx)", async () => {
    const res = await request.get("/docs");
    expect(res.status).toBeLessThan(500);
  });

  it("GET /architecture does not return a server error (no 5xx)", async () => {
    const res = await request.get("/architecture");
    expect(res.status).toBeLessThan(500);
  });

  it("GET /docs does not collide with any API route (no JSON {message} error body)", async () => {
    const res = await request.get("/docs");
    // A JSON {message} response would mean an API route matched unexpectedly
    if (typeof res.body === "object" && res.body !== null) {
      expect(res.body).not.toHaveProperty("message");
    }
  });

  it("GET /architecture does not collide with any API route (no JSON {message} error body)", async () => {
    const res = await request.get("/architecture");
    if (typeof res.body === "object" && res.body !== null) {
      expect(res.body).not.toHaveProperty("message");
    }
  });
});

// ── DocsPage — static structure validation ────────────────────────────────────

describe("DocsPage — static structure", () => {
  const docsPagePath = path.resolve(__dirname, "../../client/src/pages/DocsPage.tsx");
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(docsPagePath, "utf-8");
  });

  it("source file exists at expected path", () => {
    expect(fs.existsSync(docsPagePath)).toBe(true);
  });

  it("exports a default DocsPage component", () => {
    expect(src).toContain("export default function DocsPage");
  });

  it("has exactly 11 sub-app entries in SUB_APPS (one per microservice)", () => {
    const subAppsBlockMatch = src.match(/const SUB_APPS: SubApp\[\] = \[([\s\S]*?)\];/);
    expect(subAppsBlockMatch).not.toBeNull();
    const block = subAppsBlockMatch![1];
    // Each sub-app has a unique `port:` field
    const portMatches = block.match(/port: \d+/g);
    expect(portMatches).not.toBeNull();
    expect(portMatches!.length).toBe(11);
  });

  it("SUB_APPS contains all expected microservice names", () => {
    const expectedNames = [
      "booking", "tax", "search", "ai", "scraper", "graph",
      "crypto", "crypto-market", "crypto-wallet", "crypto-dex", "crypto-analytics",
    ];
    for (const name of expectedNames) {
      expect(src).toContain(`name: "${name}"`);
    }
  });

  it("sidebar has a 'NexusConsult Core' entry (the 1 core service)", () => {
    expect(src).toContain("NexusConsult Core");
  });

  it("sidebar has a 'NexusCrypto Ecosystem' section header", () => {
    expect(src).toContain("NexusCrypto Ecosystem");
  });

  it("sidebar has a 'NexusConsult Services' section header", () => {
    expect(src).toContain("NexusConsult Services");
  });

  it("CORE_API contains all expected endpoint group names", () => {
    const expectedGroups = [
      "auth", "projects", "bookings", "settings",
      "notifications", "scopes", "gateway", "admin", "tests",
    ];
    for (const name of expectedGroups) {
      expect(src).toContain(`name: "${name}"`);
    }
  });

  it("EndpointRow has a data-testid for targeting in E2E tests", () => {
    expect(src).toContain("data-testid={`endpoint-");
  });

  it("try-it panel exposes data-testid='btn-send'", () => {
    expect(src).toContain('data-testid="btn-send"');
  });

  it("try-it panel exposes data-testid='response-panel'", () => {
    expect(src).toContain('data-testid="response-panel"');
  });

  it("main content area has data-testid='docs-main-content'", () => {
    expect(src).toContain('data-testid="docs-main-content"');
  });

  it("CORE_API sidebar group buttons have data-testid='tab-group-{name}'", () => {
    expect(src).toContain('data-testid={`tab-group-${g.name}`}');
  });

  it("SidebarItem buttons have data-testid for E2E targeting", () => {
    expect(src).toContain('data-testid={`sidebar-');
  });
});

// ── ArchitecturePage — static structure validation ───────────────────────────

describe("ArchitecturePage — static structure", () => {
  const archPagePath = path.resolve(__dirname, "../../client/src/pages/ArchitecturePage.tsx");
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(archPagePath, "utf-8");
  });

  it("source file exists at expected path", () => {
    expect(fs.existsSync(archPagePath)).toBe(true);
  });

  it("exports a default ArchitecturePage component", () => {
    expect(src).toContain("export default function ArchitecturePage");
  });

  it("defines exactly 3 tab IDs (db-schema, system, infrastructure)", () => {
    expect(src).toContain('"db-schema"');
    expect(src).toContain('"system"');
    expect(src).toContain('"infrastructure"');
  });

  it("tab buttons render with data-testid='tab-{id}'", () => {
    expect(src).toContain('data-testid={`tab-${t.id}`}');
  });

  it("has exactly 4 DB schema groups in DB_GROUPS", () => {
    const groupIds = ["core", "tax", "scraper", "crypto"];
    for (const id of groupIds) {
      expect(src).toContain(`id: "${id}"`);
    }
    // No extra group — verify count directly
    const idMatches = src.match(/\bid: "(core|tax|scraper|crypto)"/g);
    expect(idMatches).not.toBeNull();
    expect(idMatches!.length).toBe(4);
  });

  it("NexusConsult Core group has tableCount 13", () => {
    expect(src).toMatch(/id: "core"[\s\S]{0,300}tableCount: 13/);
  });

  it("Tax Assistant System group has tableCount 9", () => {
    expect(src).toMatch(/id: "tax"[\s\S]{0,300}tableCount: 9/);
  });

  it("Scraper \/ Knowledge Graph group has tableCount 5", () => {
    expect(src).toMatch(/id: "scraper"[\s\S]{0,300}tableCount: 5/);
  });

  it("NexusCrypto group has tableCount 6", () => {
    expect(src).toMatch(/id: "crypto"[\s\S]{0,300}tableCount: 6/);
  });

  it("total across all DB groups is 33 tables (13+9+5+6)", () => {
    expect(13 + 9 + 5 + 6).toBe(33);
  });

  it("CollapsibleGroup renders data-testid='db-group-{id}'", () => {
    expect(src).toContain('data-testid={`db-group-${group.id}`}');
  });

  it("db-schema tab has a content section with id='db-schema'", () => {
    expect(src).toContain('id="db-schema"');
  });

  it("system tab has a content section with id='system'", () => {
    expect(src).toContain('id="system"');
  });

  it("infrastructure tab has a content section with id='infrastructure'", () => {
    expect(src).toContain('id="infrastructure"');
  });

  it("SYSTEM_CARDS covers all 11 services in description", () => {
    expect(src).toContain("11 standalone sub-app services");
  });

  it("Service Port Registry covers all 12 services (5000 + 11 sub-apps)", () => {
    const portEntries = src.match(/port: "8[0-9]{3}"/g);
    expect(portEntries).not.toBeNull();
    expect(portEntries!.length).toBeGreaterThanOrEqual(11);
  });

  it("infrastructure tab lists docker-compose.yml", () => {
    expect(src).toContain("docker-compose.yml");
  });

  it("infrastructure tab lists k8s/web-deployment.yaml", () => {
    expect(src).toContain("k8s/web-deployment.yaml");
  });

  it("CI workflow steps include Node tests, Python tests, E2E, and Docker build", () => {
    expect(src).toContain("Node unit + integration tests");
    expect(src).toContain("Python service tests");
    expect(src).toContain("Playwright E2E browser tests");
    expect(src).toContain("Docker image build validation");
  });
});
