import { eq, desc, and } from "drizzle-orm";
import { db } from "./db";
import {
  users, projects, bookings, inquiries, userSettings, emailConfig, resumes,
  type User, type InsertUser, type UpdateProfile,
  type Project, type InsertProject,
  type Booking, type InsertBooking,
  type Inquiry, type InsertInquiry,
  type UserSettings, type InsertUserSettings, type UpdateUserSettings,
  type EmailConfig, type UpdateEmailConfig,
  type Resume, type UpdateResume,
  taxPeriods, federalForms, stateForms, taxBrackets, standardDeductions,
  specialTaxRates, taxQuestions, formRequirementRules, questionnaireSessions,
  type TaxPeriod, type FederalForm, type StateForm, type TaxBracket,
  type StandardDeduction, type SpecialTaxRate, type TaxQuestion,
  type FormRequirementRule, type QuestionnaireSession, type InsertSession,
} from "@shared/schema";
import { encryptField, decryptField } from "./crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: string, hashedPassword: string): Promise<User | undefined>;
  updateUserProfile(id: string, data: UpdateProfile): Promise<User | undefined>;

  getResume(userId: string): Promise<Resume | undefined>;
  upsertResume(userId: string, data: UpdateResume): Promise<Resume>;

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

  // Tax Assistant
  getTaxPeriods(): Promise<TaxPeriod[]>;
  getTaxPeriod(taxYear: number): Promise<TaxPeriod | undefined>;
  getFederalForms(category?: string): Promise<FederalForm[]>;
  getFederalForm(formNumber: string): Promise<FederalForm | undefined>;
  getStateForms(stateCode?: string): Promise<StateForm[]>;
  getTaxBrackets(taxYear: number, filingStatus?: string): Promise<TaxBracket[]>;
  getStandardDeductions(taxYear: number): Promise<StandardDeduction[]>;
  getSpecialRates(taxYear: number): Promise<SpecialTaxRate[]>;
  getTaxQuestions(): Promise<TaxQuestion[]>;
  getFormRules(): Promise<FormRequirementRule[]>;
  createSession(data: InsertSession): Promise<QuestionnaireSession>;
  getSession(id: string): Promise<QuestionnaireSession | undefined>;
  updateSession(id: string, answers: Record<string, unknown>, requiredForms?: unknown): Promise<QuestionnaireSession | undefined>;
  completeSession(id: string, requiredForms: unknown): Promise<QuestionnaireSession | undefined>;
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

  async updateUserProfile(id: string, data: UpdateProfile) {
    const toStore: Partial<typeof users.$inferInsert> = {};
    if (data.fullName   !== undefined) toStore.fullName   = data.fullName;
    if (data.bio        !== undefined) toStore.bio        = data.bio;
    if (data.position   !== undefined) toStore.position   = data.position;
    if (data.profilePictureUrl !== undefined) toStore.profilePictureUrl = data.profilePictureUrl;
    if (data.mobile     !== undefined) toStore.mobile     = data.mobile   ? encryptField(data.mobile)   : data.mobile;
    if (data.location   !== undefined) toStore.location   = data.location ? encryptField(data.location) : data.location;
    const [u] = await db.update(users).set(toStore).where(eq(users.id, id)).returning();
    if (!u) return u;
    return this._decryptUser(u);
  }

  private _decryptUser(u: User): User {
    return {
      ...u,
      mobile:   u.mobile   ? decryptField(u.mobile)   : u.mobile,
      location: u.location ? decryptField(u.location) : u.location,
    };
  }

  async getResume(userId: string) {
    const [r] = await db.select().from(resumes).where(eq(resumes.userId, userId));
    return r;
  }

  async upsertResume(userId: string, data: UpdateResume): Promise<Resume> {
    const existing = await this.getResume(userId);
    if (existing) {
      const [updated] = await db
        .update(resumes)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(resumes.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(resumes)
      .values({ userId, sections: data.sections ?? [], ...data })
      .returning();
    return created;
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

  // ── Tax Assistant ──────────────────────────────────────────────────────────

  async getTaxPeriods() {
    return db.select().from(taxPeriods).orderBy(desc(taxPeriods.taxYear));
  }

  async getTaxPeriod(taxYear: number) {
    const [p] = await db.select().from(taxPeriods).where(eq(taxPeriods.taxYear, taxYear));
    return p;
  }

  async getFederalForms(category?: string) {
    if (category) {
      return db.select().from(federalForms)
        .where(and(eq(federalForms.isActive, true), eq(federalForms.category, category)))
        .orderBy(federalForms.sortOrder);
    }
    return db.select().from(federalForms)
      .where(eq(federalForms.isActive, true))
      .orderBy(federalForms.sortOrder);
  }

  async getFederalForm(formNumber: string) {
    const [f] = await db.select().from(federalForms).where(eq(federalForms.formNumber, formNumber));
    return f;
  }

  async getStateForms(stateCode?: string) {
    if (stateCode) {
      return db.select().from(stateForms)
        .where(and(eq(stateForms.isActive, true), eq(stateForms.stateCode, stateCode)));
    }
    return db.select().from(stateForms).where(eq(stateForms.isActive, true));
  }

  async getTaxBrackets(taxYear: number, filingStatus?: string) {
    if (filingStatus) {
      return db.select().from(taxBrackets)
        .where(and(eq(taxBrackets.taxYear, taxYear), eq(taxBrackets.filingStatus, filingStatus)));
    }
    return db.select().from(taxBrackets).where(eq(taxBrackets.taxYear, taxYear));
  }

  async getStandardDeductions(taxYear: number) {
    return db.select().from(standardDeductions).where(eq(standardDeductions.taxYear, taxYear));
  }

  async getSpecialRates(taxYear: number) {
    return db.select().from(specialTaxRates).where(eq(specialTaxRates.taxYear, taxYear));
  }

  async getTaxQuestions() {
    return db.select().from(taxQuestions).orderBy(taxQuestions.sortOrder);
  }

  async getFormRules() {
    return db.select().from(formRequirementRules);
  }

  async createSession(data: InsertSession) {
    const [s] = await db.insert(questionnaireSessions).values(data).returning();
    return s;
  }

  async getSession(id: string) {
    const [s] = await db.select().from(questionnaireSessions).where(eq(questionnaireSessions.id, id));
    return s;
  }

  async updateSession(id: string, answers: Record<string, unknown>, requiredForms?: unknown) {
    const [s] = await db
      .update(questionnaireSessions)
      .set({ answers, ...(requiredForms !== undefined ? { requiredForms } : {}) })
      .where(eq(questionnaireSessions.id, id))
      .returning();
    return s;
  }

  async completeSession(id: string, requiredForms: unknown) {
    const [s] = await db
      .update(questionnaireSessions)
      .set({ status: "completed", requiredForms, completedAt: new Date() })
      .where(eq(questionnaireSessions.id, id))
      .returning();
    return s;
  }
}

export const storage = new DatabaseStorage();