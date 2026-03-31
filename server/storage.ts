import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import {
  users, projects, bookings, inquiries,
  type User, type InsertUser,
  type Project, type InsertProject,
  type Booking, type InsertBooking,
  type Inquiry, type InsertInquiry,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

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
  async createUser(data: InsertUser) {
    const [u] = await db.insert(users).values(data).returning();
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
}

export const storage = new DatabaseStorage();