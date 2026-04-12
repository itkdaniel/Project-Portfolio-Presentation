/**
 * NexusAuth — JWT + RBAC Authentication Microservice
 * Entry point: starts the Hono HTTP server
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { sessionsRouter } from "./routes/sessions";
import { healthRouter } from "./routes/health";
import { errorHandler } from "./middleware/error";
import { rateLimiter } from "./middleware/ratelimit";

const app = new Hono();

// ── Global middleware ──────────────────────────────────────────────────────
app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", cors({
  origin: process.env.CORS_ORIGINS?.split(",") ?? ["*"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  exposeHeaders: ["X-Request-ID", "X-Rate-Limit-Remaining"],
}));
app.use("/auth/*", rateLimiter({ max: 20, windowS: 60 }));
app.use("*", errorHandler());

// ── Routes ─────────────────────────────────────────────────────────────────
app.route("/auth",     authRouter);
app.route("/users",    usersRouter);
app.route("/sessions", sessionsRouter);
app.route("/",         healthRouter);

// ── 404 catch-all ──────────────────────────────────────────────────────────
app.notFound((c) => c.json({ message: "Not found" }, 404));

// ── Start server ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3001", 10);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[nexusauth] server running on port ${info.port}`);
  console.log(`[nexusauth] env: ${process.env.NODE_ENV ?? "development"}`);
});

export default app;
