/**
 * tests/unit/notifications.test.ts
 * Notification & Scope Approval System — API tests
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import WebSocket from "ws";
import { generateToken, TOKEN_TTL_MS } from "../../server/auth";

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

async function createRealtimeTicket(token: string) {
  const response = await fetch(`${BASE}/api/realtime-ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Unable to create real-time ticket: ${response.status}`);
  return (await response.json() as { ticket: string }).ticket;
}

function connectWebSocketWithTicket(ticket: string) {
  return new Promise<{ socket: WebSocket; messages: any[] }>((resolve, reject) => {
    const socket = new WebSocket("ws://localhost:5000/ws", ["nexus-ticket", ticket]);
    const messages: any[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    socket.once("open", () => resolve({ socket, messages }));
    socket.once("error", reject);
  });
}

function expectRejectedWebSocket(ticket: string) {
  return new Promise<number>((resolve, reject) => {
    const socket = new WebSocket("ws://localhost:5000/ws", ["nexus-ticket", ticket]);
    const timeout = setTimeout(() => reject(new Error("Invalid WebSocket ticket was not rejected")), 4_000);
    socket.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
    socket.once("error", reject);
  });
}

async function connectWebSocket(token: string) {
  return connectWebSocketWithTicket(await createRealtimeTicket(token));
}

async function waitForNotification(messages: any[]) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const notification = messages.find((message) => message.type === "notification:created");
    if (notification) return notification;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}

function waitForClose(socket: WebSocket) {
  return new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket did not close when its token expired")), 4_000);
    socket.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
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

  it("PATCH /api/notification-prefs — coerces empty smsPhone string to null (UI payload compat)", async () => {
    // Settings UI sends smsPhone: "" when SMS is disabled — must not 400
    const { status, body } = await patch(
      "/api/notification-prefs",
      { sms: false, smsPhone: "" },
      userToken,
    );
    expect(status).toBe(200);
    expect(body.smsPhone).toBeNull();
  });

  it("PATCH /api/notification-prefs — rejects invalid (non-E.164) smsPhone", async () => {
    const { status } = await patch(
      "/api/notification-prefs",
      { sms: true, smsPhone: "5551234" },
      userToken,
    );
    expect(status).toBe(400);
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
    expect(typeof body.unreadCount).toBe("number");
    expect(Array.isArray(body.notifications)).toBe(true);
    // Test send above created at least one
    expect(body.notifications.length).toBeGreaterThanOrEqual(1);
    notifId = body.notifications[0].id;
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

describe("Real-time notifications", () => {
  it("delivers exactly one saved notification only to its authenticated user", async () => {
    const [target, other] = await Promise.all([
      connectWebSocket(userToken),
      connectWebSocket(adminToken),
    ]);

    const title = "Test Notification";
    const body = "This is a test in-app notification from NexusConsult.";

    try {
      const before = await get("/api/notifications", userToken);
      expect(before.status).toBe(200);
      const existingIds = new Set(before.body.notifications.map((notification: any) => notification.id));

      const { status } = await post("/api/notification-prefs/test", {}, userToken);
      expect(status).toBe(200);

      const targetEvent = await waitForNotification(target.messages);
      const after = await get("/api/notifications", userToken);
      expect(after.status).toBe(200);
      const savedNotification = after.body.notifications.find(
        (notification: any) =>
          !existingIds.has(notification.id) &&
          notification.title === title &&
          notification.body === body,
      );

      expect(savedNotification).toBeTruthy();
      expect(target.messages.filter((message) => message.type === "notification:created")).toHaveLength(1);
      expect(targetEvent?.payload).toMatchObject({
        id: savedNotification.id,
        userId,
        title,
        body,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(other.messages.filter((message) => message.type === "notification:created")).toHaveLength(0);
    } finally {
      target.socket.close();
      other.socket.close();
    }
  });

  it("delivers only to the matching live session and excludes an expired session", async () => {
    const [target, other] = await Promise.all([
      connectWebSocket(userToken),
      connectWebSocket(adminToken),
    ]);

    const originalNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(originalNow - TOKEN_TTL_MS - 1);
    const expiredToken = generateToken(userId, "user");
    vi.restoreAllMocks();
    const expiredTicketResponse = await fetch(`${BASE}/api/realtime-ticket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(expiredTicketResponse.status).toBe(401);
    const rejected = expectRejectedWebSocket("invalid-ticket");

    const expiryBoundary = Math.ceil(Date.now() / 1_000) * 1_000 + 2_000;
    vi.spyOn(Date, "now").mockReturnValue(expiryBoundary - TOKEN_TTL_MS);
    const expiringToken = generateToken(userId, "user");
    vi.restoreAllMocks();
    const expiring = await connectWebSocket(expiringToken);

    try {
      expect(await rejected).toBe(4001);
      expect(await waitForClose(expiring.socket)).toBe(4001);

      const { status } = await post("/api/notification-prefs/test", {}, userToken);
      expect(status).toBe(200);

      const targetEvent = await waitForNotification(target.messages);
      expect(targetEvent?.payload).toMatchObject({
        userId,
        title: "Test Notification",
        body: "This is a test in-app notification from NexusConsult.",
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(other.messages.some((message) => message.type === "notification:created")).toBe(false);
      expect(expiring.messages.some((message) => message.type === "notification:created")).toBe(false);
    } finally {
      target.socket.close();
      other.socket.close();
      expiring.socket.close();
    }
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

  it("PATCH /api/scope-requests/:id — admin can approve", async () => {
    const { status, body } = await patch(
      `/api/scope-requests/${scopeRequestId}`,
      { status: "approved", adminNote: "Approved for research use." },
      adminToken,
    );
    expect(status).toBe(200);
    expect(body.status).toBe("approved");
    expect(body.adminNote).toBe("Approved for research use.");
  });

  it("PATCH /api/scope-requests/:id — non-admin cannot review", async () => {
    const { status } = await patch(
      `/api/scope-requests/${scopeRequestId}`,
      { status: "denied" },
      userToken,
    );
    expect(status).toBe(403);
  });

  it("PATCH /api/scope-requests/:id — rejects invalid status", async () => {
    const { status } = await patch(
      `/api/scope-requests/${scopeRequestId}`,
      { status: "maybe" },
      adminToken,
    );
    expect(status).toBe(400);
  });

  it("Approval generates a notification to the user", async () => {
    const { body } = await get("/api/notifications", userToken);
    const approvalNotif = body.notifications.find((n: any) => n.type === "success" && n.title.includes("Approved"));
    expect(approvalNotif).toBeTruthy();
  });

  it("Scope request submission notifies admins", async () => {
    const { body } = await get("/api/notifications", adminToken);
    const scopeNotif = body.notifications.find((n: any) => n.type === "scope_request");
    expect(scopeNotif).toBeTruthy();
    expect(scopeNotif.link).toBe("/admin/approvals");
  });
});
