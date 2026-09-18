import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import { registerRoutes } from "../../server/routes";
import { storage } from "../../server/storage";

describe("AI scope access", () => {
  let app: express.Express;
  let token: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(createServer(app), app);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@nexusconsult.dev", password: "Demo@User2024!" });
    token = login.body.token;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 403 when the authenticated user lacks the uncensored scope", async () => {
    vi.spyOn(storage, "hasGrantedScope").mockResolvedValue(false);

    const response = await request(app)
      .post("/api/ai/classify")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "classify this" });

    expect(response.status).toBe(403);
    expect(storage.hasGrantedScope).toHaveBeenCalledWith(expect.any(String), "uncensored");
  });

  it("returns 200 when the authenticated user has the uncensored scope", async () => {
    vi.spyOn(storage, "hasGrantedScope").mockResolvedValue(true);

    const response = await request(app)
      .post("/api/ai/classify")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "classify this software architecture request" });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("label");
  });

  it("returns 403 before forwarding an ungranted request through the generic AI proxy", async () => {
    vi.spyOn(storage, "hasGrantedScope").mockResolvedValue(false);

    const response = await request(app)
      .post("/api/apps/ai/proxy/v1/ai/classify")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "bypass attempt" });

    expect(response.status).toBe(403);
    expect(storage.hasGrantedScope).toHaveBeenCalledWith(expect.any(String), "uncensored");
  });
});