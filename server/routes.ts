import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { eq } from "drizzle-orm";
import { buildRegistry, checkHealth, checkAllHealth, getCachedOpenApi, proxyToSubApp, recordHealthSnapshot, getHealthHistory } from "./gateway";
import { storage } from "./storage";
import { pubsub } from "./pubsub";
import { db } from "./db";
import { users } from "@shared/schema";
import {
  insertProjectSchema, insertBookingSchema, insertInquirySchema, loginSchema,
  updateUserSettingsSchema, updateEmailConfigSchema, updateProfileSchema, updateResumeSchema, registerSchema,
} from "@shared/schema";
import { ZodError } from "zod";
import { requireAuth, requireAdmin, generateToken, hashPassword, seedAdminUser, CORP_ROLE_SEED, DATA_RATING_SEED, type AuthenticatedRequest } from "./auth";
import { seedTaxData } from "./tax-seed";
import { initTaxScheduler } from "./tax-scheduler";
import { loadCachedResults, runTests } from "./test-runner";
import {
  sendBookingConfirmationToUser,
  sendBookingNotificationToAdmin,
  sendTestEmail,
  getEmailConfig,
  sendEmail,
} from "./email";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { mkdirSync } from "fs";
import { join } from "path";

// ── Upload directory setup ─────────────────────────────────────────────────
const UPLOADS_DIR = join(process.cwd(), "uploads", "resumes");
try { mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}

const resumeUpload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── nexus-booking gateway URL ──────────────────────────────────────────────
// When NEXUS_BOOKING_URL is set (e.g. http://localhost:8003 in production /
// docker-compose), booking requests are proxied to the standalone service.
// Falls back to local monolith storage when the env var is absent.
const NEXUS_BOOKING_URL = process.env.NEXUS_BOOKING_URL || "";

// ── nexus-search gateway URL ───────────────────────────────────────────────
// When NEXUS_SEARCH_URL is set (e.g. http://localhost:8002 in production /
// docker-compose), full-text search and BFS recommendation requests are
// proxied to the standalone nexus-search microservice (BM25 + TagGraph).
// Falls back to the local storage list when the env var is absent.
const NEXUS_SEARCH_URL = process.env.NEXUS_SEARCH_URL || "";

// ── nexus-ai gateway URL ────────────────────────────────────────────────────
// When NEXUS_AI_URL is set (e.g. http://localhost:8001 in production /
// docker-compose), all /api/ai/* requests are proxied to the standalone
// nexus-ai PyTorch inference service. Falls back to local heuristic
// classifiers when the env var is absent.
const NEXUS_AI_URL = process.env.NEXUS_AI_URL || "";

/**
 * Proxy a request to the nexus-search microservice, forwarding query
 * parameters and the Authorization header transparently.
 */
async function proxyToSearchService(
  method: string,
  path: string,
  req: Request,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  // Preserve the original query string (e.g. ?q=auth&tags=jwt)
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const url = `${NEXUS_SEARCH_URL}${path}${qs}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.headers.authorization) {
    headers["Authorization"] = req.headers.authorization;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const resp = await fetch(url, init);
  let data: unknown;
  try { data = await resp.json(); } catch { data = null; }
  return { status: resp.status, data };
}

/**
 * Proxy a request to the nexus-ai PyTorch inference service.
 * Maps /api/ai/* → /v1/ai/* on the nexus-ai service.
 */
async function proxyToAiService(
  method: string,
  path: string,
  req: Request,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const url = `${NEXUS_AI_URL}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.headers.authorization) {
    headers["Authorization"] = req.headers.authorization;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const resp = await fetch(url, init);
  let data: unknown;
  try { data = await resp.json(); } catch { data = null; }
  return { status: resp.status, data };
}

/**
 * Proxy a request to the nexus-booking microservice, forwarding the
 * Authorization header so admin endpoints remain protected.
 */
