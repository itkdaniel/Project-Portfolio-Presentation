/**
 * tests/unit/notifications.test.ts
 * Notification & Scope Approval System — API tests
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = "http://localhost:5000";

let adminToken = "";
let userToken = "";
let userId = "";

async function post(path: string, body: object, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path: string, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json() };
}

async function patch(path: string, body: object, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function del(path: string, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  // Wait for server to be ready (retry up to 5s)
  for (let i = 0; i < 10; i++) {
    try {
      const r = await fetch(`${BASE}/api/projects`);
      if (r.ok) break;
    } catch { /* not ready yet */ }
    await new Promise(res => setTimeout(res, 500));
  }

  // Login admin
  const adminLogin = await post("/api/auth/login", {
    email: "admin@nexusconsult.dev",
    password: "Admin@Nexus2024!",
  });
  expect(adminLogin.status, `admin login failed: ${JSON.stringify(adminLogin.body)}`).toBe(200);
  adminToken = adminLogin.body.token;

  // Register and login a fresh test user
  const ts = Date.now();
  const reg = await post("/api/auth/register", {
    username: `notif_user_${ts}`,
    email: `notif_${ts}@test.com`,
    password: "Test@User2024!",
    fullName: "Notif Tester",
  });
  expect(reg.status, `user register failed: ${JSON.stringify(reg.body)}`).toBe(201);
  userToken = reg.body.token;
  userId = reg.body.user.id;
});

// ── Notification Prefs ────────────────────────────────────────────────────────

describe("Notification Prefs", () => {
  it("GET /api/notification-prefs — auto-creates defaults for new user", async () => {
    const { status, body } = await get("/api/notification-prefs", userToken);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      userId,
      inApp: true,
      email: true,
      sms:   false,
    });
  });

  it("PATCH /api/notification-prefs — updates channel prefs", async () => {
    const { status, body } = await patch(
      "/api/notification-prefs",
      { inApp: true, email: false, sms: false },
      userToken,
    );
    expect(status).toBe(200);
    expect(body.email).toBe(false);
  });

  it("PATCH /api/notification-prefs — stores smsPhone when sms enabled", async () => {
    const { status, body } = await patch(
      "/api/notification-prefs",
      { sms: true, smsPhone: "+15550001234" },
      userToken,
    );
    expect(status).toBe(200);
    expect(body.sms).toBe(true);
    expect(body.smsPhone).toBe("+15550001234");
  });

  it("PATCH /api/notification-prefs — rejects unauthenticated", async () => {
    const { status } = await patch("/api/notification-prefs", { inApp: false });
    expect(status).toBe(401);
  });

  it("POST /api/notification-prefs/test — fires test on enabled channels", async () => {
    // Reset to inApp + email only
    await patch("/api/notification-prefs", { inApp: true, email: true, sms: false }, userToken);
    const { status, body } = await post("/api/notification-prefs/test", {}, userToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.channels)).toBe(true);
    expect(body.channels).toContain("in_app");
  });
});

// ── Notifications CRUD ────────────────────────────────────────────────────────

describe("Notifications", () => {
  let notifId = "";

  it("GET /api/notifications — returns empty list for new user initially (after test send)", async () => {
    const { status, body } = await get("/api/notifications", userToken);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    // Test send above created at least one
    expect(body.length).toBeGreaterThanOrEqual(1);
    notifId = body[0].id;
  });

  it("GET /api/notifications — requires auth", async () => {
    const { status } = await get("/api/notifications");
    expect(status).toBe(401);
  });

  it("PATCH /api/notifications/:id/read — marks one as read", async () => {
    const { status, body } = await patch(`/api/notifications/${notifId}/read`, {}, userToken);
    expect(status).toBe(200);
    expect(body.read).toBe(true);
  });

  it("PATCH /api/notifications/read-all — marks all as read", async () => {
    const { status, body } = await patch("/api/notifications/read-all", {}, userToken);
    expect(status).toBe(200);
    expect(body.message).toBe("All marked read");
  });

  it("DELETE /api/notifications/:id — deletes a notification", async () => {
    const { status, body } = await del(`/api/notifications/${notifId}`, userToken);
    expect(status).toBe(200);
    expect(body.message).toBe("Deleted");
  });

  it("DELETE /api/notifications/clear-read — clears all read notifications", async () => {
    const { status } = await del("/api/notifications/clear-read", userToken);
    expect(status).toBe(200);
  });
});

// ── Scope Requests ────────────────────────────────────────────────────────────

describe("Scope Requests", () => {
  let scopeRequestId = "";

  it("POST /api/scope-requests — user can submit a scope request", async () => {
    const { status, body } = await post(
      "/api/scope-requests",
      { scopeName: "uncensored_ai", reason: "Need access to unfiltered AI for research purposes" },
      userToken,
    );
    expect(status).toBe(201);
    expect(body.scopeName).toBe("uncensored_ai");
    expect(body.status).toBe("pending");
    scopeRequestId = body.id;
  });

  it("GET /api/scope-requests — user sees only their own requests", async () => {
    const { status, body } = await get("/api/scope-requests", userToken);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.every((r: any) => r.userId === userId)).toBe(true);
  });

  it("GET /api/scope-requests — admin sees all requests with user info", async () => {
    const { status, body } = await get("/api/scope-requests", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const ourRequest = body.find((r: any) => r.id === scopeRequestId);
    expect(ourRequest).toBeTruthy();
    expect(ourRequest.username).toBeTruthy();
  });

  it("POST /api/scope-requests — requires auth", async () => {
    const { status } = await post("/api/scope-requests", {
      scopeName: "test_scope", reason: "Test",
    });
    expect(status).toBe(401);
  });

  it("PATCH /api/scope-requests/:id/review — admin can approve", async () => {
    const { status, body } = await patch(
      `/api/scope-requests/${scopeRequestId}/review`,
      { status: "approved", adminNote: "Approved for research use." },
      adminToken,
    );
    expect(status).toBe(200);
    expect(body.status).toBe("approved");
    expect(body.adminNote).toBe("Approved for research use.");
  });

  it("PATCH /api/scope-requests/:id/review — non-admin cannot review", async () => {
    const { status } = await patch(
      `/api/scope-requests/${scopeRequestId}/review`,
      { status: "denied" },
      userToken,
    );
    expect(status).toBe(403);
  });

  it("PATCH /api/scope-requests/:id/review — rejects invalid status", async () => {
    const { status } = await patch(
      `/api/scope-requests/${scopeRequestId}/review`,
      { status: "maybe" },
      adminToken,
    );
    expect(status).toBe(400);
  });

  it("Approval generates a notification to the user", async () => {
    const { body: notifs } = await get("/api/notifications", userToken);
    // Should have a success notification from the approval
    const approvalNotif = notifs.find((n: any) => n.type === "success" && n.title.includes("Approved"));
    expect(approvalNotif).toBeTruthy();
  });

  it("Scope request submission notifies admins", async () => {
    // Admin should have a scope_request notification
    const { body: adminNotifs } = await get("/api/notifications", adminToken);
    const scopeNotif = adminNotifs.find((n: any) => n.type === "scope_request");
    expect(scopeNotif).toBeTruthy();
    expect(scopeNotif.link).toBe("/admin/approvals");
  });
});
