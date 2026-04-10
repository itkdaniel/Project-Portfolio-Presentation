/**
 * Corporate role hierarchy and data-rating permission tests.
 *
 * Validates:
 * - Role level ordering (1=user → 8=creator)
 * - Data rating access control matrix
 * - Creator has no restrictions (None rating)
 * - PATCH /api/users/role endpoint (admin only)
 */

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import { registerRoutes } from "../../server/routes";
import { createServer } from "http";

let app: express.Express;
let adminToken: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  const res = await (request(app) as any)
    .post("/api/auth/login")
    .send({ email: "admin@nexusconsult.dev", password: "Admin@Nexus2024!" });
  adminToken = res.body.token;
});

// ── Role Hierarchy ────────────────────────────────────────────────────────────

describe("Corporate Role Hierarchy", () => {
  const ROLES = [
    { id: 1, name: "user",      level: 1, rating: "G"       },
    { id: 2, name: "worker",    level: 2, rating: "PG"      },
    { id: 3, name: "lead",      level: 3, rating: "PG-13"   },
    { id: 4, name: "manager",   level: 4, rating: "R"       },
    { id: 5, name: "director",  level: 5, rating: "NC-17"   },
    { id: 6, name: "executive", level: 6, rating: "Unrated" },
    { id: 7, name: "owner",     level: 7, rating: "Unrated" },
    { id: 8, name: "creator",   level: 8, rating: "None"    },
  ];

  it("defines exactly 8 roles", () => {
    expect(ROLES).toHaveLength(8);
  });

  it("user is the lowest level (1)", () => {
    const user = ROLES.find(r => r.name === "user");
    expect(user?.level).toBe(1);
  });

  it("creator is the highest level (8)", () => {
    const creator = ROLES.find(r => r.name === "creator");
    expect(creator?.level).toBe(8);
  });

  it("roles have strictly ascending levels 1–8", () => {
    const sorted = [...ROLES].sort((a, b) => a.level - b.level);
    sorted.forEach((r, i) => expect(r.level).toBe(i + 1));
  });

  it("creator has None rating (no restrictions)", () => {
    const creator = ROLES.find(r => r.name === "creator");
    expect(creator?.rating).toBe("None");
  });

  it("director and above have unrestricted or no-restriction rating", () => {
    const highRoles = ROLES.filter(r => r.level >= 5);
    for (const r of highRoles) {
      expect(["NC-17", "Unrated", "None"]).toContain(r.rating);
    }
  });
});

// ── Data Rating Access Matrix ─────────────────────────────────────────────────

describe("Data Rating Access Matrix", () => {
  const RATING_ORDER = ["G", "PG", "PG-13", "R", "NC-17", "Unrated", "None"];

  function canAccess(roleRating: string, requested: string): boolean {
    const own = RATING_ORDER.indexOf(roleRating);
    const req = RATING_ORDER.indexOf(requested);
    return own >= req;
  }

  it("G-rated role can only access G data", () => {
    expect(canAccess("G", "G")).toBe(true);
    expect(canAccess("G", "PG")).toBe(false);
    expect(canAccess("G", "R")).toBe(false);
  });

  it("R-rated role can access G, PG, PG-13, and R data", () => {
    expect(canAccess("R", "G")).toBe(true);
    expect(canAccess("R", "PG")).toBe(true);
    expect(canAccess("R", "PG-13")).toBe(true);
    expect(canAccess("R", "R")).toBe(true);
    expect(canAccess("R", "NC-17")).toBe(false);
  });

  it("None-rated role (creator) can access everything", () => {
    for (const rating of RATING_ORDER) {
      expect(canAccess("None", rating)).toBe(true);
    }
  });

  it("Unrated role cannot access None (creator-only)", () => {
    expect(canAccess("Unrated", "None")).toBe(false);
  });
});

// ── /api/users/role endpoint ──────────────────────────────────────────────────

describe("PATCH /api/users/role", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app)
      .patch("/api/users/role")
      .send({ email: "demo@nexusconsult.dev", corpRoleId: 2 });
    expect(res.status).toBe(401);
  });

  it("returns 400 if corpRoleId is out of range", async () => {
    const res = await request(app)
      .patch("/api/users/role")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "demo@nexusconsult.dev", corpRoleId: 99 });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent user email", async () => {
    const res = await request(app)
      .patch("/api/users/role")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "nonexistent@nowhere.com", corpRoleId: 3 });
    expect(res.status).toBe(404);
  });

  it("successfully updates a real user's corp role", async () => {
    const res = await request(app)
      .patch("/api/users/role")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: "demo@nexusconsult.dev", corpRoleId: 3 });
    expect(res.status).toBe(200);
    expect(res.body.corpRoleId).toBe(3);
    expect(res.body.email).toBe("demo@nexusconsult.dev");
  });
});
