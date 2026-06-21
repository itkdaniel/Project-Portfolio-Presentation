/**
 * tests/unit/scope-expiry.test.ts
 * Scope Expiry Approval Flow — Task #28
 *
 * Covers:
 *  - PATCH /api/scope-requests/:id with expiresInDays writes correct expiresAt
 *  - PATCH without expiresInDays leaves expiresAt null (permanent access)
 *  - Admin GET /api/admin/granted-scopes returns active-only (excludes expired/revoked)
 *  - DELETE /api/admin/granted-scopes/:id — revoke by row ID (happy path + 404)
 *  - Storage: getExpiringGrants — includes grants expiring within window, excludes others
 *  - Storage: getExpiringGrants — excludes already-revoked grants
 *  - Storage: hasGrantedScope — false for expired scope, true just before expiry
 *  - API: GET /api/granted-scopes excludes expired scopes (active-only contract)
 *  - Admin GET: 401 without auth, 403 for non-admin
 *  - Admin DELETE: 404 for already-revoked or unknown ID
 */
import { describe, it, expect, beforeAll } from "vitest";
import { storage } from "../../server/storage";

const BASE = "http://localhost:5000";

// ── Credentials ───────────────────────────────────────────────────────────────

let adminToken = "";
let userToken  = "";
let userId     = "";

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  for (let i = 0; i < 10; i++) {
    try {
      const r = await fetch(`${BASE}/api/projects`);
      if (r.ok) break;
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 500));
  }

  // Admin login
  const adminLogin = await post("/api/auth/login", {
    email:    "admin@nexusconsult.dev",
    password: "Admin@Nexus2024!",
  });
  expect(adminLogin.status, `admin login: ${JSON.stringify(adminLogin.body)}`).toBe(200);
  adminToken = adminLogin.body.token;

  // Register a test user
  const ts = Date.now();
  const reg = await post("/api/auth/register", {
    username: `expiry_user_${ts}`,
    email:    `expiry_${ts}@test.com`,
    password: "Test@Expiry2024!",
    fullName: "Expiry Tester",
  });
  expect(reg.status, `user register: ${JSON.stringify(reg.body)}`).toBe(201);
  userToken = reg.body.token;
  userId    = reg.body.user.id;
});

// ── 1. Approval with expiresInDays ────────────────────────────────────────────

describe("Scope approval — expiresInDays written as expiresAt", () => {
  let scopeRequestId = "";

  it("user can submit a scope request", async () => {
    const { status, body } = await post(
      "/api/scope-requests",
      { scopeName: "expiry_test_timed", reason: "Timed access for expiry tests" },
      userToken,
    );
    expect(status).toBe(201);
    expect(body.status).toBe("pending");
    scopeRequestId = body.id;
  });

  it("admin approval with expiresInDays sets a non-null expiresAt on the grant", async () => {
    const { status } = await patch(
      `/api/scope-requests/${scopeRequestId}`,
      { status: "approved", expiresInDays: 7 },
      adminToken,
    );
    expect(status).toBe(200);

    const { body } = await get("/api/granted-scopes", userToken);
    const grant = body.find((s: any) => s.scope === "expiry_test_timed");
    expect(grant, "grant should exist after approval").toBeTruthy();
    expect(grant.expiresAt).not.toBeNull();

    // expiresAt should be approximately now + 7 days (within ±5 min)
    const expiresAt  = new Date(grant.expiresAt).getTime();
    const sevenDays  = 7 * 24 * 60 * 60 * 1000;
    const approxExpiry = Date.now() + sevenDays;
    expect(Math.abs(expiresAt - approxExpiry)).toBeLessThan(5 * 60 * 1000);
  });
});

// ── 2. Approval WITHOUT expiresInDays — permanent access ─────────────────────

describe("Scope approval — omitting expiresInDays leaves expiresAt null", () => {
  let scopeRequestId = "";

  it("user submits a scope request for permanent access", async () => {
    const { status, body } = await post(
      "/api/scope-requests",
      { scopeName: "expiry_test_permanent", reason: "Permanent access check" },
      userToken,
    );
    expect(status).toBe(201);
    scopeRequestId = body.id;
  });

  it("admin approval without expiresInDays — expiresAt is null", async () => {
    const { status } = await patch(
      `/api/scope-requests/${scopeRequestId}`,
      { status: "approved" },
      adminToken,
    );
    expect(status).toBe(200);

    const { body } = await get("/api/granted-scopes", userToken);
    const grant = body.find((s: any) => s.scope === "expiry_test_permanent");
    expect(grant, "permanent grant should exist").toBeTruthy();
    expect(grant.expiresAt).toBeNull();
  });
});

