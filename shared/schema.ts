import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, pgEnum, integer, serial, jsonb, numeric, doublePrecision } from "drizzle-orm/pg-core";
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

// ── User Settings ──────────────────────────────────────────────────────────
// One row per user, created on first access via upsert.
export const userSettings = pgTable("user_settings", {
  id:        serial("id").primaryKey(),
  userId:    varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),

  // Profile
  displayName:  text("display_name"),
  bio:          text("bio"),
  avatarUrl:    text("avatar_url"),
  githubUrl:    text("github_url"),
  linkedinUrl:  text("linkedin_url"),
  websiteUrl:   text("website_url"),
  timezone:     text("timezone").notNull().default("UTC"),
  language:     text("language").notNull().default("en"),

  // Appearance
  theme:            text("theme").notNull().default("dark"),
  compactMode:      boolean("compact_mode").notNull().default(false),
  sidebarCollapsed: boolean("sidebar_collapsed").notNull().default(false),

  // Notification preferences
  emailNotifications:    boolean("email_notifications").notNull().default(true),
  notifyBookingConfirm:  boolean("notify_booking_confirm").notNull().default(true),
  notifyNewBooking:      boolean("notify_new_booking").notNull().default(true),
  notifyNewInquiry:      boolean("notify_new_inquiry").notNull().default(true),
  notifyProjectUpdates:  boolean("notify_project_updates").notNull().default(false),
  notifyWeeklyDigest:    boolean("notify_weekly_digest").notNull().default(false),
  notifySecurityAlerts:  boolean("notify_security_alerts").notNull().default(true),

  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({ id: true, updatedAt: true });
export const updateUserSettingsSchema = insertUserSettingsSchema.partial().omit({ userId: true });
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UpdateUserSettings = z.infer<typeof updateUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;

// ── Email Configuration ────────────────────────────────────────────────────
// Single admin-controlled row for SMTP / email provider configuration.
export const emailConfig = pgTable("email_config", {
  id:           serial("id").primaryKey(),

  // SMTP credentials
  smtpHost:     text("smtp_host").notNull().default(""),
  smtpPort:     integer("smtp_port").notNull().default(587),
  smtpSecure:   boolean("smtp_secure").notNull().default(false),
  smtpUser:     text("smtp_user").notNull().default(""),
  smtpPassword: text("smtp_password").notNull().default(""),

  // Sender identity
  fromName:     text("from_name").notNull().default("NexusConsult"),
  fromEmail:    text("from_email").notNull().default("noreply@nexusconsult.dev"),

  // Routing
  adminEmail:   text("admin_email").notNull().default("admin@nexusconsult.dev"),
  replyTo:      text("reply_to"),

  // Feature toggles
  enabled:                boolean("enabled").notNull().default(false),
  sendUserConfirmation:   boolean("send_user_confirmation").notNull().default(true),
  sendAdminNotification:  boolean("send_admin_notification").notNull().default(true),

  // Social / branding links embedded in email templates
  githubUrl:    text("github_url").notNull().default("https://github.com/itkdaniel"),
  linkedinUrl:  text("linkedin_url").notNull().default("https://linkedin.com/in/itkdaniel"),
  websiteUrl:   text("website_url").notNull().default("https://nexusconsult.dev"),

  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEmailConfigSchema = createInsertSchema(emailConfig).omit({ id: true, updatedAt: true });
export const updateEmailConfigSchema = insertEmailConfigSchema.partial();
export type InsertEmailConfig = z.infer<typeof insertEmailConfigSchema>;
export type UpdateEmailConfig = z.infer<typeof updateEmailConfigSchema>;
export type EmailConfig = typeof emailConfig.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// TAX ASSISTANT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// ── Tax Periods ─────────────────────────────────────────────────────────────
// One row per tax year; auto-seeded each January.
export const taxPeriods = pgTable("tax_periods", {
  id:           serial("id").primaryKey(),
  taxYear:      integer("tax_year").notNull().unique(),       // e.g. 2024
  filingDeadline: text("filing_deadline").notNull(),          // "April 15, 2025"
  extensionDeadline: text("extension_deadline").notNull(),    // "October 15, 2025"
  status:       text("status").notNull().default("active"),   // active | upcoming | closed
  notes:        text("notes"),
  seededAt:     timestamp("seeded_at").notNull().defaultNow(),
});

export const insertTaxPeriodSchema = createInsertSchema(taxPeriods).omit({ id: true, seededAt: true });
export type InsertTaxPeriod = z.infer<typeof insertTaxPeriodSchema>;
export type TaxPeriod = typeof taxPeriods.$inferSelect;

// ── Federal Forms ────────────────────────────────────────────────────────────
export const federalForms = pgTable("federal_forms", {
  id:              serial("id").primaryKey(),
  formNumber:      text("form_number").notNull(),             // "1040", "Schedule C"
  title:           text("title").notNull(),
  description:     text("description").notNull(),
  category:        text("category").notNull(),                // individual | business | employer | informational | payment
  subcategory:     text("subcategory"),                       // income | deduction | credit | etc.
  whoFiles:        text("who_files").notNull(),               // "Taxpayer" | "Employer" | "Financial institution" etc.
  providedBy:      text("provided_by"),                       // null=taxpayer completes; otherwise the entity that sends it
  filingMethods:   text("filing_methods").array().notNull().default(sql`'{}'::text[]`), // ["mail","efile"]
  irsUrl:          text("irs_url"),                           // Link to IRS form page
  instructionsUrl: text("instructions_url"),                  // Link to IRS instructions
  isActive:        boolean("is_active").notNull().default(true),
  firstTaxYear:    integer("first_tax_year"),                 // Year form became applicable
  lastTaxYear:     integer("last_tax_year"),                  // null = still in use
  sortOrder:       integer("sort_order").notNull().default(0),
});

export const insertFederalFormSchema = createInsertSchema(federalForms).omit({ id: true });
export type InsertFederalForm = z.infer<typeof insertFederalFormSchema>;
export type FederalForm = typeof federalForms.$inferSelect;

// ── State Forms ───────────────────────────────────────────────────────────────
export const stateForms = pgTable("state_forms", {
  id:              serial("id").primaryKey(),
  stateCode:       text("state_code").notNull(),              // "CA", "NY", "TX"
  stateName:       text("state_name").notNull(),
  formNumber:      text("form_number").notNull(),
  title:           text("title").notNull(),
  description:     text("description").notNull(),
  category:        text("category").notNull(),
  whoFiles:        text("who_files").notNull(),
  providedBy:      text("provided_by"),
  filingMethods:   text("filing_methods").array().notNull().default(sql`'{}'::text[]`),
  stateWebUrl:     text("state_web_url"),
  hasIncomeTax:    boolean("has_income_tax").notNull().default(true),
  isActive:        boolean("is_active").notNull().default(true),
});

export const insertStateFormSchema = createInsertSchema(stateForms).omit({ id: true });
export type InsertStateForm = z.infer<typeof insertStateFormSchema>;
export type StateForm = typeof stateForms.$inferSelect;

// ── Tax Brackets ─────────────────────────────────────────────────────────────
// Each row is one bracket band for a given year + filing status.
export const taxBrackets = pgTable("tax_brackets", {
  id:            serial("id").primaryKey(),
  taxYear:       integer("tax_year").notNull(),
  filingStatus:  text("filing_status").notNull(),             // single | mfj | mfs | hoh | qw
  rate:          doublePrecision("rate").notNull(),           // 0.10, 0.12 … 0.37
  incomeFrom:    numeric("income_from", { precision: 12, scale: 2 }).notNull(),
  incomeTo:      numeric("income_to",   { precision: 12, scale: 2 }),  // null = no upper limit
});

export const insertTaxBracketSchema = createInsertSchema(taxBrackets).omit({ id: true });
export type InsertTaxBracket = z.infer<typeof insertTaxBracketSchema>;
export type TaxBracket = typeof taxBrackets.$inferSelect;

// ── Standard Deductions ──────────────────────────────────────────────────────
export const standardDeductions = pgTable("standard_deductions", {
  id:               serial("id").primaryKey(),
  taxYear:          integer("tax_year").notNull(),
  filingStatus:     text("filing_status").notNull(),          // single | mfj | mfs | hoh | qw
  baseAmount:       numeric("base_amount", { precision: 10, scale: 2 }).notNull(),
  age65Addition:    numeric("age65_addition", { precision: 10, scale: 2 }).notNull().default("0"), // per qualifying person
  blindAddition:    numeric("blind_addition",  { precision: 10, scale: 2 }).notNull().default("0"),
});

export const insertStandardDeductionSchema = createInsertSchema(standardDeductions).omit({ id: true });
export type InsertStandardDeduction = z.infer<typeof insertStandardDeductionSchema>;
export type StandardDeduction = typeof standardDeductions.$inferSelect;

// ── Special Tax Rates ────────────────────────────────────────────────────────
// FICA, SE, capital gains, AMT, NIIT, etc. — one row per rate type per year.
export const specialTaxRates = pgTable("special_tax_rates", {
  id:          serial("id").primaryKey(),
  taxYear:     integer("tax_year").notNull(),
  rateType:    text("rate_type").notNull(),                   // ss_employee | medicare_employee | se_tax | net_investment | amt | cap_gains_0 | cap_gains_15 | cap_gains_20
  filingStatus: text("filing_status"),                        // null = applies to all
  rate:        doublePrecision("rate").notNull(),
  wageBase:    numeric("wage_base", { precision: 12, scale: 2 }), // SS wage base; null if not applicable
  thresholdFrom: numeric("threshold_from", { precision: 12, scale: 2 }),
  thresholdTo:   numeric("threshold_to",   { precision: 12, scale: 2 }),
  description: text("description").notNull(),
});

export const insertSpecialTaxRateSchema = createInsertSchema(specialTaxRates).omit({ id: true });
export type InsertSpecialTaxRate = z.infer<typeof insertSpecialTaxRateSchema>;
export type SpecialTaxRate = typeof specialTaxRates.$inferSelect;

// ── Questionnaire Questions ───────────────────────────────────────────────────
export const taxQuestions = pgTable("tax_questions", {
  id:           serial("id").primaryKey(),
  questionKey:  text("question_key").notNull().unique(),      // "filing_status", "has_w2", etc.
  category:     text("category").notNull(),                   // identity | income | deductions | credits | special
  questionText: text("question_text").notNull(),
  helpText:     text("help_text"),
  inputType:    text("input_type").notNull(),                 // single_choice | multi_choice | yes_no | state_select | number
  options:      jsonb("options"),                             // [{value, label, helpText?}]
  isRequired:   boolean("is_required").notNull().default(true),
  dependsOnKey: text("depends_on_key"),                      // only show if this question was answered
  dependsOnVal: text("depends_on_val"),                      // with this value
  sortOrder:    integer("sort_order").notNull().default(0),
  appliesToIndividual: boolean("applies_to_individual").notNull().default(true),
  appliesToBusiness:   boolean("applies_to_business").notNull().default(false),
});

export const insertTaxQuestionSchema = createInsertSchema(taxQuestions).omit({ id: true });
export type InsertTaxQuestion = z.infer<typeof insertTaxQuestionSchema>;
export type TaxQuestion = typeof taxQuestions.$inferSelect;

// ── Form Requirement Rules ────────────────────────────────────────────────────
// Maps a (questionKey=value) trigger to one or more required forms.
export const formRequirementRules = pgTable("form_requirement_rules", {
  id:            serial("id").primaryKey(),
  questionKey:   text("question_key").notNull(),
  questionValue: text("question_value").notNull(),            // value that triggers this rule; "*" = any non-false
  formSource:    text("form_source").notNull(),               // "federal" | "state"
  formNumber:    text("form_number").notNull(),
  priority:      text("priority").notNull().default("required"), // required | likely | maybe
  note:          text("note"),                                // extra context shown to user
});

export const insertFormRequirementRuleSchema = createInsertSchema(formRequirementRules).omit({ id: true });
export type InsertFormRequirementRule = z.infer<typeof insertFormRequirementRuleSchema>;
export type FormRequirementRule = typeof formRequirementRules.$inferSelect;

// ── Questionnaire Sessions ────────────────────────────────────────────────────
export const questionnaireSessions = pgTable("questionnaire_sessions", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taxYear:     integer("tax_year").notNull(),
  entityType:  text("entity_type").notNull().default("individual"),   // individual | business
  answers:     jsonb("answers").notNull().default(sql`'{}'::jsonb`),  // {questionKey: value}
  requiredForms: jsonb("required_forms"),                             // computed on completion
  status:      text("status").notNull().default("in_progress"),       // in_progress | completed
  startedAt:   timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertSessionSchema = createInsertSchema(questionnaireSessions).omit({ id: true, startedAt: true, completedAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type QuestionnaireSession = typeof questionnaireSessions.$inferSelect;
