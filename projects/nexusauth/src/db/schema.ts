/**
 * Drizzle ORM schema for NexusAuth
 */

import {
  pgTable, varchar, text, boolean, timestamp,
  serial, inet, pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// ── Role enum ──────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("user_role", [
  "viewer", "user", "moderator", "admin", "superadmin",
]);

// ── Users ──────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id:          varchar("id", { length: 26 }).primaryKey()
                 .default(sql`gen_random_uuid()`),
  email:       varchar("email", { length: 255 }).notNull().unique(),
  password:    varchar("password", { length: 255 }).notNull(),
  role:        roleEnum("role").notNull().default("user"),
  displayName: text("display_name"),
  verified:    boolean("verified").notNull().default(false),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ── Sessions (refresh tokens) ──────────────────────────────────────────────

export const sessions = pgTable("sessions", {
  id:           varchar("id", { length: 26 }).primaryKey()
                  .default(sql`gen_random_uuid()`),
  userId:       varchar("user_id", { length: 26 }).notNull()
                  .references(() => users.id, { onDelete: "cascade" }),
  refreshToken: varchar("refresh_token", { length: 255 }).notNull().unique(),
  deviceHash:   varchar("device_hash", { length: 64 }),
  ipAddress:    text("ip_address"),
  expiresAt:    timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt:    timestamp("revoked_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Session = typeof sessions.$inferSelect;

// ── Audit log ──────────────────────────────────────────────────────────────

export const auditLog = pgTable("audit_log", {
  id:        serial("id").primaryKey(),
  userId:    varchar("user_id", { length: 26 }).references(() => users.id, { onDelete: "set null" }),
  action:    varchar("action", { length: 64 }).notNull(),
  ipAddress: text("ip_address"),
  metadata:  text("metadata"),  // JSON stringified
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
