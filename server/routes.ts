import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { pubsub } from "./pubsub";
import { db } from "./db";
import { users } from "@shared/schema";
import {
  insertProjectSchema, insertBookingSchema, insertInquirySchema, loginSchema,
  updateUserSettingsSchema, updateEmailConfigSchema,
} from "@shared/schema";
import { ZodError } from "zod";
import { requireAuth, requireAdmin, generateToken, hashPassword, seedAdminUser, type AuthenticatedRequest } from "./auth";
import { loadCachedResults, runTests } from "./test-runner";
import {
  sendBookingConfirmationToUser,
  sendBookingNotificationToAdmin,
  sendTestEmail,
  getEmailConfig,
} from "./email";

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
      return res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ message: "username, email, and password required" });
      }
      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing) return res.status(409).json({ message: "Email already registered" });

      const [user] = await db.insert(users).values({
        username, email,
        password: hashPassword(password),
        role: "user",
      }).returning();
      const token = generateToken(user.id, user.role);
      return res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  app.get("/api/auth/me", requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
    const [user] = await db.select({ id: users.id, username: users.username, email: users.email, role: users.role })
      .from(users).where(eq(users.id, req.user!.id));
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  });

  // ── Projects — Public READ ─────────────────────────────────────────────

  app.get("/api/projects", async (_req, res) => {
    const list = await storage.getProjects();
    return res.json(list);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    return res.json(project);
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
      const existing = await storage.getProject(req.params.id);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      const data = insertProjectSchema.partial().parse(req.body);
      const updated = await storage.updateProject(req.params.id, data);
      pubsub.publish("project:updated", updated);
      return res.json(updated);
    } catch (e) {
      const { status, body } = zodErr(e);
      return res.status(status).json(body);
    }
  });

  app.delete("/api/projects/:id", requireAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
    const deleted = await storage.deleteProject(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Project not found" });
    pubsub.publish("project:deleted", { id: req.params.id });
    return res.json({ message: "Project deleted" });
  });

  // ── Bookings ──────────────────────────────────────────────────────────

  app.get("/api/bookings", requireAdmin as any, async (_req, res) => {
    const list = await storage.getBookings();
    return res.json(list);
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const data = insertBookingSchema.parse(req.body);
      const booking = await storage.createBooking(data);
      pubsub.publish("booking:created", booking);

      // Fire-and-forget email notifications
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
    const updated = await storage.resolveInquiry(req.params.id, response);
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

  return httpServer;
}