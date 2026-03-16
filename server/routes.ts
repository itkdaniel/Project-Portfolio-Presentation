import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { pubsub } from "./pubsub";
import { insertProjectSchema, insertBookingSchema, insertInquirySchema } from "@shared/schema";
import { ZodError } from "zod";

function handleZodError(error: unknown) {
  if (error instanceof ZodError) {
    return { status: 400, body: { message: "Validation failed", errors: error.errors } };
  }
  return { status: 500, body: { message: "Internal server error" } };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  pubsub.attach(httpServer);

  // ── Projects CRUD ──────────────────────────────────────────────

  app.get("/api/projects", async (_req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const data = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(data);
      pubsub.publish("project:created", project);
      res.status(201).json(project);
    } catch (error) {
      const { status, body } = handleZodError(error);
      res.status(status).json(body);
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const existing = await storage.getProject(req.params.id);
      if (!existing) return res.status(404).json({ message: "Project not found" });

      const data = insertProjectSchema.partial().parse(req.body);
      const updated = await storage.updateProject(req.params.id, data);
      pubsub.publish("project:updated", updated);
      res.json(updated);
    } catch (error) {
      const { status, body } = handleZodError(error);
      res.status(status).json(body);
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    const deleted = await storage.deleteProject(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Project not found" });
    pubsub.publish("project:deleted", { id: req.params.id });
    res.json({ message: "Project deleted" });
  });

  // ── Bookings ───────────────────────────────────────────────────

  app.get("/api/bookings", async (_req, res) => {
    const bookingsList = await storage.getBookings();
    res.json(bookingsList);
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const data = insertBookingSchema.parse(req.body);
      const booking = await storage.createBooking(data);
      pubsub.publish("booking:created", booking);
      res.status(201).json(booking);
    } catch (error) {
      const { status, body } = handleZodError(error);
      res.status(status).json(body);
    }
  });

  // ── Inquiries ──────────────────────────────────────────────────

  app.get("/api/inquiries", async (_req, res) => {
    const list = await storage.getInquiries();
    res.json(list);
  });

  app.post("/api/inquiries", async (req, res) => {
    try {
      const data = insertInquirySchema.parse(req.body);
      const inquiry = await storage.createInquiry(data);
      pubsub.publish("inquiry:created", inquiry);
      res.status(201).json(inquiry);
    } catch (error) {
      const { status, body } = handleZodError(error);
      res.status(status).json(body);
    }
  });

  app.patch("/api/inquiries/:id/resolve", async (req, res) => {
    const { response } = req.body;
    if (!response) return res.status(400).json({ message: "Response is required" });
    const updated = await storage.resolveInquiry(req.params.id, response);
    if (!updated) return res.status(404).json({ message: "Inquiry not found" });
    res.json(updated);
  });

  return httpServer;
}