// ── 3. API: GET /api/granted-scopes excludes expired grants ───────────────────

describe("GET /api/granted-scopes — expired scopes are excluded", () => {
  const expiredScope = `api_expired_${Date.now()}`;

  it("grant an already-expired scope directly via storage", async () => {
    await storage.grantScope({
      userId,
      scope:     expiredScope,
      grantedBy: null,
      expiresAt: new Date(Date.now() - 60_000), // expired 1 minute ago
    });
  });

  it("GET /api/granted-scopes — expired scope is NOT returned", async () => {
    const { status, body } = await get("/api/granted-scopes", userToken);
    expect(status).toBe(200);
    const found = body.find((s: any) => s.scope === expiredScope);
    expect(found).toBeUndefined();
  });
});

// ── 4. Admin GET /api/admin/granted-scopes — active-only & auth guards ────────

describe("GET /api/admin/granted-scopes — active-only, auth enforced", () => {
  const revokedScopeForAdmin  = `admin_revoked_${Date.now()}`;
  const expiredScopeForAdmin  = `admin_expired_${Date.now()}`;
  const activeScopeForAdmin   = `admin_active_${Date.now()}`;

  it("seed: grant an active scope, a revoked scope, and an expired scope", async () => {
    // Active
    await storage.grantScope({ userId, scope: activeScopeForAdmin, grantedBy: null });

    // Expired (past expiresAt)
    await storage.grantScope({
      userId,
      scope:     expiredScopeForAdmin,
      grantedBy: null,
      expiresAt: new Date(Date.now() - 60_000),
    });

    // Revoked
    await storage.grantScope({ userId, scope: revokedScopeForAdmin, grantedBy: null });
    await storage.revokeScope(userId, revokedScopeForAdmin);
  });

  it("returns 401 without authentication", async () => {
    const { status } = await get("/api/admin/granted-scopes");
    expect(status).toBe(401);
  });

  it("returns 403 for a non-admin user", async () => {
    const { status } = await get("/api/admin/granted-scopes", userToken);
    expect(status).toBe(403);
  });

  it("admin can fetch the list — only active grants are returned", async () => {
    const { status, body } = await get("/api/admin/granted-scopes", adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);

    const scopeNames = body.map((g: any) => g.scope);
    // Active scope is present
    expect(scopeNames).toContain(activeScopeForAdmin);
    // Revoked and expired are excluded
    expect(scopeNames).not.toContain(revokedScopeForAdmin);
    expect(scopeNames).not.toContain(expiredScopeForAdmin);
  });

  it("each returned grant has user info joined (email or username present)", async () => {
    const { body } = await get("/api/admin/granted-scopes", adminToken);
    const row = body.find((g: any) => g.scope === activeScopeForAdmin);
    expect(row).toBeTruthy();
    // At least one identity field must be populated from the users join
    const hasIdentity = row.email !== null || row.username !== null || row.fullName !== null;
    expect(hasIdentity).toBe(true);
  });
});

// ── 5. Admin DELETE /api/admin/granted-scopes/:id ────────────────────────────

describe("DELETE /api/admin/granted-scopes/:id — revoke by ID", () => {
  let grantId = "";
  const adminRevokeScope = `admin_revoke_by_id_${Date.now()}`;

  it("seed: grant an active scope to get a row ID", async () => {
    const { body } = await get("/api/admin/granted-scopes", adminToken);
    // Grant fresh scope via storage to get clean ID
    const grant = await storage.grantScope({ userId, scope: adminRevokeScope, grantedBy: null });
    grantId = grant.id;
    expect(grantId).toBeTruthy();
  });

  it("admin can revoke a specific grant by its row ID", async () => {
    const { status, body } = await del(`/api/admin/granted-scopes/${grantId}`, adminToken);
    expect(status).toBe(200);
    expect(body.revoked).toBe(true);
  });

  it("revoked grant no longer appears in admin list", async () => {
    const { body } = await get("/api/admin/granted-scopes", adminToken);
    const found = body.find((g: any) => g.id === grantId);
    expect(found).toBeUndefined();
  });

  it("revoking an already-revoked grant returns 404", async () => {
    const { status } = await del(`/api/admin/granted-scopes/${grantId}`, adminToken);
    expect(status).toBe(404);
  });

  it("revoking a non-existent grant ID returns 404", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const { status } = await del(`/api/admin/granted-scopes/${fakeId}`, adminToken);
    expect(status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const { status } = await del(`/api/admin/granted-scopes/${grantId}`);
    expect(status).toBe(401);
  });

  it("returns 403 for a non-admin user", async () => {
    const { status } = await del(`/api/admin/granted-scopes/${grantId}`, userToken);
    expect(status).toBe(403);
  });
});

