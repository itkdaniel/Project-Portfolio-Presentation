/**
 * tests/unit/granted-scopes.test.ts
 * AI Scope-Gating & Granted-Scopes API
 *
 * Covers:
 *  - GET  /api/granted-scopes          (empty state, active scopes, auth guard)
 *  - POST /api/scope-requests → PATCH approve → scope written to granted_scopes
 *  - DELETE /api/granted-scopes/:scope  (revokeScope excludes revoked rows)
 *  - GET  /api/scope-requests/:id/confirm (one-click email link grants scope)
 *  - Storage-level unit tests for grantScope / revokeScope / hasGrantedScope
 *    called directly against the database (active, revoked, expired cases)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "crypto";
import { storage } from "../../server/storage";

const BASE = "http://localhost:5000";

let adminToken = "";
let userToken  = "";
let userId     = "";

// A second, independent user for the one-click email link tests
let user2Token = "";
let user2Id    = "";

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

/**
 * Generates a valid HMAC-signed one-click confirm URL using the same algorithm
 * as server/notify.ts → generateApprovalLink().
 * Requires FIELD_ENCRYPTION_KEY to be set in the environment.
 */
function buildConfirmUrl(
  scopeRequestId: string,
  action: "approved" | "denied",
): string {
  const key = process.env.FIELD_ENCRYPTION_KEY!;
  const exp     = Math.floor(Date.now() / 1000) + 48 * 3600;
  const payload = `${scopeRequestId}:${action}:${exp}`;
  const sig     = createHmac("sha256", key).update(payload).digest("hex");
  return `/api/scope-requests/${scopeRequestId}/confirm?action=${action}&exp=${exp}&sig=${sig}`;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Wait for the server (retry up to 5 s)
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
  expect(adminLogin.status, `admin login failed: ${JSON.stringify(adminLogin.body)}`).toBe(200);
  adminToken = adminLogin.body.token;

  // Register user A (primary test user)
  const ts = Date.now();
  const regA = await post("/api/auth/register", {
    username: `scope_user_${ts}`,
    email:    `scope_${ts}@test.com`,
    password: "Test@User2024!",
    fullName: "Scope Tester A",
  });
  expect(regA.status, `user A register failed: ${JSON.stringify(regA.body)}`).toBe(201);
  userToken = regA.body.token;
  userId    = regA.body.user.id;

  // Register user B (used for one-click email link tests)
  const regB = await post("/api/auth/register", {
    username: `scope_user2_${ts}`,
    email:    `scope2_${ts}@test.com`,
    password: "Test@User2024!",
    fullName: "Scope Tester B",
  });
  expect(regB.status, `user B register failed: ${JSON.stringify(regB.body)}`).toBe(201);
  user2Token = regB.body.token;
  user2Id    = regB.body.user.id;
});

// ── 1. Empty state ────────────────────────────────────────────────────────────

