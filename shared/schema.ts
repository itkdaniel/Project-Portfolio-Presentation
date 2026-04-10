import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, pgEnum, integer, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const projectStatusEnum = pgEnum("project_status", ["active", "archived", "draft"]);

// ── Corporate Role Hierarchy ───────────────────────────────────────────────
// IDs 1–8, ascending privilege.  type_id=8 (creator) has zero restrictions.
export const corpRoles = pgTable("corp_roles", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull().unique(),        // e.g. "user", "worker"
  displayName: text("display_name").notNull(),         // e.g. "User", "Worker / Developer"
  level:       integer("level").notNull().unique(),    // 1 = lowest, 8 = creator
  dataRating:  text("data_rating").notNull(),          // G | PG | PG-13 | R | NC-17 | Unrated | None
  description: text("description").notNull(),
});

export const insertCorpRoleSchema = createInsertSchema(corpRoles).omit({ id: true });
export type InsertCorpRole = z.infer<typeof insertCorpRoleSchema>;
export type CorpRole = typeof corpRoles.$inferSelect;

// ── Data Ratings ───────────────────────────────────────────────────────────
// Defines what sources/data each rating tier may scrape and train on.
export const dataRatings = pgTable("data_ratings", {
  id:             serial("id").primaryKey(),
  code:           text("code").notNull().unique(),      // G, PG, PG-13, R, NC-17, Unrated, None
  name:           text("name").notNull(),
  description:    text("description").notNull(),
  allowedSources: text("allowed_sources").array().notNull().default(sql`'{}'::text[]`),
  dockerAiHint:   text("docker_ai_hint"),               // Linguistic hint for docker AI engine
});

export const insertDataRatingSchema = createInsertSchema(dataRatings).omit({ id: true });
export type InsertDataRating = z.infer<typeof insertDataRatingSchema>;
export type DataRating = typeof dataRatings.$inferSelect;

// ── Users ──────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id:         varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username:   text("username").notNull().unique(),
  email:      text("email").notNull().unique(),
  password:   text("password").notNull(),
  role:       userRoleEnum("role").notNull().default("user"),
  corpRoleId: integer("corp_role_id").default(1),      // FK → corp_roles.id
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ── Projects ───────────────────────────────────────────────────────────────
export const projects = pgTable("projects", {
  id:                varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name:              text("name").notNull(),
  description:       text("description").notNull(),
  longDescription:   text("long_description"),
  type:              text("type").notNull(),
  tags:              text("tags").array().notNull().default(sql`'{}'::text[]`),
  imageUrl:          text("image_url"),
  githubUrl:         text("github_url"),
  runCommand:        text("run_command"),
  testCommand:       text("test_command"),
  usageInstructions: text("usage_instructions"),
  downloadUrl:       text("download_url"),
  sandboxUrl:        text("sandbox_url"),
  demoApiEndpoint:   text("demo_api_endpoint"),
  status:            projectStatusEnum("status").notNull().default("active"),
  published:         boolean("published").notNull().default(true),
  featured:          boolean("featured").notNull().default(false),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// ── Bookings ───────────────────────────────────────────────────────────────
export const bookings = pgTable("bookings", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name:        text("name").notNull(),
  email:       text("email").notNull(),
  company:     text("company"),
  meetingType: text("meeting_type").notNull().default("discovery"),
  details:     text("details").notNull(),
  date:        text("date").notNull(),
  time:        text("time").notNull(),
  status:      text("status").notNull().default("confirmed"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookings)
  .omit({ id: true, status: true, createdAt: true })
  .extend({ email: z.string().email("Invalid email address") });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

// ── Inquiries ──────────────────────────────────────────────────────────────
export const inquiries = pgTable("inquiries", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  message:   text("message").notNull(),
  response:  text("response"),
  resolved:  boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInquirySchema = createInsertSchema(inquiries)
  .omit({ id: true, response: true, resolved: true, createdAt: true })
  .extend({ message: z.string().min(1, "Message cannot be empty") });
export type InsertInquiry = z.infer<typeof insertInquirySchema>;
export type Inquiry = typeof inquiries.$inferSelect;
