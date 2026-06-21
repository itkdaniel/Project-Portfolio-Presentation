import { eq, desc, and, sql } from "drizzle-orm";
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
  notifications, userNotificationPrefs, scopeRequests,
  type Notification, type InsertNotification,
  type UserNotificationPrefs, type InsertNotifPrefs, type UpdateNotifPrefs,
  type ScopeRequest, type InsertScopeRequest, type UpdateScopeRequest,
  entityTypes, entities, entityRelations, scrapeJobs, scrapeSources,
  type EntityType, type InsertEntityType,
  type Entity, type InsertEntity,
  type EntityRelation, type InsertEntityRelation,
  type ScrapeJob, type InsertScrapeJob,
  type ScrapeSource, type InsertScrapeSource,
  grantedScopes,
  type GrantedScope, type InsertGrantedScope,
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

  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(data: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string, userId: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;
  deleteNotification(id: string, userId: string): Promise<boolean>;
  clearReadNotifications(userId: string): Promise<void>;

  // Notification prefs
  getNotifPrefs(userId: string): Promise<UserNotificationPrefs | undefined>;
  upsertNotifPrefs(userId: string, data: UpdateNotifPrefs): Promise<UserNotificationPrefs>;

  // Scope requests
  getScopeRequests(status?: string): Promise<(ScopeRequest & { username?: string | null; email?: string | null; fullName?: string | null })[]>;
  getScopeRequestsByUser(userId: string): Promise<ScopeRequest[]>;
  getScopeRequest(id: string): Promise<ScopeRequest | undefined>;
  createScopeRequest(data: InsertScopeRequest): Promise<ScopeRequest>;
  reviewScopeRequest(id: string, reviewedBy: string | null, data: UpdateScopeRequest): Promise<ScopeRequest | undefined>;

  // Entity database (NexusScraper)
  getEntityTypes(): Promise<EntityType[]>;
  getEntities(opts?: { limit?: number; offset?: number; type?: string; source?: string }): Promise<{ total: number; items: Entity[] }>;
  getEntity(id: string): Promise<(Entity & { relations: EntityRelation[] }) | undefined>;
  createEntity(data: InsertEntity): Promise<Entity>;
  getEntityRelations(fromEntityId: string): Promise<EntityRelation[]>;
  createEntityRelation(data: InsertEntityRelation): Promise<EntityRelation>;
  getScrapeJobs(opts?: { limit?: number; offset?: number }): Promise<{ total: number; items: ScrapeJob[] }>;
  getScrapeJob(id: string): Promise<ScrapeJob | undefined>;
  createScrapeJob(data: InsertScrapeJob): Promise<ScrapeJob>;
  updateScrapeJob(id: string, data: Partial<InsertScrapeJob>): Promise<ScrapeJob | undefined>;
  getScrapeSources(): Promise<ScrapeSource[]>;
  createScrapeSource(data: InsertScrapeSource): Promise<ScrapeSource>;

  // Granted scopes (AI access control)
  getGrantedScopes(userId: string): Promise<GrantedScope[]>;
  hasGrantedScope(userId: string, scope: string): Promise<boolean>;
  grantScope(data: InsertGrantedScope): Promise<GrantedScope>;
  revokeScope(userId: string, scope: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  private _decryptUser(u: User): User {
    try {
      return {
        ...u,
        mobile:   u.mobile   ? decryptField(u.mobile)   : u.mobile,
        location: u.location ? decryptField(u.location) : u.location,
      };
    } catch {
      // If decryption fails (e.g., plaintext stored before encryption was added), return raw
      return u;
    }
  }

  async getUser(id: string) {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u ? this._decryptUser(u) : u;
  }
  async getUserByUsername(username: string) {
    const [u] = await db.select().from(users).where(eq(users.username, username));
    return u ? this._decryptUser(u) : u;
  }
  async getUserByEmail(email: string) {
    const [u] = await db.select().from(users).where(eq(users.email, email));
    return u ? this._decryptUser(u) : u;
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

  // ── Notifications ──────────────────────────────────────────────────────────

  async getNotifications(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [n] = await db.insert(notifications).values(data).returning();
    return n;
  }

  async markNotificationRead(id: string, userId: string): Promise<Notification | undefined> {
    const [n] = await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return n;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.userId, userId));
  }

  async deleteNotification(id: string, userId: string): Promise<boolean> {
    const r = await db
      .delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return r.length > 0;
  }

  async clearReadNotifications(userId: string): Promise<void> {
    await db
      .delete(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, true)));
  }

  // ── Notification prefs ─────────────────────────────────────────────────────

  async getNotifPrefs(userId: string): Promise<UserNotificationPrefs | undefined> {
    const [p] = await db
      .select()
      .from(userNotificationPrefs)
      .where(eq(userNotificationPrefs.userId, userId));
    return p;
  }

  async upsertNotifPrefs(userId: string, data: UpdateNotifPrefs): Promise<UserNotificationPrefs> {
    const existing = await this.getNotifPrefs(userId);
    if (existing) {
      const [updated] = await db
        .update(userNotificationPrefs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userNotificationPrefs.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(userNotificationPrefs)
      .values({ userId, ...data })
      .returning();
    return created;
  }

  // ── Scope requests ─────────────────────────────────────────────────────────

  async getScopeRequests(status?: string) {
    const rows = await db
      .select({
        id:         scopeRequests.id,
        userId:     scopeRequests.userId,
        scopeName:  scopeRequests.scopeName,
        reason:     scopeRequests.reason,
        status:     scopeRequests.status,
        adminNote:  scopeRequests.adminNote,
        reviewedBy: scopeRequests.reviewedBy,
        reviewedAt: scopeRequests.reviewedAt,
        createdAt:  scopeRequests.createdAt,
        username:   users.username,
        email:      users.email,
        fullName:   users.fullName,
      })
      .from(scopeRequests)
      .leftJoin(users, eq(scopeRequests.userId, users.id))
      .orderBy(desc(scopeRequests.createdAt));

    if (status) return rows.filter(r => r.status === status);
    return rows;
  }

  async getScopeRequestsByUser(userId: string): Promise<ScopeRequest[]> {
    return db
      .select()
      .from(scopeRequests)
      .where(eq(scopeRequests.userId, userId))
      .orderBy(desc(scopeRequests.createdAt));
  }

  async getScopeRequest(id: string): Promise<ScopeRequest | undefined> {
    const [r] = await db.select().from(scopeRequests).where(eq(scopeRequests.id, id));
    return r;
  }

  async createScopeRequest(data: InsertScopeRequest): Promise<ScopeRequest> {
    const [r] = await db.insert(scopeRequests).values(data).returning();
    return r;
  }

  async reviewScopeRequest(id: string, reviewedBy: string | null, data: UpdateScopeRequest): Promise<ScopeRequest | undefined> {
    const [r] = await db
      .update(scopeRequests)
      .set({ status: data.status, adminNote: data.adminNote, reviewedBy, reviewedAt: new Date() })
      .where(eq(scopeRequests.id, id))
      .returning();
    return r;
  }

  // ── Entity Database (NexusScraper) ─────────────────────────────────────────

  async getEntityTypes(): Promise<EntityType[]> {
    return db.select().from(entityTypes).orderBy(entityTypes.name);
  }

  async getEntities(opts: { limit?: number; offset?: number; type?: string; source?: string } = {}): Promise<{ total: number; items: Entity[] }> {
    const { limit = 20, offset = 0, type, source } = opts;

    const conditions = [];
    if (type)   conditions.push(eq(entities.type, type));
    if (source) conditions.push(eq(entities.sourceLabel, source));

    const baseQuery = conditions.length > 0
      ? db.select().from(entities).where(and(...conditions))
      : db.select().from(entities);

    const countQuery = conditions.length > 0
      ? db.select({ count: sql<number>`count(*)` }).from(entities).where(and(...conditions))
      : db.select({ count: sql<number>`count(*)` }).from(entities);

    const [countResult, items] = await Promise.all([
      countQuery,
      (conditions.length > 0
        ? db.select().from(entities).where(and(...conditions))
        : db.select().from(entities)
      ).orderBy(desc(entities.scrapedAt)).limit(limit).offset(offset),
    ]);

    return { total: Number(countResult[0]?.count ?? 0), items };
  }

  async getEntity(id: string): Promise<(Entity & { relations: EntityRelation[] }) | undefined> {
    const [entity] = await db.select().from(entities).where(eq(entities.id, id));
    if (!entity) return undefined;
    const relations = await db.select().from(entityRelations).where(eq(entityRelations.fromEntityId, id));
    return { ...entity, relations };
  }

  async createEntity(data: InsertEntity): Promise<Entity> {
    const [e] = await db.insert(entities).values(data).returning();
    return e;
  }

  async getEntityRelations(fromEntityId: string): Promise<EntityRelation[]> {
    return db.select().from(entityRelations).where(eq(entityRelations.fromEntityId, fromEntityId));
  }

  async createEntityRelation(data: InsertEntityRelation): Promise<EntityRelation> {
    const [r] = await db.insert(entityRelations).values(data).returning();
    return r;
  }

  async getScrapeJobs(opts: { limit?: number; offset?: number } = {}): Promise<{ total: number; items: ScrapeJob[] }> {
    const { limit = 20, offset = 0 } = opts;
    const [countResult, items] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(scrapeJobs),
      db.select().from(scrapeJobs).orderBy(desc(scrapeJobs.startedAt)).limit(limit).offset(offset),
    ]);
    return { total: Number(countResult[0]?.count ?? 0), items };
  }

  async getScrapeJob(id: string): Promise<ScrapeJob | undefined> {
    const [j] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id));
    return j;
  }

  async createScrapeJob(data: InsertScrapeJob): Promise<ScrapeJob> {
    const [j] = await db.insert(scrapeJobs).values(data).returning();
    return j;
  }

  async updateScrapeJob(id: string, data: Partial<InsertScrapeJob>): Promise<ScrapeJob | undefined> {
    const [j] = await db.update(scrapeJobs).set(data).where(eq(scrapeJobs.id, id)).returning();
    return j;
  }

  async getScrapeSources(): Promise<ScrapeSource[]> {
    return db.select().from(scrapeSources).where(eq(scrapeSources.isActive, true)).orderBy(scrapeSources.name);
  }

  async createScrapeSource(data: InsertScrapeSource): Promise<ScrapeSource> {
    const [s] = await db.insert(scrapeSources).values(data).returning();
    return s;
  }

  // ── Granted Scopes ─────────────────────────────────────────────────────────

  async getGrantedScopes(userId: string): Promise<GrantedScope[]> {
    return db
      .select()
      .from(grantedScopes)
      .where(
        and(
          eq(grantedScopes.userId, userId),
          sql`revoked_at IS NULL`,
          sql`(expires_at IS NULL OR expires_at > NOW())`,
        ),
      );
  }

  async hasGrantedScope(userId: string, scope: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(grantedScopes)
      .where(
        and(
          eq(grantedScopes.userId, userId),
          eq(grantedScopes.scope, scope),
          sql`revoked_at IS NULL`,
          sql`(expires_at IS NULL OR expires_at > NOW())`,
        ),
      )
      .limit(1);
    return !!row;
  }

  async grantScope(data: InsertGrantedScope): Promise<GrantedScope> {
    const [g] = await db.insert(grantedScopes).values(data).returning();
    return g;
  }

  async revokeScope(userId: string, scope: string): Promise<boolean> {
    const r = await db
      .update(grantedScopes)
      .set({ revokedAt: new Date() })
      .where(and(eq(grantedScopes.userId, userId), eq(grantedScopes.scope, scope), sql`revoked_at IS NULL`))
      .returning();
    return r.length > 0;
  }
}

export const storage = new DatabaseStorage();