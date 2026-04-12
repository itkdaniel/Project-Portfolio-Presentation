import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "http";
import supertest from "supertest";
import { registerRoutes } from "../../server/routes";

let app: express.Express;
let server: ReturnType<typeof createServer>;
let request: ReturnType<typeof supertest>;
let adminToken: string;
let userToken: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  request = supertest(server);

  const adminRes = await request.post("/api/auth/login").send({
    email: "admin@nexusconsult.dev",
    password: "Admin@Nexus2024!",
  });
  adminToken = adminRes.body.token;

  const demoRes = await request.post("/api/auth/login").send({
    email: "demo@nexusconsult.dev",
    password: "Demo@User2024!",
  });
  userToken = demoRes.body.token;

  // Reset admin settings to known defaults so GET tests are deterministic
  // across repeated runs (shared DB means PATCH tests from prior runs persist).
  await request
    .patch("/api/settings")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      timezone:             "UTC",
      language:             "en",
      theme:                "dark",
      compactMode:          false,
      sidebarCollapsed:     false,
      displayName:          null,
      bio:                  null,
      emailNotifications:   true,
      notifyBookingConfirm: true,
      notifyNewBooking:     true,
      notifyNewInquiry:     true,
      notifyProjectUpdates: false,
      notifyWeeklyDigest:   false,
      notifySecurityAlerts: true,
    });
}, 30000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

// ── GET /api/settings ─────────────────────────────────────────────────────────

describe("GET /api/settings", () => {
  it("returns 401 without a token", async () => {
    const res = await request.get("/api/settings");
    expect(res.status).toBe(401);
  });

  it("returns default settings for authenticated user", async () => {
    const res = await request
      .get("/api/settings")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("userId");
    expect(res.body).toHaveProperty("theme");
    expect(res.body).toHaveProperty("emailNotifications");
    expect(res.body.timezone).toBe("UTC");
    expect(res.body.language).toBe("en");
  });

  it("returns settings for demo user", async () => {
    const res = await request
      .get("/api/settings")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("userId");
  });
});

// ── PATCH /api/settings ────────────────────────────────────────────────────────

describe("PATCH /api/settings", () => {
  it("returns 401 without a token", async () => {
    const res = await request.patch("/api/settings").send({ theme: "light" });
    expect(res.status).toBe(401);
  });

  it("updates profile fields", async () => {
    const res = await request
      .patch("/api/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        displayName: "Admin User",
        bio:         "NexusConsult platform administrator",
        timezone:    "America/New_York",
        language:    "en",
      });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Admin User");
    expect(res.body.timezone).toBe("America/New_York");
  });

  it("updates appearance settings", async () => {
    const res = await request
      .patch("/api/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ theme: "light", compactMode: true });
    expect(res.status).toBe(200);
    expect(res.body.theme).toBe("light");
    expect(res.body.compactMode).toBe(true);
  });

  it("updates notification preferences", async () => {
    const res = await request
      .patch("/api/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        emailNotifications:   true,
        notifyBookingConfirm: false,
        notifyWeeklyDigest:   true,
      });
    expect(res.status).toBe(200);
    expect(res.body.notifyBookingConfirm).toBe(false);
    expect(res.body.notifyWeeklyDigest).toBe(true);
  });

  it("persists changes — re-fetching returns updated values", async () => {
    await request
      .patch("/api/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ displayName: "Persisted Name" });

    const res = await request
      .get("/api/settings")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.displayName).toBe("Persisted Name");
  });

  it("resets display name back to null-equivalent", async () => {
    const res = await request
      .patch("/api/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ displayName: null });
    expect(res.status).toBe(200);
  });
});

// ── GET /api/settings/email-config ────────────────────────────────────────────

describe("GET /api/settings/email-config", () => {
  it("returns 401 without a token", async () => {
    const res = await request.get("/api/settings/email-config");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    const res = await request
      .get("/api/settings/email-config")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("returns email config for admin", async () => {
    const res = await request
      .get("/api/settings/email-config")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("smtpHost");
    expect(res.body).toHaveProperty("enabled");
    expect(res.body).toHaveProperty("fromEmail");
    expect(res.body.githubUrl).toBe("https://github.com/itkdaniel");
    expect(res.body.linkedinUrl).toBe("https://linkedin.com/in/itkdaniel");
  });
});

// ── PATCH /api/settings/email-config ─────────────────────────────────────────

describe("PATCH /api/settings/email-config", () => {
  it("returns 403 for non-admin user", async () => {
    const res = await request
      .patch("/api/settings/email-config")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ fromName: "Hacker" });
    expect(res.status).toBe(403);
  });

  it("allows admin to update SMTP settings", async () => {
    const res = await request
      .patch("/api/settings/email-config")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        smtpHost: "smtp.mailhog.local",
        smtpPort: 1025,
        fromName: "NexusConsult Test",
        fromEmail: "test@nexusconsult.dev",
        adminEmail: "admin@nexusconsult.dev",
      });
    expect(res.status).toBe(200);
    expect(res.body.smtpHost).toBe("smtp.mailhog.local");
    expect(res.body.smtpPort).toBe(1025);
    expect(res.body.fromName).toBe("NexusConsult Test");
  });

  it("persists social link updates", async () => {
    await request
      .patch("/api/settings/email-config")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ githubUrl: "https://github.com/itkdaniel" });

    const res = await request
      .get("/api/settings/email-config")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.githubUrl).toBe("https://github.com/itkdaniel");
  });
});

// ── POST /api/settings/change-password ────────────────────────────────────────

describe("POST /api/settings/change-password", () => {
  it("returns 401 without a token", async () => {
    const res = await request
      .post("/api/settings/change-password")
      .send({ currentPassword: "old", newPassword: "new12345" });
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong current password", async () => {
    const res = await request
      .post("/api/settings/change-password")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ currentPassword: "wrong-password", newPassword: "NewPass123!" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for passwords shorter than 8 chars", async () => {
    const res = await request
      .post("/api/settings/change-password")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ currentPassword: "Demo@User2024!", newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when fields are missing", async () => {
    const res = await request
      .post("/api/settings/change-password")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ currentPassword: "Demo@User2024!" });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/settings/test-email ─────────────────────────────────────────────

describe("POST /api/settings/test-email", () => {
  it("returns 401 without a token", async () => {
    const res = await request
      .post("/api/settings/test-email")
      .send({ to: "test@example.com" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    const res = await request
      .post("/api/settings/test-email")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ to: "test@example.com" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when 'to' is missing", async () => {
    const res = await request
      .post("/api/settings/test-email")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("succeeds (log mode when SMTP not configured)", async () => {
    const res = await request
      .post("/api/settings/test-email")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ to: "test@nexusconsult.dev" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("mode");
    expect(["log", "smtp"]).toContain(res.body.mode);
  });
});
