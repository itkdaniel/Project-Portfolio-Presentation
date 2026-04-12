import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import {
  users, projects, bookings, inquiries, userSettings, emailConfig,
  type User, type InsertUser,
  type Project, type InsertProject,
  type Booking, type InsertBooking,
  type Inquiry, type InsertInquiry,
  type UserSettings, type InsertUserSettings, type UpdateUserSettings,
  type EmailConfig, type UpdateEmailConfig,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: string, hashedPassword: string): Promise<User | undefined>;

  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  getBookings(): Promise<Booking[]>;
  createBooking(booking: InsertBooking): Promise<Booking>;

  getInquiries(): Promise<Inquiry[]>;
  createInquiry(inquiry: InsertInquiry): Promise<Inquiry>;
  resolveInquiry(id: string, response: string): Promise<Inquiry | undefined>;

  // Settings
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  upsertUserSettings(userId: string, data: UpdateUserSettings): Promise<UserSettings>;

  // Email Config (admin)
  getEmailConfig(): Promise<EmailConfig | undefined>;
  upsertEmailConfig(data: UpdateEmailConfig): Promise<EmailConfig>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u;
  }
  async getUserByUsername(username: string) {
    const [u] = await db.select().from(users).where(eq(users.username, username));
    return u;
  }
  async getUserByEmail(email: string) {
    const [u] = await db.select().from(users).where(eq(users.email, email));
    return u;
  }
  async createUser(data: InsertUser) {
    const [u] = await db.insert(users).values(data).returning();
    return u;
  }
  async updateUserPassword(id: string, hashedPassword: string) {
    const [u] = await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id)).returning();
    return u;
  }

  async getProjects() {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }
  async getProject(id: string) {
    const [p] = await db.select().from(projects).where(eq(projects.id, id));
    return p;
  }
  async createProject(data: InsertProject) {
    const [p] = await db.insert(projects).values(data).returning();
    return p;
  }
  async updateProject(id: string, data: Partial<InsertProject>) {
    const [p] = await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    return p;
  }
  async deleteProject(id: string) {
    const r = await db.delete(projects).where(eq(projects.id, id)).returning();
    return r.length > 0;
  }

  async getBookings() {
    return db.select().from(bookings).orderBy(desc(bookings.createdAt));
  }
  async createBooking(data: InsertBooking) {
    const [b] = await db.insert(bookings).values(data).returning();
    return b;
  }

  async getInquiries() {
    return db.select().from(inquiries).orderBy(desc(inquiries.createdAt));
  }
  async createInquiry(data: InsertInquiry) {
    const [i] = await db.insert(inquiries).values(data).returning();
    return i;
  }
  async resolveInquiry(id: string, response: string) {
    const [i] = await db.update(inquiries).set({ response, resolved: true }).where(eq(inquiries.id, id)).returning();
    return i;
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async getUserSettings(userId: string) {
    const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    return s;
  }

  async upsertUserSettings(userId: string, data: UpdateUserSettings): Promise<UserSettings> {
    const existing = await this.getUserSettings(userId);
    if (existing) {
      const [updated] = await db
        .update(userSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userSettings.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(userSettings)
      .values({ userId, ...data })
      .returning();
    return created;
  }

  // ── Email Config ──────────────────────────────────────────────────────────

  async getEmailConfig(): Promise<EmailConfig | undefined> {
    const [cfg] = await db.select().from(emailConfig).limit(1);
    return cfg;
  }

  async upsertEmailConfig(data: UpdateEmailConfig): Promise<EmailConfig> {
    const existing = await this.getEmailConfig();
    if (existing) {
      const [updated] = await db
        .update(emailConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(emailConfig.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(emailConfig)
      .values(data as any)
      .returning();
    return created;
  }
}

export const storage = new DatabaseStorage();