describe("GET /api/granted-scopes — empty state", () => {
  it("returns an empty array for a fresh user (no scopes ever granted)", async () => {
    const { status, body } = await get("/api/granted-scopes", userToken);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("requires authentication — 401 without token", async () => {
    const { status } = await get("/api/granted-scopes");
    expect(status).toBe(401);
  });
});

// ── 2. Approval flow writes to granted_scopes ─────────────────────────────────

describe("Scope approval flow — grantScope via admin PATCH", () => {
  let scopeRequestId = "";

  it("POST /api/scope-requests — user can submit a request", async () => {
    const { status, body } = await post(
      "/api/scope-requests",
      { scopeName: "uncensored_ai", reason: "Research access needed" },
      userToken,
    );
    expect(status).toBe(201);
    expect(body.scopeName).toBe("uncensored_ai");
    expect(body.status).toBe("pending");
    scopeRequestId = body.id;
  });

  it("GET /api/granted-scopes — still empty before admin review", async () => {
    const { status, body } = await get("/api/granted-scopes", userToken);
    expect(status).toBe(200);
    expect(body).toHaveLength(0);
  });

  it("PATCH /api/scope-requests/:id — admin approval writes a row to granted_scopes", async () => {
    const { status, body } = await patch(
      `/api/scope-requests/${scopeRequestId}`,
      { status: "approved", adminNote: "Approved for automated test." },
      adminToken,
    );
    expect(status).toBe(200);
    expect(body.status).toBe("approved");
  });

  it("GET /api/granted-scopes — active scope is returned after approval (grantScope)", async () => {
    const { status, body } = await get("/api/granted-scopes", userToken);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);

    const granted = body.find((s: any) => s.scope === "uncensored_ai");
    expect(granted).toBeTruthy();
    expect(granted.userId).toBe(userId);
    expect(granted.revokedAt).toBeNull();
  });

  it("GET /api/granted-scopes — other users do not see this user's scopes", async () => {
    const { status, body } = await get("/api/granted-scopes", user2Token);
    expect(status).toBe(200);
    const leaked = body.find((s: any) => s.userId === userId);
    expect(leaked).toBeUndefined();
  });
});

// ── 3. Revoke flow — revokeScope excludes revoked rows ────────────────────────

describe("DELETE /api/granted-scopes/:scope — revokeScope", () => {
  it("revokes the scope and returns { revoked: true }", async () => {
    const { status, body } = await del("/api/granted-scopes/uncensored_ai", userToken);
    expect(status).toBe(200);
    expect(body.revoked).toBe(true);
  });

  it("GET /api/granted-scopes — revoked scope is excluded (revokedAt IS NOT NULL)", async () => {
    const { status, body } = await get("/api/granted-scopes", userToken);
    expect(status).toBe(200);
    const stillPresent = body.find((s: any) => s.scope === "uncensored_ai");
    expect(stillPresent).toBeUndefined();
  });

  it("DELETE /api/granted-scopes/:scope — revoking a non-existent scope returns { revoked: false }", async () => {
    const { status, body } = await del("/api/granted-scopes/nonexistent_scope_xyz", userToken);
    expect(status).toBe(200);
    expect(body.revoked).toBe(false);
  });

  it("DELETE /api/granted-scopes/:scope — requires authentication", async () => {
    const { status } = await del("/api/granted-scopes/uncensored_ai");
    expect(status).toBe(401);
  });
});

// ── 4. One-click email approval link ──────────────────────────────────────────
// The entire block is skipped (not silently passed) when FIELD_ENCRYPTION_KEY
// is absent, because the token cannot be generated without it.

describe.skipIf(!process.env.FIELD_ENCRYPTION_KEY)(
  "GET /api/scope-requests/:id/confirm — one-click email link",
  () => {
    let scopeRequestId2 = "";

    it("sets up a pending scope request for user B (pre-condition)", async () => {
      const { status, body } = await post(
        "/api/scope-requests",
        { scopeName: "beta_tester", reason: "Email link test" },
        user2Token,
      );
      expect(status).toBe(201);
      scopeRequestId2 = body.id;
    });

    it("valid HMAC link redirects to /admin/approvals?confirmed=...&action=approved", async () => {
      const url = buildConfirmUrl(scopeRequestId2, "approved");
      const res = await fetch(`${BASE}${url}`, { redirect: "manual" });
      expect([301, 302, 303, 307, 308]).toContain(res.status);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("confirmed=");
      expect(location).toContain("action=approved");
      expect(location).not.toContain("error=");
    });

    it("GET /api/granted-scopes — scope is granted after one-click approval", async () => {
      const { status, body } = await get("/api/granted-scopes", user2Token);
      expect(status).toBe(200);
      const granted = body.find((s: any) => s.scope === "beta_tester");
      expect(granted).toBeTruthy();
      expect(granted.grantedBy).toBeNull();
    });

    it("already-reviewed request redirects with error=already_reviewed", async () => {
      const url = buildConfirmUrl(scopeRequestId2, "approved");
      const res = await fetch(`${BASE}${url}`, { redirect: "manual" });
      expect([301, 302, 303, 307, 308]).toContain(res.status);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("already_reviewed");
    });

    it("tampered signature redirects with error=invalid_or_expired_token", async () => {
      const exp    = Math.floor(Date.now() / 1000) + 48 * 3600;
      const badSig = "0".repeat(64);
      const badUrl = `/api/scope-requests/${scopeRequestId2}/confirm?action=approved&exp=${exp}&sig=${badSig}`;
      const res    = await fetch(`${BASE}${badUrl}`, { redirect: "manual" });
      expect([301, 302, 303, 307, 308]).toContain(res.status);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("invalid_or_expired_token");
    });

    it("missing query params redirect with error=missing_params", async () => {
      const newReq = await post(
        "/api/scope-requests",
        { scopeName: "missing_params_test", reason: "Param check" },
        user2Token,
      );
      const rid = newReq.body.id;
      const res = await fetch(`${BASE}/api/scope-requests/${rid}/confirm`, { redirect: "manual" });
      expect([301, 302, 303, 307, 308]).toContain(res.status);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("missing_params");
    });
  },
);

// ── 5. expiresInDays option writes expiry timestamp ───────────────────────────

describe("grantScope with expiresInDays (storage-level behaviour via API)", () => {
  let expiringScopeRequestId = "";

  it("POST /api/scope-requests — create a new request for user A", async () => {
    const { status, body } = await post(
      "/api/scope-requests",
      { scopeName: "temp_access", reason: "Short-lived scope test" },
      userToken,
    );
    expect(status).toBe(201);
    expiringScopeRequestId = body.id;
  });

  it("PATCH approve with expiresInDays — granted scope has a non-null expiresAt", async () => {
    const { status } = await patch(
      `/api/scope-requests/${expiringScopeRequestId}`,
      { status: "approved", expiresInDays: 30, adminNote: "30-day trial." },
      adminToken,
    );
    expect(status).toBe(200);

    const { body } = await get("/api/granted-scopes", userToken);
    const granted = body.find((s: any) => s.scope === "temp_access");
    expect(granted).toBeTruthy();
    expect(granted.expiresAt).not.toBeNull();

    const expiresAt   = new Date(granted.expiresAt).getTime();
    const thirtyDays  = 30 * 24 * 60 * 60 * 1000;
    const approxExpiry = Date.now() + thirtyDays;
    expect(Math.abs(expiresAt - approxExpiry)).toBeLessThan(5 * 60 * 1000);
  });
});

// ── 6. Denial does NOT write to granted_scopes ────────────────────────────────

describe("Denied scope request does not grant access", () => {
  it("setup: submit a scope request that will be denied", async () => {
    const { status, body } = await post(
      "/api/scope-requests",
      { scopeName: "denied_scope_check", reason: "Should be denied" },
      userToken,
    );
    expect(status).toBe(201);

    const { status: patchStatus } = await patch(
      `/api/scope-requests/${body.id}`,
      { status: "denied", adminNote: "Not approved." },
      adminToken,
    );
    expect(patchStatus).toBe(200);
  });

  it("GET /api/granted-scopes — denied scope does NOT appear in active scopes", async () => {
    const { status, body } = await get("/api/granted-scopes", userToken);
    expect(status).toBe(200);
    const denied = body.find((s: any) => s.scope === "denied_scope_check");
    expect(denied).toBeUndefined();
  });
});

// ── 7. Storage-level unit tests — direct DB calls ────────────────────────────

describe("Storage-level unit tests — grantScope / revokeScope / hasGrantedScope", () => {
  // Scope names use timestamps to avoid collision across runs
  const activeScope  = `storage_active_${Date.now()}`;
  const revokedScope = `storage_revoked_${Date.now()}`;
  const expiredScope = `storage_expired_${Date.now()}`;
  const returnScope  = `storage_return_${Date.now()}`;

  it("grantScope — inserts a row and returns the GrantedScope record", async () => {
    const granted = await storage.grantScope({
      userId,
      scope: returnScope,
      grantedBy: null,
    });
    expect(granted.id).toBeTruthy();
    expect(granted.userId).toBe(userId);
    expect(granted.scope).toBe(returnScope);
    expect(granted.revokedAt).toBeNull();
    expect(granted.grantedBy).toBeNull();
  });

  it("hasGrantedScope — returns true for an active (non-revoked, non-expired) scope", async () => {
    await storage.grantScope({ userId, scope: activeScope, grantedBy: null });
    const has = await storage.hasGrantedScope(userId, activeScope);
    expect(has).toBe(true);
  });

  it("hasGrantedScope — returns false for a scope that was never granted", async () => {
    const has = await storage.hasGrantedScope(userId, `never_granted_${Date.now()}`);
    expect(has).toBe(false);
  });

  it("hasGrantedScope — returns false for an expired scope (expiresAt in the past)", async () => {
    await storage.grantScope({
      userId,
      scope:     expiredScope,
      grantedBy: null,
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    });
    const has = await storage.hasGrantedScope(userId, expiredScope);
    expect(has).toBe(false);
  });

  it("revokeScope — returns true and sets revokedAt on an active scope", async () => {
    await storage.grantScope({ userId, scope: revokedScope, grantedBy: null });
    const revoked = await storage.revokeScope(userId, revokedScope);
    expect(revoked).toBe(true);
  });

  it("hasGrantedScope — returns false after revokeScope is called", async () => {
    const has = await storage.hasGrantedScope(userId, revokedScope);
    expect(has).toBe(false);
  });

  it("revokeScope — returns false when no active scope exists to revoke", async () => {
    const revoked = await storage.revokeScope(userId, `no_such_scope_${Date.now()}`);
    expect(revoked).toBe(false);
  });

  it("revokeScope — cannot double-revoke (second call returns false)", async () => {
    const firstRevoke  = await storage.revokeScope(userId, revokedScope);
    const secondRevoke = await storage.revokeScope(userId, revokedScope);
    expect(firstRevoke).toBe(false);  // already revoked above
    expect(secondRevoke).toBe(false);
  });

  it("getGrantedScopes — excludes revoked and expired rows, includes active ones", async () => {
    const scopes = await storage.getGrantedScopes(userId);
    const scopeNames = scopes.map((s: any) => s.scope);

    // Active scope from this block should be present
    expect(scopeNames).toContain(activeScope);

    // Revoked and expired scopes must not appear
    expect(scopeNames).not.toContain(revokedScope);
    expect(scopeNames).not.toContain(expiredScope);
  });

  it("grantScope — double-approving the same scope produces exactly one active grant row", async () => {
    const dupScope = `storage_dup_${Date.now()}`;

    const first  = await storage.grantScope({ userId, scope: dupScope, grantedBy: null });
    const second = await storage.grantScope({ userId, scope: dupScope, grantedBy: null });

    // Both calls return a valid grant record
    expect(first.id).toBeTruthy();
    expect(second.id).toBeTruthy();

    // The UPSERT must keep the same row (same primary-key id)
    expect(second.id).toBe(first.id);

    // Only one active row should exist in the DB for this scope
    const active = await storage.getGrantedScopes(userId);
    const matches = active.filter((s: any) => s.scope === dupScope);
    expect(matches).toHaveLength(1);
  });
});
