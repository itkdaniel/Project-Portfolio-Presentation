/**
 * Authentication middleware for NexusAuth
 */

import type { Context, Next } from "hono";
import { verifyToken, type TokenPayload } from "../services/jwt";

// Role hierarchy — higher index = more privileged
const ROLE_LEVELS: Record<string, number> = {
  viewer:     0,
  user:       1,
  moderator:  2,
  admin:      3,
  superadmin: 4,
};

declare module "hono" {
  interface ContextVariableMap {
    user: TokenPayload;
  }
}

export function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ message: "Authorization required" }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    if (payload.type !== "access") {
      return c.json({ message: "Invalid token type" }, 401);
    }
    c.set("user", payload);
    return next();
  } catch (err: any) {
    return c.json({ message: err.message ?? "Invalid token" }, 401);
  }
}

export function requireRole(minRole: keyof typeof ROLE_LEVELS) {
  return async (c: Context, next: Next) => {
    await requireAuth(c, next);
    if (c.res.status !== 200) return; // already rejected

    const user = c.get("user");
    const userLevel = ROLE_LEVELS[user.role] ?? -1;
    const minLevel  = ROLE_LEVELS[minRole] ?? 99;

    if (userLevel < minLevel) {
      return c.json({ message: "Insufficient permissions" }, 403);
    }
    return next();
  };
}

export function requireAdmin(c: Context, next: Next) {
  return requireRole("admin")(c, next);
}
