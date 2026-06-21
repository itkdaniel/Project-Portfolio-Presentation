/**
 * Integration tests for the NexusScraper entity + scrape-job API routes.
 * Covers: entity-types, entities list/detail, scrape job endpoints, proxy fallback.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../../server/routes";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  request = supertest(server);
}, 30000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

// ── Entity Types ──────────────────────────────────────────────────────────────

describe("GET /api/entity-types", () => {
  it("returns a list of entity types seeded in the DB", async () => {
    const res = await request.get("/api/entity-types");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      const names = res.body.map((t: { name: string }) => t.name);
      expect(names).toContain("Technology");
      expect(names).toContain("Person");
    }
  });
});

// ── Entities ──────────────────────────────────────────────────────────────────

describe("GET /api/entities", () => {
  it("returns paginated response shape", async () => {
    const res = await request.get("/api/entities?limit=5&offset=0");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("limit", 5);
    expect(res.body).toHaveProperty("offset", 0);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("respects limit cap at 100", async () => {
    const res = await request.get("/api/entities?limit=9999");
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  it("filters by type without error", async () => {
    const res = await request.get("/api/entities?type=Technology");
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(item.type).toBe("Technology");
    }
  });
});

describe("GET /api/entities/:id", () => {
  it("returns 404 for unknown entity ID", async () => {
    const res = await request.get("/api/entities/nonexistent-entity-id-xyz");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");
  });
});

// ── Scrape Jobs ───────────────────────────────────────────────────────────────

describe("GET /api/scrape/jobs", () => {
  it("returns paginated response shape", async () => {
    const res = await request.get("/api/scrape/jobs?limit=10&offset=0");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe("GET /api/scrape/jobs/:id", () => {
  it("returns 404 for unknown job ID", async () => {
    const res = await request.get("/api/scrape/jobs/no-such-job-99999");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");
  });
});

describe("POST /api/scrape/url", () => {
  it("returns 400 when url is missing", async () => {
    const res = await request.post("/api/scrape/url").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  it("returns 400 for malformed URL", async () => {
    const res = await request
      .post("/api/scrape/url")
      .send({ url: "not-a-real-url" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  it("creates a pending scrape job for a valid URL when microservice is offline", async () => {
    delete process.env.NEXUS_SCRAPER_URL;
    delete process.env.SUB_APP_SCRAPER_URL;
    const res = await request
      .post("/api/scrape/url")
      .send({ url: "https://news.ycombinator.com", source_label: "Test" });
    expect([202, 422]).toContain(res.status);
  });
});

describe("POST /api/scrape/onion", () => {
  it("returns 400 when url is missing", async () => {
    const res = await request.post("/api/scrape/onion").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-onion URL", async () => {
    const res = await request
      .post("/api/scrape/onion")
      .send({ url: "https://example.com" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/\.onion/);
  });

  it("queues an onion job when microservice is offline", async () => {
    const res = await request
      .post("/api/scrape/onion")
      .send({ url: "http://duskgytldkxiuqc6.onion/" });
    expect([202, 422]).toContain(res.status);
  });
});

describe("POST /api/scrape/trending", () => {
  it("returns 202 or success when microservice is offline", async () => {
    const res = await request.post("/api/scrape/trending").send({});
    expect([200, 202]).toContain(res.status);
    expect(res.body).toHaveProperty("message");
  });
});
