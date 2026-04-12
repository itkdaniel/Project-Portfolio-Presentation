/**
 * /auth routes — login, register, refresh, logout, me
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import bcrypt from "bcrypt";

import { db } from "../db";
import { users, sessions } from "../db/schema";
import { createAccessToken, generateRefreshToken, verifyToken, REFRESH_TTL_S } from "../services/jwt";
import { redis } from "../db/redis";
import { requireAuth } from "../middleware/auth";
import { eq, and, gt } from "drizzle-orm";

export const authRouter = new Hono();

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name:     z.string().min(1).optional(),
});

// ── POST /auth/login ──────────────────────────────────────────────────────

authRouter.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return c.json({ message: "Invalid credentials" }, 401);

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return c.json({ message: "Invalid credentials" }, 401);

  // Create tokens
  const accessToken   = createAccessToken(user.id, user.role);
  const refreshToken  = generateRefreshToken();
  const expiresAt     = new Date(Date.now() + REFRESH_TTL_S * 1000);

  // Persist refresh token
  const ip          = c.req.header("x-forwarded-for") ?? "unknown";
  const userAgent   = c.req.header("user-agent") ?? "unknown";
  const deviceHash  = Buffer.from(userAgent + ip).toString("base64").slice(0, 64);

  await db.insert(sessions).values({
    userId:       user.id,
    refreshToken,
    deviceHash,
    ipAddress:    ip,
    expiresAt,
  });

  // Also store in Redis for fast revocation checks
  await redis.setex(`rt:${refreshToken}`, REFRESH_TTL_S, user.id);

  return c.json({
    access_token:  accessToken,
    refresh_token: refreshToken,
    token_type:    "Bearer",
    expires_in:    900,
    user: {
      id:         user.id,
      email:      user.email,
      role:       user.role,
      created_at: user.createdAt,
    },
  });
});

// ── POST /auth/register ───────────────────────────────────────────────────

authRouter.post("/register", zValidator("json", registerSchema), async (c) => {
  const { email, password, name } = c.req.valid("json");

  const [existing] = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, email)).limit(1);
  if (existing) return c.json({ message: "Email already in use" }, 409);

  const hashed = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({
    email,
    password: hashed,
    displayName: name,
    role: "user",
  }).returning({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt });

  const accessToken  = createAccessToken(user.id, user.role);
  const refreshToken = generateRefreshToken();
  await redis.setex(`rt:${refreshToken}`, REFRESH_TTL_S, user.id);

  return c.json({
    access_token:  accessToken,
    refresh_token: refreshToken,
    token_type:    "Bearer",
    expires_in:    900,
    user,
  }, 201);
});

// ── POST /auth/refresh ────────────────────────────────────────────────────

authRouter.post("/refresh", async (c) => {
  const body = await c.req.json();
  const { refresh_token } = body;
  if (!refresh_token) return c.json({ message: "refresh_token required" }, 400);

  // Check Redis (fast revocation)
  const userId = await redis.get(`rt:${refresh_token}`);
  if (!userId) return c.json({ message: "Invalid or expired refresh token" }, 401);

  // Check DB and get user role
  const now = new Date();
  const [session] = await db.select().from(sessions)
    .where(and(
      eq(sessions.refreshToken, refresh_token),
      gt(sessions.expiresAt, now),
    )).limit(1);
  if (!session || session.revokedAt) return c.json({ message: "Refresh token revoked" }, 401);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ message: "User not found" }, 401);

  // Rotate — revoke old, issue new
  await db.update(sessions).set({ revokedAt: new Date() })
    .where(eq(sessions.refreshToken, refresh_token));
  await redis.del(`rt:${refresh_token}`);

  const newRefreshToken = generateRefreshToken();
  const expiresAt       = new Date(Date.now() + REFRESH_TTL_S * 1000);
  await db.insert(sessions).values({
    userId:       user.id,
    refreshToken: newRefreshToken,
    expiresAt,
  });
  await redis.setex(`rt:${newRefreshToken}`, REFRESH_TTL_S, user.id);

  return c.json({
    access_token:  createAccessToken(user.id, user.role),
    refresh_token: newRefreshToken,
    token_type:    "Bearer",
    expires_in:    900,
  });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────

authRouter.post("/logout", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { refresh_token } = body;

  if (refresh_token) {
    await db.update(sessions).set({ revokedAt: new Date() })
      .where(eq(sessions.refreshToken, refresh_token));
    await redis.del(`rt:${refresh_token}`);
  }

  return c.json({ message: "Logged out successfully" });
});

// ── POST /auth/logout/all — revoke all sessions ────────────────────────────

authRouter.post("/logout/all", requireAuth, async (c) => {
  const user = c.get("user");
  const [, sessionList] = await Promise.all([
    db.update(sessions).set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, user.sub))),
    db.select({ refreshToken: sessions.refreshToken }).from(sessions)
      .where(eq(sessions.userId, user.sub)),
  ]);

  // Purge from Redis
  if (sessionList.length > 0) {
    const pipeline = redis.pipeline();
    sessionList.forEach(s => pipeline.del(`rt:${s.refreshToken}`));
    await pipeline.exec();
  }

  return c.json({ message: "All sessions revoked", count: sessionList.length });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────

authRouter.get("/me", requireAuth, async (c) => {
  const { sub } = c.get("user");
  const [user] = await db.select({
    id:          users.id,
    email:       users.email,
    role:        users.role,
    displayName: users.displayName,
    verified:    users.verified,
    createdAt:   users.createdAt,
  }).from(users).where(eq(users.id, sub)).limit(1);

  if (!user) return c.json({ message: "User not found" }, 404);
  return c.json(user);
});