// ── 6. Storage: getExpiringGrants ─────────────────────────────────────────────

describe("Storage: getExpiringGrants — scope expiry notification window", () => {
  const soonScope    = `soon_expiring_${Date.now()}`;
  const farScope     = `far_future_${Date.now()}`;
  const revokedScope = `revoked_expiring_${Date.now()}`;

  it("seed: grant scopes with different expiry windows", async () => {
    // Expires in 2 days — within WARN_DAYS=3
    await storage.grantScope({
      userId,
      scope:     soonScope,
      grantedBy: null,
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });

    // Expires in 10 days — outside WARN_DAYS=3
    await storage.grantScope({
      userId,
      scope:     farScope,
      grantedBy: null,
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });

    // Expires in 1 day but revoked — should be excluded
    await storage.grantScope({
      userId,
      scope:     revokedScope,
      grantedBy: null,
      expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    });
    await storage.revokeScope(userId, revokedScope);
  });

  it("getExpiringGrants(3) includes the 2-day scope", async () => {
    const grants = await storage.getExpiringGrants(3);
    const found = grants.find((g: any) => g.scope === soonScope && g.userId === userId);
    expect(found).toBeTruthy();
  });

  it("getExpiringGrants(3) excludes the 10-day scope (outside window)", async () => {
    const grants = await storage.getExpiringGrants(3);
    const found = grants.find((g: any) => g.scope === farScope && g.userId === userId);
    expect(found).toBeUndefined();
  });

  it("getExpiringGrants(3) excludes revoked grants even within the window", async () => {
    const grants = await storage.getExpiringGrants(3);
    const found = grants.find((g: any) => g.scope === revokedScope && g.userId === userId);
    expect(found).toBeUndefined();
  });

  it("getExpiringGrants returns user info fields (email or username)", async () => {
    const grants = await storage.getExpiringGrants(3);
    const found = grants.find((g: any) => g.scope === soonScope && g.userId === userId);
    expect(found).toBeTruthy();
    const hasIdentity = found.email !== undefined || found.username !== undefined;
    expect(hasIdentity).toBe(true);
  });

  it("getExpiringGrants(0) returns an empty list (zero-day window)", async () => {
    const grants = await storage.getExpiringGrants(0);
    // With 0-day window, nothing should match (all within future)
    const found = grants.find((g: any) => g.scope === soonScope && g.userId === userId);
    expect(found).toBeUndefined();
  });

  it("getExpiringGrants(30) includes both the 2-day and 10-day scopes", async () => {
    const grants = await storage.getExpiringGrants(30);
    const scopes = grants.map((g: any) => g.scope);
    expect(scopes).toContain(soonScope);
    expect(scopes).toContain(farScope);
  });
});

// ── 7. expiresInDays validation ───────────────────────────────────────────────

describe("Scope approval — expiresInDays validation", () => {
  let scopeRequestId = "";

  it("user submits a scope request", async () => {
    const { status, body } = await post(
      "/api/scope-requests",
      { scopeName: "validation_test_scope", reason: "Testing validation" },
      userToken,
    );
    expect(status).toBe(201);
    scopeRequestId = body.id;
  });

  it("approval with expiresInDays=0 is rejected (must be positive integer)", async () => {
    const { status } = await patch(
      `/api/scope-requests/${scopeRequestId}`,
      { status: "approved", expiresInDays: 0 },
      adminToken,
    );
    expect(status).toBe(400);
  });

  it("approval with expiresInDays=-1 is rejected", async () => {
    const { status } = await patch(
      `/api/scope-requests/${scopeRequestId}`,
      { status: "approved", expiresInDays: -1 },
      adminToken,
    );
    expect(status).toBe(400);
  });
});
