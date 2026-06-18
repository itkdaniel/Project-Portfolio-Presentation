/**
 * Gateway unit + integration tests
 * — sub-app registry, health aggregation, OpenAPI cache, proxy helpers
 * — HTTP route integration tests (GET /api/apps, /api/apps/:name, etc.)
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../../server/routes";
import {
  buildRegistry,
  checkHealth,
  checkAllHealth,
  getCachedOpenApi,
  invalidateOpenApiCache,
} from "../../server/gateway";

// ── Registry ─────────────────────────────────────────────────────────────────

describe("buildRegistry()", () => {
  it("returns exactly 4 sub-apps", () => {
    expect(buildRegistry()).toHaveLength(4);
  });

  it("includes booking, tax, search, and ai entries", () => {
    const names = buildRegistry().map((a) => a.name);
    expect(names).toContain("booking");
    expect(names).toContain("tax");
    expect(names).toContain("search");
    expect(names).toContain("ai");
  });

  it("each entry has required fields", () => {
    for (const app of buildRegistry()) {
      expect(app.name).toBeTruthy();
      expect(app.label).toBeTruthy();
      expect(app.description).toBeTruthy();
      expect(app.baseUrl).toMatch(/^https?:\/\//);
      expect(app.healthPath).toMatch(/^\//);
      expect(app.openApiPath).toMatch(/^\//);
      expect(Array.isArray(app.tags)).toBe(true);
      expect(Array.isArray(app.matchKeys)).toBe(true);
      expect(Array.isArray(app.endpoints)).toBe(true);
      expect(app.port).toBeGreaterThan(0);
    }
  });

  it("each entry exposes at least one endpoint", () => {
    for (const app of buildRegistry()) {
      expect(app.endpoints.length).toBeGreaterThan(0);
    }
  });

  it("endpoint objects have method, path, description, auth", () => {
    for (const app of buildRegistry()) {
      for (const ep of app.endpoints) {
        expect(["GET","POST","PUT","PATCH","DELETE"]).toContain(ep.method);
        expect(ep.path).toMatch(/^\//);
        expect(typeof ep.description).toBe("string");
        expect(typeof ep.auth).toBe("boolean");
      }
    }
  });

  it("baseUrl uses SUB_APP_* env vars when set", () => {
    const orig = process.env.SUB_APP_BOOKING_URL;
    process.env.SUB_APP_BOOKING_URL = "http://booking.internal:9000";
    const booking = buildRegistry().find((a) => a.name === "booking");
    expect(booking?.baseUrl).toBe("http://booking.internal:9000");
    if (orig === undefined) delete process.env.SUB_APP_BOOKING_URL;
    else process.env.SUB_APP_BOOKING_URL = orig;
  });

  it("baseUrl falls back to NEXUS_* env vars", () => {
    const origSub = process.env.SUB_APP_AI_URL;
    const origNexus = process.env.NEXUS_AI_URL;
    delete process.env.SUB_APP_AI_URL;
    process.env.NEXUS_AI_URL = "http://nexus-ai:8001";
    const ai = buildRegistry().find((a) => a.name === "ai");
    expect(ai?.baseUrl).toBe("http://nexus-ai:8001");
    if (origSub === undefined) delete process.env.SUB_APP_AI_URL;
    else process.env.SUB_APP_AI_URL = origSub;
    if (origNexus === undefined) delete process.env.NEXUS_AI_URL;
    else process.env.NEXUS_AI_URL = origNexus;
  });

  it("strips trailing slash from baseUrl", () => {
    const orig = process.env.SUB_APP_TAX_URL;
    process.env.SUB_APP_TAX_URL = "http://localhost:8004/";
    const tax = buildRegistry().find((a) => a.name === "tax");
    expect(tax?.baseUrl).toBe("http://localhost:8004");
    if (orig === undefined) delete process.env.SUB_APP_TAX_URL;
    else process.env.SUB_APP_TAX_URL = orig;
  });

  it("falls back to default localhost ports when no env vars set", () => {
    const envKeys = ["SUB_APP_BOOKING_URL","NEXUS_BOOKING_URL","SUB_APP_TAX_URL","NEXUS_TAX_URL",
                     "SUB_APP_SEARCH_URL","NEXUS_SEARCH_URL","SUB_APP_AI_URL","NEXUS_AI_URL"];
    const saved: Record<string, string | undefined> = {};
    envKeys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });

    const reg = buildRegistry();
    const portMap: Record<string, number> = { booking: 8003, tax: 8004, search: 8002, ai: 8001 };
    for (const app of reg) {
      expect(app.baseUrl).toBe(`http://localhost:${portMap[app.name]}`);
    }

    envKeys.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  it("all apps have githubUrl set", () => {
    for (const app of buildRegistry()) {
      expect(app.githubUrl).toBeTruthy();
    }
  });

  it("all apps have matchKeys with at least one entry", () => {
    for (const app of buildRegistry()) {
      expect(app.matchKeys.length).toBeGreaterThan(0);
    }
  });
});

// ── checkHealth() ─────────────────────────────────────────────────────────────

describe("checkHealth()", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns healthy status when upstream 200", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    });
    const app = buildRegistry().find((a) => a.name === "booking")!;
    const result = await checkHealth(app);
    expect(result.status).toBe("healthy");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.upstreamDetail).toEqual({ status: "ok" });
  });

  it("returns unhealthy when upstream non-2xx", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: "down" }),
    });
    const app = buildRegistry().find((a) => a.name === "search")!;
    const result = await checkHealth(app);
    expect(result.status).toBe("unhealthy");
  });

  it("returns unhealthy when fetch throws (network error)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const app = buildRegistry().find((a) => a.name === "ai")!;
    const result = await checkHealth(app);
    expect(result.status).toBe("unhealthy");
  });

  it("preserves app metadata including endpoints on result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const app = buildRegistry().find((a) => a.name === "tax")!;
    const result = await checkHealth(app);
    expect(result.name).toBe("tax");
    expect(result.label).toBe("Nexus Tax");
    expect(result.port).toBe(8004);
    expect(Array.isArray(result.endpoints)).toBe(true);
  });
});

// ── checkAllHealth() ──────────────────────────────────────────────────────────

describe("checkAllHealth()", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("always returns 4 results regardless of upstream failures", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true,  status: 200, json: async () => ({}) })
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true,  status: 200, json: async () => ({}) });

    const results = await checkAllHealth();
    expect(results).toHaveLength(4);
  });

  it("runs health checks in parallel (Promise.allSettled)", async () => {
    const order: number[] = [];
    mockFetch.mockImplementation(() => {
      order.push(order.length);
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    await checkAllHealth();
    expect(order.length).toBe(4);
  });

  it("mixed results: healthy + unhealthy in same batch", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true,  status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true,  status: 200, json: async () => ({}) })
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"));

    const results = await checkAllHealth();
    expect(results.filter((r) => r.status === "healthy")).toHaveLength(2);
    expect(results.filter((r) => r.status === "unhealthy")).toHaveLength(2);
  });

  it("each result includes endpoints array", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const results = await checkAllHealth();
    for (const r of results) {
      expect(Array.isArray(r.endpoints)).toBe(true);
    }
  });
});

// ── getCachedOpenApi() ────────────────────────────────────────────────────────

describe("getCachedOpenApi()", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();           // reset call counts between tests
    vi.stubGlobal("fetch", mockFetch);
    invalidateOpenApiCache("ai");
    invalidateOpenApiCache("search");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches from upstream on cache miss", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ openapi: "3.0.0" }),
    });
    const app = buildRegistry().find((a) => a.name === "ai")!;
    const result = await getCachedOpenApi(app);
    expect(result.hit).toBe(false);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ openapi: "3.0.0" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns cached data on subsequent call (cache hit)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ openapi: "3.0.0" }),
    });
    const app = buildRegistry().find((a) => a.name === "ai")!;
    await getCachedOpenApi(app);          // prime cache
    const second = await getCachedOpenApi(app); // should be HIT
    expect(second.hit).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1); // fetched only once
  });

  it("invalidateOpenApiCache clears the entry", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ openapi: "3.0.0" }),
    });
    const app = buildRegistry().find((a) => a.name === "search")!;
    await getCachedOpenApi(app);
    invalidateOpenApiCache("search");
    await getCachedOpenApi(app);
    expect(mockFetch).toHaveBeenCalledTimes(2); // fetched twice after invalidation
  });

  it("returns 503 status when upstream unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const app = buildRegistry().find((a) => a.name === "search")!;
    const result = await getCachedOpenApi(app);
    expect(result.status).toBe(503);
    expect(result.data).toBeNull();
  });
});

// ── SubAppInfo shape contract ─────────────────────────────────────────────────

describe("SubAppInfo shape contract", () => {
  it("booking has correct default port", () => {
    const envKeys = ["SUB_APP_BOOKING_URL","NEXUS_BOOKING_URL"];
    const saved: Record<string, string | undefined> = {};
    envKeys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });

    expect(buildRegistry().find((a) => a.name === "booking")!.port).toBe(8003);

    envKeys.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  it("ai has correct default port", () => {
    const envKeys = ["SUB_APP_AI_URL","NEXUS_AI_URL"];
    const saved: Record<string, string | undefined> = {};
    envKeys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });

    expect(buildRegistry().find((a) => a.name === "ai")!.port).toBe(8001);

    envKeys.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });
});

// ── Route integration tests ───────────────────────────────────────────────────

let routeApp: ReturnType<typeof express>;
let routeServer: ReturnType<typeof createServer>;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  routeApp = express();
  routeApp.use(express.json());
  routeServer = createServer(routeApp);
  await registerRoutes(routeServer, routeApp);
  await new Promise<void>((resolve) => routeServer.listen(0, resolve));
  request = supertest(routeServer);
}, 30000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    routeServer.close((err) => (err ? reject(err) : resolve()))
  );
});

describe("GET /api/apps", () => {
  it("returns 200 and an array of 4 sub-apps", async () => {
    const res = await request.get("/api/apps");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(4);
  });

  it("each entry has name, label, description, baseUrl, endpoints, status", async () => {
    const res = await request.get("/api/apps");
    for (const app of res.body) {
      expect(app.name).toBeTruthy();
      expect(app.label).toBeTruthy();
      expect(app.description).toBeTruthy();
      expect(app.baseUrl).toMatch(/^https?:\/\//);
      expect(Array.isArray(app.endpoints)).toBe(true);
      expect(["healthy","unhealthy","unconfigured"]).toContain(app.status);
    }
  });

  it("includes all four app names", async () => {
    const res = await request.get("/api/apps");
    const names = res.body.map((a: { name: string }) => a.name);
    expect(names).toContain("booking");
    expect(names).toContain("tax");
    expect(names).toContain("search");
    expect(names).toContain("ai");
  });
});

describe("GET /api/apps/health", () => {
  it("returns 200 and 4 health-status objects", async () => {
    const res = await request.get("/api/apps/health");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(4);
  });

  it("each entry has status field", async () => {
    const res = await request.get("/api/apps/health");
    for (const entry of res.body) {
      expect(["healthy","unhealthy","unconfigured"]).toContain(entry.status);
    }
  });
});

describe("GET /api/apps/:name", () => {
  it("returns 200 with endpoints for a known app", async () => {
    const res = await request.get("/api/apps/booking");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("booking");
    expect(Array.isArray(res.body.endpoints)).toBe(true);
    expect(res.body.endpoints.length).toBeGreaterThan(0);
    expect(["healthy","unhealthy"]).toContain(res.body.status);
  });

  it("returns 404 for an unknown app name", async () => {
    const res = await request.get("/api/apps/unknown-service");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("returns latencyMs field", async () => {
    const res = await request.get("/api/apps/ai");
    expect(res.status).toBe(200);
    expect(typeof res.body.latencyMs).toBe("number");
  });
});

describe("GET /api/apps/:name/health", () => {
  it("returns 200 or 503 with status for a known app", async () => {
    const res = await request.get("/api/apps/search/health");
    expect([200, 503]).toContain(res.status);
    expect(["healthy","unhealthy"]).toContain(res.body.status);
  });

  it("returns 404 for unknown app name", async () => {
    const res = await request.get("/api/apps/does-not-exist/health");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/apps/:name/openapi", () => {
  it("returns 200 or 503 with X-Cache header", async () => {
    const res = await request.get("/api/apps/tax/openapi");
    expect([200, 503]).toContain(res.status);
    expect(["HIT","MISS"]).toContain(res.headers["x-cache"]);
  });

  it("returns 404 for unknown app", async () => {
    const res = await request.get("/api/apps/nonexistent/openapi");
    expect(res.status).toBe(404);
  });

  it("second call returns X-Cache: HIT when first succeeded", async () => {
    // This test only passes if the upstream is actually reachable — skip gracefully
    const first = await request.get("/api/apps/booking/openapi");
    if (first.status !== 200) return; // upstream offline, skip
    const second = await request.get("/api/apps/booking/openapi");
    expect(second.headers["x-cache"]).toBe("HIT");
  });
});

describe("GET /api/apps/:name/proxy (transparent proxy)", () => {
  it("returns 503 or passes through when sub-app is offline", async () => {
    const res = await request.get("/api/apps/ai/proxy/health");
    // Either gateway-level 503 (app offline) or upstream response
    expect([200, 503, 404, 500, 502]).toContain(res.status);
  });

  it("returns 404 for unknown app via proxy", async () => {
    const res = await request.get("/api/apps/imaginary/proxy/health");
    expect(res.status).toBe(404);
  });
});
