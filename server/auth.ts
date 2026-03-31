import { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "./logger";

// Simple HMAC-based token — no extra dependencies needed
const JWT_SECRET = process.env.JWT_SECRET || "nexus-dev-secret-change-in-prod";

function base64url(str: string) {
  return Buffer.from(str).toString("base64url");
}

function sign(payload: object): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const sig    = createHash("sha256").update(`${header}.${body}.${JWT_SECRET}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verify(token: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHash("sha256").update(`${header}.${body}.${JWT_SECRET}`).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    // 24-hour expiry
    if (payload.iat && Date.now() / 1000 - payload.iat > 86400) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  return createHash("sha256").update(password + JWT_SECRET).digest("hex");
}

export function generateToken(userId: string, role: string): string {
  return sign({ sub: userId, role });
}

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: string };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const payload = verify(auth.slice(7));
  if (!payload) return res.status(401).json({ message: "Invalid or expired token" });
  req.user = { id: payload.sub, role: payload.role };
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  });
}

export async function seedAdminUser() {
  try {
    const [existing] = await db.select().from(users).where(eq(users.email, "admin@nexusconsult.dev"));
    if (!existing) {
      await db.insert(users).values({
        username: "admin",
        email: "admin@nexusconsult.dev",
        password: hashPassword("Admin@Nexus2024!"),
        role: "admin",
      });
      log("Admin user seeded: admin@nexusconsult.dev / Admin@Nexus2024!", "auth");
    }
    const [demoUser] = await db.select().from(users).where(eq(users.email, "demo@nexusconsult.dev"));
    if (!demoUser) {
      await db.insert(users).values({
        username: "demo_user",
        email: "demo@nexusconsult.dev",
        password: hashPassword("Demo@User2024!"),
        role: "user",
      });
      log("Demo user seeded: demo@nexusconsult.dev / Demo@User2024!", "auth");
    }
  } catch (err: any) {
    log(`Seed warning: ${err.message}`, "auth");
  }
}