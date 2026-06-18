/**
 * Gateway unit tests — sub-app registry, health aggregation, proxy helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRegistry, checkHealth, checkAllHealth } from "../../server/gateway";

// ── Registry ─────────────────────────────────────────────────────────────────

describe("buildRegistry()", () => {
  it("returns exactly 4 sub-apps", () => {
    const reg = buildRegistry();
    expect(reg).toHaveLength(4);
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
      expect(app.port).toBeGreaterThan(0);
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

  it("preserves app metadata on result", async () => {
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
    mockFetch.mockImplementation((_url: string) => {
      const i = order.length;
      order.push(i);
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
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === "healthy")).toHaveLength(2);
    expect(statuses.filter((s) => s === "unhealthy")).toHaveLength(2);
  });
});

// ── Gateway route shapes ─────────────────────────────────────────────────────

describe("SubAppInfo shape contract", () => {
  it("booking has correct default port", () => {
    const envKeys = ["SUB_APP_BOOKING_URL","NEXUS_BOOKING_URL"];
    const saved: Record<string, string | undefined> = {};
    envKeys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });

    const booking = buildRegistry().find((a) => a.name === "booking")!;
    expect(booking.port).toBe(8003);

    envKeys.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  it("ai has correct default port", () => {
    const envKeys = ["SUB_APP_AI_URL","NEXUS_AI_URL"];
    const saved: Record<string, string | undefined> = {};
    envKeys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });

    const ai = buildRegistry().find((a) => a.name === "ai")!;
    expect(ai.port).toBe(8001);

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
});
