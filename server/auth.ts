import { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { db } from "./db";
import { users, corpRoles, dataRatings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "./logger";

// ── Static reference data: corporate roles ────────────────────────────────
const CORP_ROLE_SEED = [
  { id: 1, name: "user",      displayName: "User",                   level: 1, dataRating: "G",       description: "Entry-level access. Public, open-licensed data only."         },
  { id: 2, name: "worker",    displayName: "Worker / Developer",     level: 2, dataRating: "PG",      description: "Standard developer access. News, forums, public APIs."          },
  { id: 3, name: "lead",      displayName: "Team Lead",              level: 3, dataRating: "PG-13",   description: "Lead access. Business data, semi-public industry sources."      },
  { id: 4, name: "manager",   displayName: "Manager",                level: 4, dataRating: "R",       description: "Manager access. Proprietary datasets, private APIs."           },
  { id: 5, name: "director",  displayName: "Director",               level: 5, dataRating: "NC-17",   description: "Director access. Sensitive, internal, restricted data."         },
  { id: 6, name: "executive", displayName: "Executive",              level: 6, dataRating: "Unrated", description: "Executive access. Classified and unrestricted corporate data."  },
  { id: 7, name: "owner",     displayName: "Owner",                  level: 7, dataRating: "Unrated", description: "Owner access. Full unrestricted data access."                  },
  { id: 8, name: "creator",   displayName: "Creator / Root",         level: 8, dataRating: "None",    description: "Creator — zero restrictions. All data sources permitted."      },
];

// ── Static reference data: data ratings ───────────────────────────────────
const DATA_RATING_SEED = [
  {
    code: "G", name: "General Audiences",
    description: "Public domain and open-access datasets only.",
    allowedSources: ["Wikipedia", "Project Gutenberg", "US Gov open data", "arXiv (CS/Math)", "UCI ML Repository"],
    dockerAiHint: "Use only openly licensed, non-sensitive, publicly available corpora.",
  },
  {
    code: "PG", name: "Parental Guidance",
    description: "News, academic papers, public social media.",
    allowedSources: ["All G sources", "News APIs", "arXiv full corpus", "PubMed abstracts", "Stack Overflow dumps", "GitHub public repos", "Reddit public posts"],
    dockerAiHint: "Permitted to access mainstream public internet sources including news and forums.",
  },
  {
    code: "PG-13", name: "Parents Strongly Cautioned",
    description: "Business data, industry reports, private-but-public APIs.",
    allowedSources: ["All PG sources", "LinkedIn public profiles", "SEC EDGAR", "Kaggle public datasets", "Patent databases", "Job posting aggregators"],
    dockerAiHint: "May access semi-public business-oriented sources with explicit consent.",
  },
  {
    code: "R", name: "Restricted",
    description: "Proprietary datasets, private APIs with consent.",
    allowedSources: ["All PG-13 sources", "Licensed commercial datasets", "Private APIs (signed agreements)", "Internal company data (consent)"],
    dockerAiHint: "Restricted to proprietary and licensed content under signed data agreements.",
  },
  {
    code: "NC-17", name: "Adults Only",
    description: "Sensitive, internal, classified data.",
    allowedSources: ["All R sources", "Internal HR data", "Financial records (auditor)", "Security vulnerability databases", "Dark-web intelligence feeds"],
    dockerAiHint: "Sensitive internal data. Requires executive sign-off and audit logging.",
  },
  {
    code: "Unrated", name: "Unrated",
    description: "Unrestricted access to all corporate data sources.",
    allowedSources: ["All sources", "No restrictions on data origin"],
    dockerAiHint: "Full corporate data access. Owner/executive level only.",
  },
  {
    code: "None", name: "No Restrictions (Creator)",
    description: "Zero restrictions. Creator-level. All data sources permitted.",
    allowedSources: ["Everything — no restrictions whatsoever"],
    dockerAiHint: "Creator-level. All data, all sources, no restrictions.",
  },
];

// Simple HMAC-based token — no extra dependencies needed
const JWT_SECRET = process.env.JWT_SECRET || "nexus-dev-secret-change-in-prod";
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

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
    if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) return null;
    if (Date.now() >= (payload.iat * 1000) + TOKEN_TTL_MS) return null;
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

export interface VerifiedToken {
  id: string;
  role: string;
  expiresAt: number;
}

export function verifyToken(token: string): VerifiedToken | null {
  const payload = verify(token);
  if (!payload || typeof payload.sub !== "string") return null;
  return {
    id: payload.sub,
    role: typeof payload.role === "string" ? payload.role : "user",
    expiresAt: (payload.iat * 1000) + TOKEN_TTL_MS,
  };
}

export interface AuthenticatedRequest extends Request {
  user?: VerifiedToken;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const user = verifyToken(auth.slice(7));
  if (!user) return res.status(401).json({ message: "Invalid or expired token" });
  req.user = user;
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

    // Seed corp_roles (idempotent)
    const existingRoles = await db.select({ id: corpRoles.id }).from(corpRoles);
    if (existingRoles.length === 0) {
      await db.insert(corpRoles).values(CORP_ROLE_SEED);
      log("Corp roles seeded (8 tiers)", "auth");
    }

    // Seed data_ratings (idempotent)
    const existingRatings = await db.select({ id: dataRatings.id }).from(dataRatings);
    if (existingRatings.length === 0) {
      await db.insert(dataRatings).values(DATA_RATING_SEED);
      log("Data ratings seeded (7 tiers)", "auth");
    }
  } catch (err: any) {
    log(`Seed warning: ${err.message}`, "auth");
  }
}

// Export seed data for use in routes (avoids DB round-trips for static data)
export { CORP_ROLE_SEED, DATA_RATING_SEED };