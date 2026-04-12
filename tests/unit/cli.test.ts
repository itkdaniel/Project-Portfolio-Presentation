/**
 * CLI Integration Tests
 *
 * Tests the underlying API endpoints that the Python and Go CLIs invoke.
 * Validates RBAC enforcement, data-rating access control, AI endpoints,
 * and model management routes — matching the CLI command → API mapping.
 *
 * Command → Endpoint mappings tested:
 *   nexus auth login        → POST /api/auth/login
 *   nexus auth whoami       → GET  /api/auth/me
 *   nexus auth roles        → GET  /api/corp-roles
 *   nexus auth set-role     → PATCH /api/users/role
 *   nexus portfolio list    → GET  /api/projects
 *   nexus portfolio add     → POST /api/projects
 *   nexus portfolio update  → PATCH /api/projects/:id
 *   nexus portfolio remove  → DELETE /api/projects/:id
 *   nexus data ratings      → GET  /api/data-ratings
 *   nexus data check        → GET  /api/data-ratings/check?rating=X
 *   nexus ai classify       → POST /api/ai/classify
 *   nexus ai embed          → POST /api/ai/embed
 *   nexus ai similarity     → POST /api/ai/similarity
 *   nexus model list        → GET  /api/ai/models
 *   nexus api endpoints     → GET  /api/meta/endpoints
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { registerRoutes } from "../../server/routes";
import { createServer } from "http";

let app: express.Express;
let adminToken: string;
let demoToken: string;
let cliTestProjectId: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  // Admin login — mirrors: nexus auth login -e admin@... -p ...
  const adminRes = await (request(app) as any)
    .post("/api/auth/login")
    .send({ email: "admin@nexusconsult.dev", password: "Admin@Nexus2024!" });
  adminToken = adminRes.body.token;

  // Demo login — mirrors: nexus auth login -e demo@... -p ...
  const demoRes = await (request(app) as any)
    .post("/api/auth/login")
    .send({ email: "demo@nexusconsult.dev", password: "Demo@User2024!" });
  demoToken = demoRes.body.token;
});

afterAll(async () => {
  if (cliTestProjectId) {
    await request(app)
      .delete(`/api/projects/${cliTestProjectId}`)
      .set("Authorization", `Bearer ${adminToken}`);
  }
});


// ── nexus auth ────────────────────────────────────────────────────────────────

describe("CLI: nexus auth", () => {
  it("login: POST /api/auth/login returns token + user (mirrors cli login)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@nexusconsult.dev", password: "Admin@Nexus2024!" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user).toHaveProperty("email");
    expect(res.body.user).toHaveProperty("role");
    expect(res.body.user).toHaveProperty("corpRoleId");
  });

  it("login: wrong password returns 401 (nexus auth login reject)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@nexusconsult.dev", password: "WrongPassword!" });
    expect(res.status).toBe(401);
  });

  it("whoami: GET /api/auth/me returns current user (mirrors nexus auth whoami)", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("admin@nexusconsult.dev");
    expect(res.body.role).toBe("admin");
    expect(res.body).toHaveProperty("corpRoleId");
  });

  it("whoami: 401 without token (nexus auth whoami no-login)", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("roles: GET /api/corp-roles returns full 8-tier hierarchy", async () => {
    const res = await request(app)
      .get("/api/corp-roles")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(8);
    const levels = res.body.map((r: any) => r.level).sort((a: number, b: number) => a - b);
    expect(levels).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("roles: each role has required fields (id, name, level, dataRating)", async () => {
    const res = await request(app)
      .get("/api/corp-roles")
      .set("Authorization", `Bearer ${adminToken}`);
    for (const role of res.body) {
      expect(role).toHaveProperty("id");
      expect(role).toHaveProperty("name");
      expect(role).toHaveProperty("level");
      expect(role).toHaveProperty("dataRating");
      expect(role).toHaveProperty("displayName");
    }
  });

  it("set-role: PATCH /api/users/role updates corpRoleId (nexus auth set-role)", async () => {
    const res = await request(app)
      .patch("/api/users/role")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "demo@nexusconsult.dev", corpRoleId: 3 });
    expect(res.status).toBe(200);
    expect(res.body.corpRoleId).toBe(3);
  });

  it("set-role: 400 for out-of-range role ID (nexus auth set-role 99)", async () => {
    const res = await request(app)
      .patch("/api/users/role")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "demo@nexusconsult.dev", corpRoleId: 99 });
    expect(res.status).toBe(400);
  });

  it("set-role: 401 without admin token (non-admin cannot set roles)", async () => {
    const res = await request(app)
      .patch("/api/users/role")
      .send({ email: "demo@nexusconsult.dev", corpRoleId: 5 });
    expect(res.status).toBe(401);
  });
});


// ── nexus portfolio ───────────────────────────────────────────────────────────

describe("CLI: nexus portfolio", () => {
  it("list: GET /api/projects returns array (nexus portfolio list)", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("add: POST /api/projects creates project (nexus portfolio add)", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name:        "CLI Test Project",
        description: "Created by CLI integration test",
        type:        "cli-test",
        tags:        ["cli", "test"],
        status:      "draft",
        published:   false,
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("CLI Test Project");
    expect(res.body.tags).toContain("cli");
    cliTestProjectId = res.body.id;
  });

  it("get: GET /api/projects/:id returns single project (nexus portfolio get)", async () => {
    const res = await request(app).get(`/api/projects/${cliTestProjectId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cliTestProjectId);
    expect(res.body.name).toBe("CLI Test Project");
  });

  it("update: PATCH /api/projects/:id updates fields (nexus portfolio update)", async () => {
    const res = await request(app)
      .patch(`/api/projects/${cliTestProjectId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "active", published: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");
    expect(res.body.published).toBe(true);
  });

  it("feature: PATCH featured=true (nexus portfolio feature)", async () => {
    const res = await request(app)
      .patch(`/api/projects/${cliTestProjectId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ featured: true });
    expect(res.status).toBe(200);
    expect(res.body.featured).toBe(true);
  });

  it("unpublish: PATCH published=false (nexus portfolio unpublish)", async () => {
    const res = await request(app)
      .patch(`/api/projects/${cliTestProjectId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ published: false });
    expect(res.status).toBe(200);
    expect(res.body.published).toBe(false);
  });

  it("add: 401 without auth token (nexus portfolio add no-login)", async () => {
    const res = await request(app)
      .post("/api/projects")
      .send({ name: "Unauth Project", description: "x", type: "x" });
    expect(res.status).toBe(401);
  });

  it("add: 400 when name is missing (nexus portfolio add --no-name)", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "missing name", type: "x" });
    expect(res.status).toBe(400);
  });
});


// ── nexus data ────────────────────────────────────────────────────────────────

describe("CLI: nexus data", () => {
  it("ratings: GET /api/data-ratings returns all 7 tiers", async () => {
    const res = await request(app)
      .get("/api/data-ratings")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(7);
    const codes = res.body.map((r: any) => r.code);
    expect(codes).toContain("G");
    expect(codes).toContain("R");
    expect(codes).toContain("None");
  });

  it("ratings: each tier has code, name, description, allowedSources", async () => {
    const res = await request(app)
      .get("/api/data-ratings")
      .set("Authorization", `Bearer ${adminToken}`);
    for (const rating of res.body) {
      expect(rating).toHaveProperty("code");
      expect(rating).toHaveProperty("name");
      expect(rating).toHaveProperty("description");
      expect(rating).toHaveProperty("allowedSources");
      expect(Array.isArray(rating.allowedSources)).toBe(true);
    }
  });

  it("check: GET /api/data-ratings/check?rating=G returns permitted=true for level-1 user", async () => {
    const res = await request(app)
      .get("/api/data-ratings/check?rating=G")
      .set("Authorization", `Bearer ${demoToken}`);
    expect(res.status).toBe(200);
    expect(res.body.permitted).toBe(true);
  });

  it("check: level-1 user cannot access NC-17 data (nexus data check --rating NC-17)", async () => {
    const res = await request(app)
      .get("/api/data-ratings/check?rating=NC-17")
      .set("Authorization", `Bearer ${demoToken}`);
    expect(res.status).toBe(200);
    expect(res.body.permitted).toBe(false);
  });

  it("check: 400 for an invalid rating code", async () => {
    const res = await request(app)
      .get("/api/data-ratings/check?rating=INVALID")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("check: 401 without token", async () => {
    const res = await request(app).get("/api/data-ratings/check?rating=G");
    expect(res.status).toBe(401);
  });
});


// ── nexus ai ──────────────────────────────────────────────────────────────────

describe("CLI: nexus ai", () => {
  it("classify: POST /api/ai/classify returns label + scores (nexus ai classify)", async () => {
    const res = await request(app)
      .post("/api/ai/classify")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text: "Build an API gateway with rate limiting and circuit breaker" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("label");
    expect(res.body).toHaveProperty("confidence");
    expect(res.body).toHaveProperty("scores");
    expect(typeof res.body.confidence).toBe("number");
    expect(res.body.confidence).toBeGreaterThan(0);
    expect(res.body.confidence).toBeLessThanOrEqual(1);
  });

  it("classify: 401 without token (nexus ai classify no-login)", async () => {
    const res = await request(app)
      .post("/api/ai/classify")
      .send({ text: "hello world" });
    expect(res.status).toBe(401);
  });

  it("classify: 400 with empty text", async () => {
    const res = await request(app)
      .post("/api/ai/classify")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text: "" });
    expect(res.status).toBe(400);
  });

  it("embed: POST /api/ai/embed returns embedding vector (nexus ai embed)", async () => {
    const res = await request(app)
      .post("/api/ai/embed")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text: "distributed systems architecture" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("embedding");
    expect(Array.isArray(res.body.embedding)).toBe(true);
    expect(res.body.embedding.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty("dimensions");
    expect(res.body.dimensions).toBe(res.body.embedding.length);
  });

  it("embed: 400 with empty text", async () => {
    const res = await request(app)
      .post("/api/ai/embed")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text: "" });
    expect(res.status).toBe(400);
  });

  it("similarity: POST /api/ai/similarity returns score between 0 and 1 (nexus ai similarity)", async () => {
    const res = await request(app)
      .post("/api/ai/similarity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        text_a: "microservice architecture",
        text_b: "distributed systems design",
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("similarity");
    expect(typeof res.body.similarity).toBe("number");
    expect(res.body.similarity).toBeGreaterThanOrEqual(0);
    expect(res.body.similarity).toBeLessThanOrEqual(1);
    expect(res.body).toHaveProperty("interpretation");
  });

  it("similarity: identical texts score >= 0.99", async () => {
    const res = await request(app)
      .post("/api/ai/similarity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        text_a: "NexusConsult automation consulting platform",
        text_b: "NexusConsult automation consulting platform",
      });
    expect(res.status).toBe(200);
    expect(res.body.similarity).toBeGreaterThanOrEqual(0.99);
  });

  it("similarity: 400 when text_a or text_b is missing", async () => {
    const res = await request(app)
      .post("/api/ai/similarity")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text_a: "only one text" });
    expect(res.status).toBe(400);
  });
});


// ── nexus model ───────────────────────────────────────────────────────────────

describe("CLI: nexus model", () => {
  it("list: GET /api/ai/models returns model registry (nexus model list)", async () => {
    const res = await request(app)
      .get("/api/ai/models")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const model = res.body[0];
    expect(model).toHaveProperty("id");
    expect(model).toHaveProperty("name");
    expect(model).toHaveProperty("type");
    expect(model).toHaveProperty("description");
  });

  it("list: 401 without token (nexus model list no-login)", async () => {
    const res = await request(app).get("/api/ai/models");
    expect(res.status).toBe(401);
  });

  it("info: GET /api/ai/models/:id returns model details (nexus model info)", async () => {
    const listRes = await request(app)
      .get("/api/ai/models")
      .set("Authorization", `Bearer ${adminToken}`);
    const firstId = listRes.body[0]?.id;
    if (!firstId) return;

    const res = await request(app)
      .get(`/api/ai/models/${firstId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(firstId);
    expect(res.body).toHaveProperty("architecture");
  });
});


// ── nexus api endpoints ───────────────────────────────────────────────────────

describe("CLI: nexus api", () => {
  it("endpoints: GET /api/meta/endpoints lists all routes (nexus api endpoints)", async () => {
    const res = await request(app)
      .get("/api/meta/endpoints")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const ep = res.body[0];
    expect(ep).toHaveProperty("method");
    expect(ep).toHaveProperty("path");
  });
});
