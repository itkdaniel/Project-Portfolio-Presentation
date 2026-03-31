import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../../server/routes";

// Integration tests using a live test server + real DB
// These run against the DATABASE_URL env var set in tests/setup.ts

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: ReturnType<typeof supertest>;
let adminToken: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  request = supertest(server);

  // Log in as seeded admin
  const res = await request.post("/api/auth/login").send({
    email: "admin@nexusconsult.dev",
    password: "Admin@Nexus2024!",
  });
  adminToken = res.body.token;
}, 30000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

describe("GET /api/projects", () => {
  it("returns 200 and an array", async () => {
    const res = await request.get("/api/projects");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("POST /api/projects (admin only)", () => {
  it("returns 401 without a token", async () => {
    const res = await request.post("/api/projects").send({ name: "Test" });
    expect(res.status).toBe(401);
  });

  it("creates a project with valid admin token", async () => {
    const res = await request
      .post("/api/projects")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "CI Test Project",
        description: "Created by automated test suite",
        type: "API",
        tags: ["Test"],
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("CI Test Project");
    // Cleanup
    if (res.body.id) {
      await request
        .delete(`/api/projects/${res.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
    }
  });
});

describe("POST /api/auth/login", () => {
  it("returns token with valid credentials", async () => {
    const res = await request.post("/api/auth/login").send({
      email: "admin@nexusconsult.dev",
      password: "Admin@Nexus2024!",
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.role).toBe("admin");
  });

  it("returns 401 with wrong password", async () => {
    const res = await request.post("/api/auth/login").send({
      email: "admin@nexusconsult.dev",
      password: "wrong-password",
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/bookings", () => {
  it("creates a booking without auth", async () => {
    const res = await request.post("/api/bookings").send({
      name: "Test User",
      email: "test@example.com",
      details: "Test booking from vitest",
      date: "2026-06-15",
      time: "10:00",
      meetingType: "discovery",
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test User");
  });
});

describe("RBAC — admin-only routes", () => {
  it("GET /api/bookings returns 401 for unauthenticated user", async () => {
    expect((await request.get("/api/bookings")).status).toBe(401);
  });

  it("GET /api/bookings returns 200 for admin", async () => {
    const res = await request.get("/api/bookings").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("GET /api/admin/stats returns stats for admin", async () => {
    const res = await request.get("/api/admin/stats").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalProjects");
    expect(res.body).toHaveProperty("totalBookings");
  });
});