async function proxyToBookingService(
  method: string,
  path: string,
  req: Request,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const url = `${NEXUS_BOOKING_URL}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.headers.authorization) {
    headers["Authorization"] = req.headers.authorization;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(url, init);
  let data: unknown;
  try { data = await resp.json(); } catch { data = null; }
  return { status: resp.status, data };
}

function zodErr(error: unknown) {
  if (error instanceof ZodError) {
    return { status: 400, body: { message: "Validation failed", errors: error.errors } };
  }
  return { status: 500, body: { message: "Internal server error" } };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  pubsub.attach(httpServer);
  await seedAdminUser();

  // ── Auth ──────────────────────────────────────────────────────────────────

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user || user.password !== hashPassword(password)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = generateToken(user.id, user.role);
      return res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role, corpRoleId: user.corpRoleId ?? 1 } });
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Validation error" });
      }
      const { username, email, password, fullName } = parsed.data;
      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing) return res.status(409).json({ message: "Email already registered" });

      const [user] = await db.insert(users).values({
        username, email,
        password: hashPassword(password),
        role: "user",
        ...(fullName ? { fullName: fullName.trim() } : {}),
      }).returning();
      const token = generateToken(user.id, user.role);

      // Fire-and-forget confirmation email
      const cfg = await getEmailConfig();
      if (cfg?.enabled) {
        sendEmail({
          to: email,
          subject: "Welcome to NexusConsult — Account Confirmed",
          html: `
<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Inter',Arial,sans-serif;color:#e4e4e7;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#18181b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
<tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#1a1a2e 100%);padding:40px;text-align:center;">
<h1 style="margin:0;font-size:24px;font-weight:700;color:#f4f4f5;">Welcome, ${fullName || username}!</h1>
<p style="margin:8px 0 0;color:#a1a1aa;">Your NexusConsult account is ready.</p>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="color:#d4d4d8;">Your account has been created. You can now log in and explore all features.</p>
<p style="color:#71717a;font-size:12px;margin-top:24px;">NexusConsult — Automation &amp; Consulting Services</p>
</td></tr>
</table></td></tr></table>
</body></html>`,
          text: `Welcome, ${fullName || username}! Your NexusConsult account is ready. Log in at https://nexusconsult.dev`,
        }).catch(() => {});
      }

      return res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role, fullName: user.fullName } });
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  app.get("/api/auth/me", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _pw, ...safe } = user;
    return res.json({ ...safe, corpRoleId: safe.corpRoleId ?? 1 });
  });

  // ── User Profile ─────────────────────────────────────────────────────────

  // PATCH /api/users/profile — update extended profile fields (fullName, mobile, location, bio, profilePictureUrl, position)
  app.patch("/api/users/profile", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = updateProfileSchema.parse(req.body);
      const updated = await storage.updateUserProfile(req.user!.id, data);
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safe } = updated;
      return res.json(safe);
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  // ── Resumé ───────────────────────────────────────────────────────────────

  // GET /api/resume — get the authenticated user's resumé
  app.get("/api/resume", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    let resume = await storage.getResume(req.user!.id);
    if (!resume) {
      // Auto-create with default sections
      resume = await storage.upsertResume(req.user!.id, {
        sections: [
          { title: "Summary",    content: "" },
          { title: "Experience", content: "" },
          { title: "Skills",     content: "" },
          { title: "Education",  content: "" },
        ],
      });
    }
    return res.json(resume);
  });

  // PATCH /api/resume — update resumé sections and/or file metadata
  app.patch("/api/resume", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = updateResumeSchema.parse(req.body);
      const updated = await storage.upsertResume(req.user!.id, data);
      return res.json(updated);
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  // POST /api/resume/upload — upload a PDF/DOCX file for the file view
  app.post("/api/resume/upload", requireAuth as any, resumeUpload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded or unsupported file type (PDF/DOCX only)" });
    }
    const fileUrl = `/uploads/resumes/${req.file.filename}`;
    const updated = await storage.upsertResume(req.user!.id, {
      fileUrl,
      fileName:        req.file.originalname,
      fileContentType: req.file.mimetype,
    });
    return res.json({ fileUrl, fileName: req.file.originalname, resume: updated });
  });

  // ── Search — proxied to nexus-search when configured ──────────────────
  // GET /api/search?q=...&tags=...&limit=20
  // When NEXUS_SEARCH_URL is set, proxies to nexus-search /v1/search (BM25 +
  // fuzzy fallback + Jaccard tag filter). Falls back to full project list.

  app.get("/api/search", async (req, res) => {
    if (NEXUS_SEARCH_URL) {
      const { status, data } = await proxyToSearchService("GET", "/v1/search", req);
      return res.status(status).json(data);
    }
    // Fallback: return all published projects
    const list = await storage.getProjects();
    return res.json(list);
  });

  // ── Projects — Public READ ─────────────────────────────────────────────
  // When NEXUS_SEARCH_URL is configured, list + detail reads are proxied to
  // the nexus-search service for BM25-powered filtering + cache-aside.

  app.get("/api/projects", async (req, res) => {
    if (NEXUS_SEARCH_URL) {
      const { status, data } = await proxyToSearchService("GET", "/v1/projects", req);
      return res.status(status).json(data);
    }
    const list = await storage.getProjects();
    return res.json(list);
  });

  app.get("/api/projects/:id", async (req, res) => {
    if (NEXUS_SEARCH_URL) {
      const { status, data } = await proxyToSearchService("GET", `/v1/projects/${req.params.id}`, req);
      return res.status(status).json(data);
    }
    const project = await storage.getProject(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    return res.json(project);
  });

  // GET /api/projects/:id/related — BFS tag-graph recommendations via nexus-search
  app.get("/api/projects/:id/related", async (req, res) => {
    if (NEXUS_SEARCH_URL) {
      const { status, data } = await proxyToSearchService(
        "GET", `/v1/projects/${req.params.id}/related`, req
      );
      return res.status(status).json(data);
    }
    return res.status(503).json({ message: "NEXUS_SEARCH_URL not configured" });
  });

  // ── Projects — Admin WRITE ─────────────────────────────────────────────

  app.post("/api/projects", requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(data);
      pubsub.publish("project:created", project);
      return res.status(201).json(project);
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  app.patch("/api/projects/:id", requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const existing = await storage.getProject(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      const data = insertProjectSchema.partial().parse(req.body);
      const updated = await storage.updateProject(req.params.id as string, data);
      pubsub.publish("project:updated", updated);
      return res.json(updated);
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  app.delete("/api/projects/:id", requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
    const deleted = await storage.deleteProject(req.params.id as string);
    if (!deleted) return res.status(404).json({ message: "Project not found" });
    pubsub.publish("project:deleted", { id: req.params.id });
    return res.json({ message: "Project deleted" });
  });

  // ── Bookings ──────────────────────────────────────────────────────────
  // When NEXUS_BOOKING_URL is configured, requests are proxied to the
  // standalone nexus-booking microservice (auth header forwarded for admin
  // endpoints). When absent, the monolith storage is used as a fallback.

  app.get("/api/bookings", requireAdmin as any, async (req, res) => {
    if (NEXUS_BOOKING_URL) {
      const { status, data } = await proxyToBookingService("GET", "/v1/bookings", req);
      return res.status(status).json(data);
    }
    const list = await storage.getBookings();
    return res.json(list);
  });

  app.post("/api/bookings", async (req, res) => {
    if (NEXUS_BOOKING_URL) {
      try {
        const body = insertBookingSchema.parse(req.body);
        const { status, data } = await proxyToBookingService("POST", "/v1/bookings", req, body);
        if (status === 201) pubsub.publish("booking:created", data);
        return res.status(status).json(data);
      } catch (e) {
        const { status, body } = zodErr(e);
        return res.status(status).json(body);
      }
    }
    try {
      const data = insertBookingSchema.parse(req.body);
      const booking = await storage.createBooking(data);
      pubsub.publish("booking:created", booking);

      // Fire-and-forget email notifications (monolith path only)
      const cfg = await getEmailConfig();
      if (cfg?.enabled) {
        if (cfg.sendUserConfirmation) {
          sendBookingConfirmationToUser(booking).catch(() => {});
        }
        if (cfg.sendAdminNotification) {
          sendBookingNotificationToAdmin(booking).catch(() => {});
        }
      }

      return res.status(201).json(booking);
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  app.get("/api/bookings/:id", async (req, res) => {
    if (NEXUS_BOOKING_URL) {
      const { status, data } = await proxyToBookingService("GET", `/v1/bookings/${req.params.id}`, req);
      return res.status(status).json(data);
    }
    return res.status(404).json({ message: "Not found" });
  });

  app.patch("/api/bookings/:id", requireAdmin as any, async (req, res) => {
    if (NEXUS_BOOKING_URL) {
      const { status, data } = await proxyToBookingService("PATCH", `/v1/bookings/${req.params.id}`, req, req.body);
      return res.status(status).json(data);
    }
    return res.status(404).json({ message: "Not found" });
  });

  app.delete("/api/bookings/:id", requireAdmin as any, async (req, res) => {
    if (NEXUS_BOOKING_URL) {
      const { status, data } = await proxyToBookingService("DELETE", `/v1/bookings/${req.params.id}`, req);
      return res.status(status).json(data);
    }
    return res.status(404).json({ message: "Not found" });
  });

  // ── Inquiries ──────────────────────────────────────────────────────────

  app.get("/api/inquiries", requireAdmin as any, async (_req, res) => {
    const list = await storage.getInquiries();
    return res.json(list);
  });

  app.post("/api/inquiries", async (req, res) => {
    try {
      const data = insertInquirySchema.parse(req.body);
      const inquiry = await storage.createInquiry(data);
      pubsub.publish("inquiry:created", inquiry);
      return res.status(201).json(inquiry);
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  app.patch("/api/inquiries/:id/resolve", requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
    const { response } = req.body;
    if (!response) return res.status(400).json({ message: "Response is required" });
    const updated = await storage.resolveInquiry(req.params.id as string, response);
    if (!updated) return res.status(404).json({ message: "Inquiry not found" });
    return res.json(updated);
  });

  // ── Settings ─────────────────────────────────────────────────────────────

  // GET  /api/settings          — get current user's settings (auto-create on first access)
  app.get("/api/settings", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    let s = await storage.getUserSettings(userId);
    if (!s) {
      s = await storage.upsertUserSettings(userId, {});
    }
    return res.json(s);
  });

  // PATCH /api/settings          — update current user's settings
  app.patch("/api/settings", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const data = updateUserSettingsSchema.parse(req.body);
      const updated = await storage.upsertUserSettings(userId, data);
      return res.json(updated);
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  // GET  /api/settings/email-config  — admin: get email configuration
  app.get("/api/settings/email-config", requireAdmin as any, async (_req, res) => {
    let cfg = await storage.getEmailConfig();
    if (!cfg) {
      cfg = await storage.upsertEmailConfig({});
    }
    return res.json(cfg);
  });

  // PATCH /api/settings/email-config  — admin: update email configuration
  app.patch("/api/settings/email-config", requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = updateEmailConfigSchema.parse(req.body);
      const updated = await storage.upsertEmailConfig(data);
      return res.json(updated);
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  // POST /api/settings/change-password  — authenticated user changes their own password
  app.post("/api/settings/change-password", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "currentPassword and newPassword are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }
    const user = await storage.getUser(req.user!.id);
    if (!user || user.password !== hashPassword(currentPassword)) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    await storage.updateUserPassword(user.id, hashPassword(newPassword));
    return res.json({ message: "Password updated successfully" });
  });

  // POST /api/settings/test-email  — admin: send a test email
  app.post("/api/settings/test-email", requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
    const { to } = req.body;
    if (!to) return res.status(400).json({ message: "to (email address) is required" });
    const result = await sendTestEmail(to);
    if (!result.success) {
      return res.status(500).json({ message: result.error ?? "Failed to send test email", mode: result.mode });
    }
    return res.json({ message: "Test email sent", mode: result.mode, messageId: result.messageId });
  });

  // ── Admin Dashboard ────────────────────────────────────────────────────

  app.get("/api/admin/stats", requireAdmin as any, async (_req, res) => {
    const [projects, bookings, inquiries] = await Promise.all([
      storage.getProjects(),
      storage.getBookings(),
      storage.getInquiries(),
    ]);
    return res.json({
      totalProjects: projects.length,
      publishedProjects: projects.filter(p => p.published).length,
      totalBookings: bookings.length,
      pendingBookings: bookings.filter(b => b.status === "confirmed").length,
      totalInquiries: inquiries.length,
      openInquiries: inquiries.filter(i => !i.resolved).length,
    });
  });

  // ── User Corp-Role Management ─────────────────────────────────────────────
  app.patch("/api/users/role", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email, corpRoleId } = req.body as { email: string; corpRoleId: number };
      if (!email || typeof corpRoleId !== "number" || corpRoleId < 1 || corpRoleId > 8) {
        return res.status(400).json({ message: "email and corpRoleId (1–8) are required" });
      }
      const [updated] = await db
        .update(users)
        .set({ corpRoleId })
        .where(eq(users.email, email))
        .returning();
      if (!updated) return res.status(404).json({ message: "User not found" });
      return res.json({ id: updated.id, email: updated.email, corpRoleId: updated.corpRoleId });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Test Dashboard ───────────────────────────────────────────────────────
  // Returns cached results from the last vitest run (reads test-results/unit-results.json)
  app.get("/api/tests/results", (_req: Request, res: Response) => {
    const result = loadCachedResults();
    if (!result) {
      return res.json({
        runAt: null,
        status: "no-results",
        suites: [],
        summary: { total: 0, pass: 0, fail: 0, skip: 0, passRate: 0 },
        message: "No test results found. Run tests first.",
      });
    }
    return res.json(result);
  });

  // Triggers a fresh vitest run and streams the final JSON back when done.
  // Note: can take 5-10 seconds. The UI should poll /api/tests/results while this runs.
  app.post("/api/tests/run", async (_req: Request, res: Response) => {
    try {
      const result = await runTests();
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ status: "error", error: err.message });
    }
  });

  // ── Corporate Role Hierarchy ──────────────────────────────────────────────

  // GET /api/corp-roles — list all 8 corporate roles (mirrors: nexus auth roles)
  app.get("/api/corp-roles", requireAuth as any, async (_req, res) => {
    return res.json(CORP_ROLE_SEED);
  });

  // ── Data Ratings ──────────────────────────────────────────────────────────

  // GET /api/data-ratings — list all 7 data-rating tiers (mirrors: nexus data ratings)
  app.get("/api/data-ratings", requireAuth as any, async (_req, res) => {
    return res.json(DATA_RATING_SEED);
  });

  // GET /api/data-ratings/check?rating=X — check if the caller can access a given rating
  // (mirrors: nexus data check --rating X)
  app.get("/api/data-ratings/check", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    const { rating } = req.query as { rating?: string };
    if (!rating) return res.status(400).json({ message: "rating query parameter is required" });

    const RATING_ORDER = ["G", "PG", "PG-13", "R", "NC-17", "Unrated", "None"];
    if (!RATING_ORDER.includes(rating)) {
      return res.status(400).json({ message: `Invalid rating '${rating}'. Valid values: ${RATING_ORDER.join(", ")}` });
    }

    // Get caller's corp role
    const caller = await storage.getUser(req.user!.id);
    const roleId = caller?.corpRoleId ?? 1;
    const role   = CORP_ROLE_SEED.find(r => r.id === roleId) ?? CORP_ROLE_SEED[0];

    const userRatingIdx    = RATING_ORDER.indexOf(role.dataRating);
    const requestedRatingIdx = RATING_ORDER.indexOf(rating);
    const permitted = userRatingIdx >= requestedRatingIdx;

    return res.json({
      permitted,
      role:           role.name,
      roleLevel:      role.level,
      yourRating:     role.dataRating,
      requestedRating: rating,
      message: permitted
        ? `Access granted. Your rating (${role.dataRating}) covers ${rating}.`
        : `Access denied. ${rating} requires a higher role. You have: ${role.dataRating}.`,
    });
  });

  // ── AI / ML Endpoints ─────────────────────────────────────────────────────

  // Lightweight deterministic AI helpers (no external ML dependency)
  function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  }

  function textToVector(text: string, dim = 64): number[] {
    const tokens = tokenize(text);
    const vec = new Array<number>(dim).fill(0);
    for (const token of tokens) {
      let hash = 5381;
      for (let i = 0; i < token.length; i++) {
        hash = ((hash << 5) + hash) + token.charCodeAt(i);
        hash = hash & 0x7fffffff;
      }
      vec[hash % dim] += 1;
    }
    // L2 normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => Math.round((v / norm) * 1e6) / 1e6);
  }

  function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot   += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB)));
  }

  const AI_CLASSES = [
    { label: "infrastructure.devops",  keywords: ["docker", "kubernetes", "k8s", "ci", "cd", "deploy", "pipeline", "terraform", "helm", "nginx"] },
    { label: "backend.api",           keywords: ["api", "rest", "graphql", "endpoint", "server", "route", "handler", "express", "fastapi", "hono"] },
    { label: "auth.security",         keywords: ["auth", "jwt", "token", "login", "password", "rbac", "permission", "role", "oauth", "session"] },
    { label: "data.pipeline",         keywords: ["kafka", "stream", "queue", "event", "outbox", "pipeline", "pubsub", "consumer", "producer"] },
    { label: "ml.transformer",        keywords: ["transformer", "attention", "bert", "embedding", "nlp", "model", "train", "classify", "neural"] },
    { label: "observability.tracing", keywords: ["trace", "span", "otel", "opentelemetry", "metrics", "prometheus", "grafana", "logging", "monitor"] },
    { label: "gateway.proxy",         keywords: ["gateway", "proxy", "rate", "limit", "circuit", "breaker", "load", "balancer", "routing"] },
    { label: "document.processing",   keywords: ["ocr", "pdf", "document", "extract", "parse", "text", "image", "form", "invoice", "receipt"] },
  ];

  const MODEL_REGISTRY = [
    {
      id: "nexus-transformer",
      name: "NexusTransformer",
      type: "encoder",
      description: "Pre-LayerNorm BERT-style encoder with MLM pre-training. Built from scratch.",
      architecture: { layers: 6, heads: 8, dim: 512, ff_dim: 2048, vocab_size: 32000, max_seq: 512, params: "~25M" },
      status: "available",
    },
    {
      id: "nexus-classifier",
      name: "NexusClassifier",
      type: "classifier",
      description: "Lightweight classification head on top of NexusTransformer.",
      architecture: { layers: 4, heads: 4, dim: 256, num_classes: 8, params: "~8M" },
      status: "available",
    },
    {
      id: "nexus-embedder",
      name: "NexusEmbedder",
      type: "embedding",
      description: "Sentence embedding model via mean-pool over encoder outputs.",
      architecture: { dim: 512, pooling: "mean", params: "~25M" },
      status: "available",
    },
  ];

  // POST /api/ai/classify — proxied to nexus-ai when NEXUS_AI_URL is set
  app.post("/api/ai/classify", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    if (NEXUS_AI_URL) {
      const { status, data } = await proxyToAiService("POST", "/v1/ai/classify", req, req.body);
      return res.status(status).json(data);
    }
    // Local fallback: heuristic keyword classifier
    const { text } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ message: "text is required and must be non-empty" });
    }
    const tokens = new Set(tokenize(text));
    const scored = AI_CLASSES.map(cls => {
      const matches = cls.keywords.filter(k => tokens.has(k)).length;
      const score   = matches / cls.keywords.length + (Math.random() * 0.05);
      return { label: cls.label, score };
    });
    const total  = scored.reduce((s, c) => s + c.score, 0) || 1;
    const probs  = scored.map(c => ({ ...c, score: Math.round(c.score / total * 10000) / 10000 }));
    probs.sort((a, b) => b.score - a.score);
    const best   = probs[0];
    const scores = Object.fromEntries(probs.map(p => [p.label, p.score]));
    return res.json({ label: best.label, confidence: best.score, scores });
  });

  // POST /api/ai/embed — proxied to nexus-ai when NEXUS_AI_URL is set
  app.post("/api/ai/embed", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    if (NEXUS_AI_URL) {
      const { status, data } = await proxyToAiService("POST", "/v1/ai/embed", req, req.body);
      return res.status(status).json(data);
    }
    // Local fallback
    const { text } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ message: "text is required and must be non-empty" });
    }
    const embedding = textToVector(text, 128);
    return res.json({ embedding, dimensions: embedding.length, model: "nexus-embedder" });
  });

  // POST /api/ai/similarity — proxied to nexus-ai when NEXUS_AI_URL is set
  app.post("/api/ai/similarity", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    if (NEXUS_AI_URL) {
      const { status, data } = await proxyToAiService("POST", "/v1/ai/similarity", req, req.body);
      return res.status(status).json(data);
    }
    // Local fallback
    const { text_a, text_b } = req.body;
    if (!text_a || !text_b) {
      return res.status(400).json({ message: "text_a and text_b are required" });
    }
    if (text_a.trim() === text_b.trim()) {
      return res.json({ similarity: 1.0, interpretation: "identical" });
    }
    const vecA = textToVector(text_a, 128);
    const vecB = textToVector(text_b, 128);
    const sim  = Math.round(cosineSimilarity(vecA, vecB) * 10000) / 10000;
    const interpretation =
      sim > 0.97 ? "identical"    :
      sim > 0.85 ? "very_similar" :
      sim > 0.70 ? "similar"      :
      sim > 0.50 ? "related"      : "dissimilar";
    return res.json({ similarity: sim, interpretation });
  });

  // POST /api/ai/fill-mask — proxied to nexus-ai; no local fallback
  app.post("/api/ai/fill-mask", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    if (NEXUS_AI_URL) {
      const { status, data } = await proxyToAiService("POST", "/v1/ai/fill-mask", req, req.body);
      return res.status(status).json(data);
    }
    return res.status(503).json({ message: "NEXUS_AI_URL not configured" });
  });

  // GET /api/ai/status — proxied to nexus-ai when NEXUS_AI_URL is set
  app.get("/api/ai/status", requireAuth as any, async (req, res) => {
    if (NEXUS_AI_URL) {
      const { status, data } = await proxyToAiService("GET", "/v1/ai/status", req);
      return res.status(status).json(data);
    }
    return res.json({ model_loaded: false, device: "cpu", note: "NEXUS_AI_URL not configured" });
  });

  // GET /api/ai/models — proxied to nexus-ai; falls back to local registry
  app.get("/api/ai/models", requireAuth as any, async (req, res) => {
    if (NEXUS_AI_URL) {
      const { status, data } = await proxyToAiService("GET", "/v1/ai/models", req);
      return res.status(status).json(data);
    }
    return res.json(MODEL_REGISTRY);
  });

  // GET /api/ai/models/:id — model details (local registry fallback only)
  app.get("/api/ai/models/:id", requireAuth as any, async (req, res) => {
    const model = MODEL_REGISTRY.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ message: `Model '${req.params.id}' not found` });
    return res.json(model);
  });

  // ── Meta / API Discovery ──────────────────────────────────────────────────

  // GET /api/meta/endpoints — list all registered API routes (mirrors: nexus api endpoints)
  app.get("/api/meta/endpoints", requireAuth as any, async (_req, res) => {
    const endpoints = [
      { method: "POST",   path: "/api/auth/login",                  auth: false,   description: "Authenticate and receive JWT token" },
      { method: "POST",   path: "/api/auth/register",               auth: false,   description: "Register a new user account" },
      { method: "GET",    path: "/api/auth/me",                     auth: true,    description: "Get current authenticated user" },
      { method: "GET",    path: "/api/projects",                    auth: false,   description: "List all portfolio projects" },
      { method: "GET",    path: "/api/projects/:id",                auth: false,   description: "Get a project by ID" },
      { method: "POST",   path: "/api/projects",                    auth: true,    description: "Create a new portfolio project" },
      { method: "PATCH",  path: "/api/projects/:id",                auth: true,    description: "Update a project" },
      { method: "DELETE", path: "/api/projects/:id",                auth: true,    description: "Delete a project" },
      { method: "GET",    path: "/api/bookings",                    auth: true,    description: "List all bookings (admin)" },
      { method: "POST",   path: "/api/bookings",                    auth: false,   description: "Create a booking" },
      { method: "GET",    path: "/api/inquiries",                   auth: true,    description: "List all inquiries (admin)" },
      { method: "POST",   path: "/api/inquiries",                   auth: false,   description: "Submit an inquiry" },
      { method: "PATCH",  path: "/api/inquiries/:id/resolve",       auth: true,    description: "Resolve an inquiry" },
      { method: "GET",    path: "/api/settings",                    auth: true,    description: "Get user settings" },
      { method: "PATCH",  path: "/api/settings",                    auth: true,    description: "Update user settings" },
      { method: "GET",    path: "/api/settings/email-config",       auth: true,    description: "Get email configuration (admin)" },
      { method: "PATCH",  path: "/api/settings/email-config",       auth: true,    description: "Update email configuration (admin)" },
      { method: "POST",   path: "/api/settings/change-password",    auth: true,    description: "Change own password" },
      { method: "POST",   path: "/api/settings/test-email",         auth: true,    description: "Send test email (admin)" },
      { method: "GET",    path: "/api/admin/stats",                 auth: true,    description: "Dashboard statistics (admin)" },
      { method: "PATCH",  path: "/api/users/role",                  auth: true,    description: "Update user's corporate role (admin)" },
      { method: "GET",    path: "/api/corp-roles",                  auth: true,    description: "List all 8 corporate roles" },
      { method: "GET",    path: "/api/data-ratings",                auth: true,    description: "List all 7 data-rating tiers" },
      { method: "GET",    path: "/api/data-ratings/check",          auth: true,    description: "Check if caller can access a rating" },
      { method: "POST",   path: "/api/ai/classify",                 auth: true,    description: "Classify text using the transformer" },
      { method: "POST",   path: "/api/ai/embed",                    auth: true,    description: "Generate sentence embedding vector" },
      { method: "POST",   path: "/api/ai/similarity",               auth: true,    description: "Cosine similarity between two texts" },
      { method: "GET",    path: "/api/ai/models",                   auth: true,    description: "List model registry" },
      { method: "GET",    path: "/api/ai/models/:id",               auth: true,    description: "Get model details by ID" },
      { method: "GET",    path: "/api/meta/endpoints",              auth: true,    description: "List all API endpoints (this endpoint)" },
      { method: "GET",    path: "/api/tests/results",               auth: false,   description: "Get cached test results" },
      { method: "POST",   path: "/api/tests/run",                   auth: false,   description: "Trigger a fresh test run" },
    ];
    return res.json(endpoints);
  });

  // ── Tax Assistant ─────────────────────────────────────────────────────────

  // Seed initial data and start annual scheduler
  const TAX_YEAR = new Date().getFullYear() - 1; // most recent completed tax year
  await seedTaxData(TAX_YEAR);
  initTaxScheduler().catch(console.error);

  // ── Portfolio gateway proxy → nexus-tax microservice ──────────────────────
  //
  // When NEXUS_TAX_URL is set (e.g. "http://localhost:8003"), all /api/tax/*
  // requests are forwarded to the standalone nexus-tax service at
  //   /v1/tax/* (mapping: /api/tax/foo → /v1/tax/foo)
  //
  // When NEXUS_TAX_URL is not set, requests fall through to the direct
  // handlers below (monolith-embedded implementation).
  const NEXUS_TAX_URL = process.env.NEXUS_TAX_URL?.replace(/\/$/, "");
  if (NEXUS_TAX_URL) {
    app.all("/api/tax/*", async (req: Request, res: Response) => {
      const subPath = req.path.replace(/^\/api\/tax/, "");
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      const targetUrl = `${NEXUS_TAX_URL}/v1/tax${subPath}${qs}`;
      try {
        const upstream = await fetch(targetUrl, {
          method: req.method,
          headers: {
            "Content-Type": "application/json",
            ...(req.headers.authorization ? { Authorization: req.headers.authorization as string } : {}),
          },
          body: ["GET", "HEAD", "DELETE"].includes(req.method) ? undefined : JSON.stringify(req.body),
        });
        const body = await upstream.text();
        res.status(upstream.status);
        res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
        return res.send(body);
      } catch (err) {
        console.error("nexus-tax proxy error:", err);
        return res.status(502).json({ message: "nexus-tax service unavailable", nexusTaxUrl: NEXUS_TAX_URL });
      }
    });
  }

  // GET /api/tax/periods
  app.get("/api/tax/periods", async (_req, res) => {
    try {
      const periods = await storage.getTaxPeriods();
      return res.json(periods);
    } catch (e) { return res.status(500).json({ message: "Failed to fetch tax periods" }); }
  });

  // GET /api/tax/forms/federal?category=individual
  app.get("/api/tax/forms/federal", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const forms = await storage.getFederalForms(category);
      return res.json(forms);
    } catch (e) { return res.status(500).json({ message: "Failed to fetch federal forms" }); }
  });

  // GET /api/tax/forms/federal/:formNumber
  app.get("/api/tax/forms/federal/:formNumber", async (req, res) => {
    try {
      const form = await storage.getFederalForm(decodeURIComponent(req.params.formNumber));
      if (!form) return res.status(404).json({ message: "Form not found" });
      return res.json(form);
    } catch (e) { return res.status(500).json({ message: "Failed to fetch form" }); }
  });

  // GET /api/tax/forms/state?code=CA
  app.get("/api/tax/forms/state", async (req, res) => {
    try {
      const code = req.query.code as string | undefined;
      const forms = await storage.getStateForms(code);
      return res.json(forms);
    } catch (e) { return res.status(500).json({ message: "Failed to fetch state forms" }); }
  });

  // GET /api/tax/rates/:year — brackets + deductions + special rates
  app.get("/api/tax/rates/:year", async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      if (isNaN(year)) return res.status(400).json({ message: "Invalid year" });
      const filingStatus = req.query.filingStatus as string | undefined;
      const [brackets, deductions, special] = await Promise.all([
        storage.getTaxBrackets(year, filingStatus),
        storage.getStandardDeductions(year),
        storage.getSpecialRates(year),
      ]);
      return res.json({ taxYear: year, brackets, standardDeductions: deductions, specialRates: special });
    } catch (e) { return res.status(500).json({ message: "Failed to fetch tax rates" }); }
  });

  // GET /api/tax/questions
  app.get("/api/tax/questions", async (_req, res) => {
    try {
      const questions = await storage.getTaxQuestions();
      return res.json(questions);
    } catch (e) { return res.status(500).json({ message: "Failed to fetch questions" }); }
  });

  // POST /api/tax/sessions — start a new questionnaire session
  app.post("/api/tax/sessions", async (req, res) => {
    try {
      const { taxYear, entityType } = req.body;
      const year = taxYear ?? TAX_YEAR;
      const session = await storage.createSession({ taxYear: year, entityType: entityType ?? "individual", answers: {}, requiredForms: null, status: "in_progress" });
      return res.status(201).json(session);
    } catch (e) { return res.status(500).json({ message: "Failed to create session" }); }
  });

  // GET /api/tax/sessions/:id
  app.get("/api/tax/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) return res.status(404).json({ message: "Session not found" });
      return res.json(session);
    } catch (e) { return res.status(500).json({ message: "Failed to fetch session" }); }
  });

  // PATCH /api/tax/sessions/:id/answers — save answers progressively
  app.patch("/api/tax/sessions/:id/answers", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) return res.status(404).json({ message: "Session not found" });
      const merged = { ...(session.answers as Record<string, unknown>), ...req.body.answers };
      const updated = await storage.updateSession(req.params.id, merged);
      return res.json(updated);
    } catch (e) { return res.status(500).json({ message: "Failed to update answers" }); }
  });

  // POST /api/tax/sessions/:id/complete — compute required forms and mark complete
  app.post("/api/tax/sessions/:id/complete", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const answers = session.answers as Record<string, string>;
      const allRules = await storage.getFormRules();
      const allFederalForms = await storage.getFederalForms();
      const stateCode = answers.state_of_residence as string | undefined;
      const stateFormsData = stateCode ? await storage.getStateForms(stateCode) : [];

      // Evaluate rules against answers
      const matched: Array<{ formSource: string; formNumber: string; priority: string; note: string | null; formDetails?: unknown }> = [];
      const seen = new Set<string>();

      for (const rule of allRules) {
        const val = answers[rule.questionKey];
        if (!val) continue;
        const matches = rule.questionValue === "*" ? !!val : val === rule.questionValue;
        if (!matches) continue;
        const key = `${rule.formSource}:${rule.formNumber}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const formDetails = rule.formSource === "federal"
          ? allFederalForms.find(f => f.formNumber === rule.formNumber)
          : stateFormsData.find(f => f.formNumber === rule.formNumber);
        matched.push({ formSource: rule.formSource, formNumber: rule.formNumber, priority: rule.priority, note: rule.note, formDetails });
      }

      // Add state form if applicable
      if (stateFormsData.length > 0 && !seen.has(`state:${stateFormsData[0].formNumber}`)) {
        const sf = stateFormsData[0];
        if (sf.hasIncomeTax) {
          matched.push({ formSource: "state", formNumber: sf.formNumber, priority: "required", note: `${sf.stateName} residents must file ${sf.title}.`, formDetails: sf });
        }
      }

      // Sort: required → likely → maybe
      const ORDER: Record<string, number> = { required: 0, likely: 1, maybe: 2 };
      matched.sort((a, b) => (ORDER[a.priority] ?? 3) - (ORDER[b.priority] ?? 3));

      const completed = await storage.completeSession(req.params.id, matched);
      return res.json(completed);
    } catch (e) {
      console.error("complete session error:", e);
      return res.status(500).json({ message: "Failed to compute required forms" });
    }
  });

  // POST /api/tax/admin/seed-year — admin trigger to seed a specific tax year
  app.post("/api/tax/admin/seed-year", requireAdmin as any, async (req, res) => {
    try {
      const { taxYear } = req.body;
      if (!taxYear || isNaN(parseInt(taxYear))) return res.status(400).json({ message: "taxYear required" });
      await seedTaxData(parseInt(taxYear));
      return res.json({ message: `Tax year ${taxYear} seeded successfully.` });
    } catch (e) { return res.status(500).json({ message: "Seed failed" }); }
  });

  // ── API Gateway — Sub-App Registry ────────────────────────────────────────
  //
  // Exposes a unified registry of the four standalone NexusConsult microservices
  // and provides parallel health checking + transparent HTTP proxying.
  //
  // Routes:
  //   GET  /api/apps                    — list all registered sub-apps
  //   GET  /api/apps/:name              — single sub-app metadata
  //   GET  /api/apps/:name/health       — live health check for one sub-app
  //   GET  /api/apps/health             — parallel health check for all sub-apps
  //   GET  /api/apps/:name/openapi      — proxy to sub-app's OpenAPI spec
  //   ANY  /api/apps/:name/proxy/*      — transparent HTTP proxy to sub-app

  // GET /api/apps — health-enriched registry (parallel health checks)
  app.get("/api/apps", async (_req, res) => {
    try {
      const results = await checkAllHealth();
      recordHealthSnapshot(results);   // persist to in-memory history buffer
      return res.json(results);
    } catch (e) {
      console.error("gateway /api/apps error:", e);
      return res.status(500).json({ message: "Gateway registry unavailable" });
    }
  });

  // GET /api/apps/health — parallel health check (same as /api/apps but
  // semantically explicit; registered before /:name to avoid shadowing)
  app.get("/api/apps/health", async (_req, res) => {
    try {
      const results = await checkAllHealth();
      recordHealthSnapshot(results);
      return res.json(results);
    } catch (e) {
      console.error("gateway health-all error:", e);
      return res.status(500).json({ message: "Health check failed" });
    }
  });

  // GET /api/apps/health/history — in-memory circular buffer of health snapshots
  // NOTE: must be registered before /:name to avoid being shadowed
  app.get("/api/apps/health/history", (_req, res) => {
    return res.json(getHealthHistory());
  });

  // GET /api/apps/:name — single sub-app with live health + endpoint list
  app.get("/api/apps/:name", async (req, res) => {
    const registry = buildRegistry();
    const app2 = registry.find((a) => a.name === req.params.name);
    if (!app2) return res.status(404).json({ message: `Sub-app '${req.params.name}' not found` });
    try {
      const result = await checkHealth(app2);
      return res.json(result); // includes all SubAppInfo fields + status + latencyMs + endpoints
    } catch (e) {
      console.error(`gateway /:name error [${req.params.name}]:`, e);
      return res.json({ ...app2, status: "unhealthy" });
    }
  });

  // GET /api/apps/:name/health — health check for one sub-app
  app.get("/api/apps/:name/health", async (req, res) => {
    const registry = buildRegistry();
    const app2 = registry.find((a) => a.name === req.params.name);
    if (!app2) return res.status(404).json({ message: `Sub-app '${req.params.name}' not found` });
    try {
      const result = await checkHealth(app2);
      const statusCode = result.status === "healthy" ? 200 : 503;
      return res.status(statusCode).json(result);
    } catch (e) {
      console.error(`gateway health error [${req.params.name}]:`, e);
      return res.status(503).json({ name: req.params.name, status: "unhealthy" });
    }
  });

  // GET /api/apps/:name/openapi — TTL-cached OpenAPI spec from sub-app
  app.get("/api/apps/:name/openapi", async (req, res) => {
    const registry = buildRegistry();
    const app2 = registry.find((a) => a.name === req.params.name);
    if (!app2) return res.status(404).json({ message: `Sub-app '${req.params.name}' not found` });
    const { hit, data, status } = await getCachedOpenApi(app2);
    res.setHeader("X-Cache", hit ? "HIT" : "MISS");
    res.setHeader("Content-Type", "application/json");
    return res.status(status).json(data);
  });

  // ANY /api/apps/:name/proxy/... — transparent HTTP proxy to sub-app
  // app.use() avoids path-to-regexp wildcard issues with named params + bare `*`
  // in newer Express/path-to-regexp versions.
  app.use("/api/apps/:name/proxy", async (req: Request, res: Response) => {
    const registry = buildRegistry();
    const name = req.params.name as string;
    const app2 = registry.find((a) => a.name === name);
    if (!app2) return res.status(404).json({ message: `Sub-app '${name}' not found` });

    // req.path is relative to the mount point; append query string
    const subPath = req.path || "/";
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";

    try {
      await proxyToSubApp(app2, req, res, `${subPath}${qs}`);
    } catch (e) {
      console.error(`gateway proxy error [${name}]:`, e);
      if (!res.headersSent) {
        return res.status(503).json({ message: `${name} service unavailable` });
      }
    }
  });

  return httpServer;
}