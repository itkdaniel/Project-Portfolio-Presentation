/**
 * Tax Assistant — Seed Data
 * Seeds all federal forms, state forms, tax brackets, standard deductions,
 * special rates, questionnaire questions, and form-requirement rules
 * for a given tax year.  Called on first boot and by the annual scheduler.
 */

import { db } from "./db";
import {
  taxPeriods, federalForms, stateForms, taxBrackets,
  standardDeductions, specialTaxRates, taxQuestions, formRequirementRules,
} from "@shared/schema";
import { eq } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TAX PERIOD
// ─────────────────────────────────────────────────────────────────────────────
export async function seedTaxPeriod(taxYear: number) {
  const existing = await db.select().from(taxPeriods).where(eq(taxPeriods.taxYear, taxYear));
  if (existing.length > 0) return;

  const filingYear = taxYear + 1;
  await db.insert(taxPeriods).values({
    taxYear,
    filingDeadline: `April 15, ${filingYear}`,
    extensionDeadline: `October 15, ${filingYear}`,
    status: "active",
    notes: `Tax Year ${taxYear} — file by April 15, ${filingYear}. Extension available to October 15, ${filingYear}.`,
  });
  console.log(`[tax-seed] Tax period ${taxYear} seeded.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FEDERAL FORMS
// ─────────────────────────────────────────────────────────────────────────────
const FEDERAL_FORMS = [
  // ── Core Individual Returns ──────────────────────────────────────────────
  { formNumber: "1040", sortOrder: 1, category: "individual", subcategory: "return",
    title: "U.S. Individual Income Tax Return",
    description: "Primary federal tax return for U.S. citizens and resident aliens. Reports income, deductions, credits, and tax owed or refund due.",
    whoFiles: "Taxpayer", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040gi" },

  { formNumber: "1040-SR", sortOrder: 2, category: "individual", subcategory: "return",
    title: "U.S. Tax Return for Seniors",
    description: "Simplified version of Form 1040 designed for taxpayers age 65 and older. Features larger print and a chart for standard deductions.",
    whoFiles: "Taxpayer age 65+", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1040-sr",
    instructionsUrl: "https://www.irs.gov/instructions/i1040gi" },

  { formNumber: "1040-NR", sortOrder: 3, category: "individual", subcategory: "return",
    title: "U.S. Nonresident Alien Income Tax Return",
    description: "For nonresident aliens with U.S.-sourced income or engaged in a U.S. trade or business.",
    whoFiles: "Nonresident alien taxpayer", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1040-nr",
    instructionsUrl: "https://www.irs.gov/instructions/i1040nr" },

  { formNumber: "1040-X", sortOrder: 4, category: "individual", subcategory: "return",
    title: "Amended U.S. Individual Income Tax Return",
    description: "Used to correct a previously filed Form 1040, 1040-SR, or 1040-NR. File within 3 years of original due date.",
    whoFiles: "Taxpayer amending a prior return", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1040-x",
    instructionsUrl: "https://www.irs.gov/instructions/i1040x" },

  { formNumber: "1040-ES", sortOrder: 5, category: "individual", subcategory: "payment",
    title: "Estimated Tax for Individuals",
    description: "Used to pay estimated taxes quarterly. Required if you expect to owe at least $1,000 in federal taxes and your withholding won't cover it.",
    whoFiles: "Taxpayer with insufficient withholding", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1040-es",
    instructionsUrl: "https://www.irs.gov/forms-pubs/about-form-1040-es" },

  { formNumber: "1040-V", sortOrder: 6, category: "individual", subcategory: "payment",
    title: "Payment Voucher",
    description: "Voucher to accompany a check or money order payment made with a paper return.",
    whoFiles: "Taxpayer paying by mail", filingMethods: ["mail"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1040-v",
    instructionsUrl: "https://www.irs.gov/forms-pubs/about-form-1040-v" },

  { formNumber: "4868", sortOrder: 7, category: "individual", subcategory: "extension",
    title: "Application for Automatic Extension of Time To File",
    description: "Grants an automatic 6-month extension to file your tax return (to October 15). Does NOT extend time to pay taxes owed.",
    whoFiles: "Taxpayer needing more time to file", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-4868",
    instructionsUrl: "https://www.irs.gov/forms-pubs/about-form-4868" },

  // ── Schedules ────────────────────────────────────────────────────────────
  { formNumber: "Schedule 1", sortOrder: 10, category: "individual", subcategory: "income",
    title: "Additional Income and Adjustments",
    description: "Reports additional income (alimony, business income, capital gains) and adjustments to income (student loan interest, educator expenses, HSA deductions).",
    whoFiles: "Taxpayer with additional income or adjustments", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-1-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040s1" },

  { formNumber: "Schedule 2", sortOrder: 11, category: "individual", subcategory: "taxes",
    title: "Additional Taxes",
    description: "Reports additional taxes: AMT, self-employment tax, household employment taxes, retirement plan penalties, and the net investment income tax.",
    whoFiles: "Taxpayer subject to additional taxes", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-2-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040s2" },

  { formNumber: "Schedule 3", sortOrder: 12, category: "individual", subcategory: "credits",
    title: "Additional Credits and Payments",
    description: "Reports non-refundable credits (foreign tax credit, education credits, child & dependent care) and other payments (estimated tax paid, excess SS tax withheld).",
    whoFiles: "Taxpayer claiming additional credits", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-3-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040s3" },

  { formNumber: "Schedule A", sortOrder: 13, category: "individual", subcategory: "deduction",
    title: "Itemized Deductions",
    description: "Used to itemize deductions instead of taking the standard deduction. Includes medical expenses, state/local taxes (SALT), mortgage interest, and charitable contributions.",
    whoFiles: "Taxpayer itemizing deductions", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-a-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040sca" },

  { formNumber: "Schedule B", sortOrder: 14, category: "individual", subcategory: "income",
    title: "Interest and Ordinary Dividends",
    description: "Required when total taxable interest or ordinary dividends exceed $1,500, or to report foreign accounts and trusts.",
    whoFiles: "Taxpayer with interest/dividend income over $1,500", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-b-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040scb" },

  { formNumber: "Schedule C", sortOrder: 15, category: "individual", subcategory: "income",
    title: "Profit or Loss from Business (Sole Proprietorship)",
    description: "Reports income and expenses from a sole proprietorship or single-member LLC. Determines net profit/loss that flows to Form 1040.",
    whoFiles: "Self-employed / sole proprietor", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040sc" },

  { formNumber: "Schedule D", sortOrder: 16, category: "individual", subcategory: "income",
    title: "Capital Gains and Losses",
    description: "Summarizes capital gains and losses from sales of stocks, bonds, real estate, and other capital assets. References Form 8949 detail.",
    whoFiles: "Taxpayer with capital asset transactions", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-d-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040sd" },

  { formNumber: "Schedule E", sortOrder: 17, category: "individual", subcategory: "income",
    title: "Supplemental Income and Loss",
    description: "Reports rental income/loss, royalties, partnership/S-corp/estate/trust income.",
    whoFiles: "Taxpayer with rental or pass-through income", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-e-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040se" },

  { formNumber: "Schedule F", sortOrder: 18, category: "individual", subcategory: "income",
    title: "Profit or Loss from Farming",
    description: "Reports farming income and expenses.",
    whoFiles: "Farmer taxpayer", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-f-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040sf" },

  { formNumber: "Schedule H", sortOrder: 19, category: "individual", subcategory: "taxes",
    title: "Household Employment Taxes",
    description: "Reports Social Security, Medicare, and federal unemployment taxes for household employees (nannies, housekeepers, etc.).",
    whoFiles: "Household employer", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-h-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040sh" },

  { formNumber: "Schedule R", sortOrder: 20, category: "individual", subcategory: "credit",
    title: "Credit for the Elderly or the Disabled",
    description: "Credit for taxpayers who are 65 or older, or permanently disabled, with limited income.",
    whoFiles: "Elderly or disabled taxpayer", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-r-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040sr" },

  { formNumber: "Schedule SE", sortOrder: 21, category: "individual", subcategory: "taxes",
    title: "Self-Employment Tax",
    description: "Calculates the self-employment (SE) tax owed on net earnings from self-employment. SE tax covers Social Security and Medicare.",
    whoFiles: "Self-employed with net earnings ≥ $400", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-se-form-1040",
    instructionsUrl: "https://www.irs.gov/instructions/i1040sse" },

  // ── Employer-Provided Information Returns ───────────────────────────────
  { formNumber: "W-2", sortOrder: 30, category: "informational", subcategory: "income",
    title: "Wage and Tax Statement",
    description: "Reports wages paid and taxes withheld for each employee. Employers must send to employees by January 31.",
    whoFiles: "Employer", providedBy: "Your employer",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-w-2",
    instructionsUrl: "https://www.irs.gov/instructions/iw2w3" },

  { formNumber: "W-4", sortOrder: 31, category: "individual", subcategory: "withholding",
    title: "Employee's Withholding Certificate",
    description: "Completed by employee to tell employer how much federal income tax to withhold. Submit a new W-4 when your situation changes.",
    whoFiles: "Employee", filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-w-4",
    instructionsUrl: "https://www.irs.gov/forms-pubs/about-form-w-4" },

  { formNumber: "W-7", sortOrder: 32, category: "individual", subcategory: "id",
    title: "Application for IRS Individual Taxpayer Identification Number (ITIN)",
    description: "Used by non-citizens who need a taxpayer ID but are not eligible for a Social Security Number.",
    whoFiles: "Taxpayer without SSN", filingMethods: ["mail"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-w-7",
    instructionsUrl: "https://www.irs.gov/instructions/iw7" },

  // ── 1099 Series ─────────────────────────────────────────────────────────
  { formNumber: "1099-NEC", sortOrder: 40, category: "informational", subcategory: "income",
    title: "Nonemployee Compensation",
    description: "Reports payments of $600+ to non-employees (independent contractors, freelancers). Sent by the payer by January 31.",
    whoFiles: "Payer / client", providedBy: "Your client or payer",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1099-nec",
    instructionsUrl: "https://www.irs.gov/instructions/i1099mec" },

  { formNumber: "1099-MISC", sortOrder: 41, category: "informational", subcategory: "income",
    title: "Miscellaneous Information",
    description: "Reports rents, royalties, prizes, attorney payments, and other miscellaneous income. Payer sends by January 31 (rent) or February 15.",
    whoFiles: "Payer", providedBy: "Payer (landlord, business, etc.)",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1099-misc",
    instructionsUrl: "https://www.irs.gov/instructions/i1099mec" },

  { formNumber: "1099-INT", sortOrder: 42, category: "informational", subcategory: "income",
    title: "Interest Income",
    description: "Reports interest income of $10 or more from banks, credit unions, or other financial institutions.",
    whoFiles: "Financial institution", providedBy: "Your bank or credit union",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1099-int",
    instructionsUrl: "https://www.irs.gov/instructions/i1099int" },

  { formNumber: "1099-DIV", sortOrder: 43, category: "informational", subcategory: "income",
    title: "Dividends and Distributions",
    description: "Reports dividends and distributions of $10 or more from stocks, mutual funds, or other investments.",
    whoFiles: "Broker / financial institution", providedBy: "Your brokerage or mutual fund",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1099-div",
    instructionsUrl: "https://www.irs.gov/instructions/i1099div" },

  { formNumber: "1099-B", sortOrder: 44, category: "informational", subcategory: "income",
    title: "Proceeds from Broker and Barter Exchange Transactions",
    description: "Reports sale of stocks, bonds, and other securities. Needed to complete Schedule D and Form 8949.",
    whoFiles: "Broker", providedBy: "Your brokerage",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1099-b",
    instructionsUrl: "https://www.irs.gov/instructions/i1099b" },

  { formNumber: "1099-R", sortOrder: 45, category: "informational", subcategory: "income",
    title: "Distributions from Pensions, Annuities, Retirement Plans, IRAs",
    description: "Reports distributions from retirement accounts. Determines if distributions are taxable and if early withdrawal penalties apply.",
    whoFiles: "Plan administrator", providedBy: "Your retirement plan administrator",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1099-r",
    instructionsUrl: "https://www.irs.gov/instructions/i1099r" },

  { formNumber: "1099-G", sortOrder: 46, category: "informational", subcategory: "income",
    title: "Certain Government Payments",
    description: "Reports unemployment compensation, state/local income tax refunds, and certain other government payments.",
    whoFiles: "Government agency", providedBy: "State unemployment office or government agency",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1099-g",
    instructionsUrl: "https://www.irs.gov/instructions/i1099g" },

  { formNumber: "1099-SA", sortOrder: 47, category: "informational", subcategory: "income",
    title: "Distributions from an HSA, Archer MSA, or Medicare Advantage MSA",
    description: "Reports distributions from health savings accounts. Taxpayer must determine if used for qualified medical expenses.",
    whoFiles: "HSA trustee", providedBy: "Your HSA administrator",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1099-sa",
    instructionsUrl: "https://www.irs.gov/instructions/i1099sa" },

  { formNumber: "1099-K", sortOrder: 48, category: "informational", subcategory: "income",
    title: "Payment Card and Third Party Network Transactions",
    description: "Reports payments received through payment apps (PayPal, Venmo, Cash App) and credit/debit card transactions over $5,000 for 2024.",
    whoFiles: "Payment processor", providedBy: "Payment app or credit card processor",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1099-k",
    instructionsUrl: "https://www.irs.gov/instructions/i1099k" },

  { formNumber: "1099-C", sortOrder: 49, category: "informational", subcategory: "income",
    title: "Cancellation of Debt",
    description: "Reports cancelled debt of $600 or more, which may be taxable income unless an exclusion applies.",
    whoFiles: "Lender", providedBy: "Your lender or creditor",
    filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1099-c",
    instructionsUrl: "https://www.irs.gov/instructions/i1099ac" },

  { formNumber: "SSA-1099", sortOrder: 50, category: "informational", subcategory: "income",
    title: "Social Security Benefit Statement",
    description: "Reports Social Security benefits received. Up to 85% may be taxable depending on combined income.",
    whoFiles: "Social Security Administration", providedBy: "Social Security Administration (SSA)",
    filingMethods: [],
    irsUrl: "https://www.ssa.gov/myaccount/replacement-SSA-1099.html",
    instructionsUrl: "https://www.irs.gov/faqs/social-security-income" },

  // ── 1098 Series ─────────────────────────────────────────────────────────
  { formNumber: "1098", sortOrder: 55, category: "informational", subcategory: "deduction",
    title: "Mortgage Interest Statement",
    description: "Reports mortgage interest of $600+ paid. Used to claim mortgage interest deduction on Schedule A.",
    whoFiles: "Mortgage lender", providedBy: "Your mortgage lender",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1098",
    instructionsUrl: "https://www.irs.gov/instructions/i1098" },

  { formNumber: "1098-E", sortOrder: 56, category: "informational", subcategory: "deduction",
    title: "Student Loan Interest Statement",
    description: "Reports student loan interest of $600+ paid. Used to claim the student loan interest deduction (up to $2,500).",
    whoFiles: "Loan servicer", providedBy: "Your student loan servicer",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1098-e",
    instructionsUrl: "https://www.irs.gov/instructions/i1098e" },

  { formNumber: "1098-T", sortOrder: 57, category: "informational", subcategory: "credit",
    title: "Tuition Statement",
    description: "Reports tuition and fees paid to an eligible educational institution. Needed to claim education tax credits (American Opportunity, Lifetime Learning).",
    whoFiles: "Educational institution", providedBy: "Your college or university",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1098-t",
    instructionsUrl: "https://www.irs.gov/instructions/i1098et" },

  // ── ACA / Health Insurance ───────────────────────────────────────────────
  { formNumber: "1095-A", sortOrder: 60, category: "informational", subcategory: "healthcare",
    title: "Health Insurance Marketplace Statement",
    description: "Reports health coverage purchased through the Marketplace. Required to complete Form 8962 (Premium Tax Credit).",
    whoFiles: "Health Insurance Marketplace", providedBy: "Healthcare.gov or your state Marketplace",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1095-a",
    instructionsUrl: "https://www.irs.gov/instructions/i1095a" },

  { formNumber: "1095-B", sortOrder: 61, category: "informational", subcategory: "healthcare",
    title: "Health Coverage",
    description: "Reports minimum essential health coverage for you and your family. Sent by insurance providers, government programs, or employers with small plans.",
    whoFiles: "Insurance provider / employer", providedBy: "Your insurance provider",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1095-b",
    instructionsUrl: "https://www.irs.gov/instructions/i1095b" },

  { formNumber: "1095-C", sortOrder: 62, category: "informational", subcategory: "healthcare",
    title: "Employer-Provided Health Insurance Offer and Coverage",
    description: "Sent by large employers (50+ employees) detailing health insurance offered. Used to determine eligibility for the Premium Tax Credit.",
    whoFiles: "Large employer", providedBy: "Your employer (if 50+ employees)",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1095-c",
    instructionsUrl: "https://www.irs.gov/instructions/i1095c" },

  { formNumber: "8962", sortOrder: 63, category: "individual", subcategory: "credit",
    title: "Premium Tax Credit",
    description: "Calculates the Premium Tax Credit for health insurance purchased through the Marketplace. Required if you received advance payments of the credit.",
    whoFiles: "Taxpayer with Marketplace insurance", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8962",
    instructionsUrl: "https://www.irs.gov/instructions/i8962" },

  // ── HSA / MSA ────────────────────────────────────────────────────────────
  { formNumber: "8889", sortOrder: 65, category: "individual", subcategory: "deduction",
    title: "Health Savings Accounts (HSAs)",
    description: "Reports HSA contributions, deductions, and distributions. Required if you (or your employer) contributed to an HSA.",
    whoFiles: "HSA account holder", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8889",
    instructionsUrl: "https://www.irs.gov/instructions/i8889" },

  { formNumber: "5498-SA", sortOrder: 66, category: "informational", subcategory: "healthcare",
    title: "HSA, Archer MSA, or Medicare Advantage MSA Information",
    description: "Reports HSA contributions made during the year. Sent by your HSA trustee/custodian.",
    whoFiles: "HSA trustee", providedBy: "Your HSA administrator",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-5498-sa",
    instructionsUrl: "https://www.irs.gov/instructions/i5498sa" },

  // ── Retirement / IRAs ────────────────────────────────────────────────────
  { formNumber: "5498", sortOrder: 70, category: "informational", subcategory: "retirement",
    title: "IRA Contribution Information",
    description: "Reports contributions made to Traditional, Roth, SEP, or SIMPLE IRAs. Sent by your IRA custodian.",
    whoFiles: "IRA custodian", providedBy: "Your IRA custodian / brokerage",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-5498",
    instructionsUrl: "https://www.irs.gov/instructions/i5498" },

  { formNumber: "8606", sortOrder: 71, category: "individual", subcategory: "retirement",
    title: "Nondeductible IRAs",
    description: "Required when making nondeductible IRA contributions or converting a traditional IRA to a Roth IRA. Tracks your IRA basis.",
    whoFiles: "Taxpayer with nondeductible IRA contributions", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8606",
    instructionsUrl: "https://www.irs.gov/instructions/i8606" },

  { formNumber: "5329", sortOrder: 72, category: "individual", subcategory: "retirement",
    title: "Additional Taxes on Qualified Plans (Including IRAs)",
    description: "Reports and calculates the 10% early withdrawal penalty on retirement distributions, excess contributions, and other plan violations.",
    whoFiles: "Taxpayer with early or excess retirement distributions", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-5329",
    instructionsUrl: "https://www.irs.gov/instructions/i5329" },

  { formNumber: "8880", sortOrder: 73, category: "individual", subcategory: "credit",
    title: "Credit for Qualified Retirement Savings Contributions (Saver's Credit)",
    description: "Non-refundable credit for low-to-moderate income taxpayers who contribute to a 401(k), IRA, or other retirement plan.",
    whoFiles: "Eligible taxpayer contributing to retirement", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8880",
    instructionsUrl: "https://www.irs.gov/instructions/i8880" },

  // ── Child / Dependent / Family ───────────────────────────────────────────
  { formNumber: "8812", sortOrder: 80, category: "individual", subcategory: "credit",
    title: "Credits for Qualifying Children and Other Dependents",
    description: "Calculates the Child Tax Credit (up to $2,000/child) and the Additional Child Tax Credit (refundable portion).",
    whoFiles: "Taxpayer with qualifying children", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8812",
    instructionsUrl: "https://www.irs.gov/instructions/i1040s8812" },

  { formNumber: "2441", sortOrder: 81, category: "individual", subcategory: "credit",
    title: "Child and Dependent Care Expenses",
    description: "Claims the credit for child and dependent care expenses paid to allow you (and spouse) to work or look for work.",
    whoFiles: "Taxpayer with qualifying care expenses", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-2441",
    instructionsUrl: "https://www.irs.gov/instructions/i2441" },

  { formNumber: "8839", sortOrder: 82, category: "individual", subcategory: "credit",
    title: "Qualified Adoption Expenses",
    description: "Claims the adoption tax credit (up to $16,810 per child for 2024) or employer-provided adoption benefits exclusion.",
    whoFiles: "Taxpayer who adopted a child", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8839",
    instructionsUrl: "https://www.irs.gov/instructions/i8839" },

  // ── Education ────────────────────────────────────────────────────────────
  { formNumber: "8863", sortOrder: 85, category: "individual", subcategory: "credit",
    title: "Education Credits (American Opportunity and Lifetime Learning Credits)",
    description: "Claims the American Opportunity Credit (up to $2,500) or Lifetime Learning Credit (up to $2,000) for post-secondary education expenses.",
    whoFiles: "Taxpayer paying qualified education expenses", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8863",
    instructionsUrl: "https://www.irs.gov/instructions/i8863" },

  // ── Capital Gains / Investments ──────────────────────────────────────────
  { formNumber: "8949", sortOrder: 90, category: "individual", subcategory: "income",
    title: "Sales and Other Dispositions of Capital Assets",
    description: "Reports the details of each capital asset sale before summarizing on Schedule D. Includes cost basis adjustments.",
    whoFiles: "Taxpayer with capital asset sales", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8949",
    instructionsUrl: "https://www.irs.gov/instructions/i8949" },

  // ── Home / Real Estate ───────────────────────────────────────────────────
  { formNumber: "8829", sortOrder: 95, category: "individual", subcategory: "deduction",
    title: "Expenses for Business Use of Your Home (Home Office Deduction)",
    description: "Calculates the home office deduction for self-employed taxpayers. The space must be used regularly and exclusively for business.",
    whoFiles: "Self-employed taxpayer with home office", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8829",
    instructionsUrl: "https://www.irs.gov/instructions/i8829" },

  { formNumber: "5695", sortOrder: 96, category: "individual", subcategory: "credit",
    title: "Residential Clean Energy Credits",
    description: "Claims credits for residential energy-efficient improvements: solar panels (30%), heat pumps, insulation, EV chargers, and more.",
    whoFiles: "Homeowner with energy improvements", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-5695",
    instructionsUrl: "https://www.irs.gov/instructions/i5695" },

  // ── Charitable / Noncash ─────────────────────────────────────────────────
  { formNumber: "8283", sortOrder: 100, category: "individual", subcategory: "deduction",
    title: "Noncash Charitable Contributions",
    description: "Required when noncash charitable contributions exceed $500. Donations over $5,000 require a qualified appraisal.",
    whoFiles: "Taxpayer with noncash donations >$500", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8283",
    instructionsUrl: "https://www.irs.gov/instructions/i8283" },

  // ── AMT ──────────────────────────────────────────────────────────────────
  { formNumber: "6251", sortOrder: 105, category: "individual", subcategory: "taxes",
    title: "Alternative Minimum Tax—Individuals",
    description: "Calculates the Alternative Minimum Tax (AMT). Required for higher-income taxpayers with certain deductions or preference items.",
    whoFiles: "Higher-income taxpayer potentially subject to AMT", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-6251",
    instructionsUrl: "https://www.irs.gov/instructions/i6251" },

  // ── Underpayment / Penalties ─────────────────────────────────────────────
  { formNumber: "2210", sortOrder: 110, category: "individual", subcategory: "penalty",
    title: "Underpayment of Estimated Tax by Individuals, Estates, and Trusts",
    description: "Calculates penalty for underpaying estimated taxes. May also be used to waive the penalty under special circumstances.",
    whoFiles: "Taxpayer who underpaid estimated taxes", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-2210",
    instructionsUrl: "https://www.irs.gov/instructions/i2210" },

  // ── Self-Employment / Business ───────────────────────────────────────────
  { formNumber: "8995", sortOrder: 115, category: "individual", subcategory: "deduction",
    title: "Qualified Business Income Deduction Simplified Computation",
    description: "Calculates the 20% Qualified Business Income (QBI) deduction for pass-through income from sole proprietorships, partnerships, and S-corps.",
    whoFiles: "Self-employed or pass-through business owner", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8995",
    instructionsUrl: "https://www.irs.gov/instructions/i8995" },

  { formNumber: "4562", sortOrder: 116, category: "individual", subcategory: "deduction",
    title: "Depreciation and Amortization",
    description: "Reports depreciation and amortization of business assets, Section 179 expensing, and bonus depreciation.",
    whoFiles: "Business owner with depreciable assets", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-4562",
    instructionsUrl: "https://www.irs.gov/instructions/i4562" },

  // ── Foreign Income ───────────────────────────────────────────────────────
  { formNumber: "2555", sortOrder: 120, category: "individual", subcategory: "exclusion",
    title: "Foreign Earned Income Exclusion",
    description: "Allows qualifying U.S. citizens/residents abroad to exclude foreign earned income (up to $126,500 for 2024) from U.S. taxes.",
    whoFiles: "U.S. citizen or resident living abroad", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-2555",
    instructionsUrl: "https://www.irs.gov/instructions/i2555" },

  { formNumber: "1116", sortOrder: 121, category: "individual", subcategory: "credit",
    title: "Foreign Tax Credit",
    description: "Claims a credit for income taxes paid to a foreign country, reducing double taxation on foreign-source income.",
    whoFiles: "Taxpayer with foreign income taxes paid", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1116",
    instructionsUrl: "https://www.irs.gov/instructions/i1116" },

  // ── FBAR / Foreign Accounts ──────────────────────────────────────────────
  { formNumber: "FinCEN 114 (FBAR)", sortOrder: 125, category: "individual", subcategory: "disclosure",
    title: "Report of Foreign Bank and Financial Accounts (FBAR)",
    description: "Required if you have foreign financial accounts with an aggregate value over $10,000 at any time during the year. Filed with FinCEN, not IRS.",
    whoFiles: "Taxpayer with foreign bank accounts >$10,000", filingMethods: ["efile"],
    irsUrl: "https://bsaefiling.fincen.treas.gov/NoRegFBARFiler.html",
    instructionsUrl: "https://www.irs.gov/businesses/small-businesses-self-employed/report-of-foreign-bank-and-financial-accounts-fbar" },

  { formNumber: "8938", sortOrder: 126, category: "individual", subcategory: "disclosure",
    title: "Statement of Specified Foreign Financial Assets",
    description: "Required under FATCA for taxpayers with foreign financial assets exceeding threshold ($50,000 for single filers). Filed with your 1040.",
    whoFiles: "Taxpayer with substantial foreign assets", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8938",
    instructionsUrl: "https://www.irs.gov/instructions/i8938" },

  // ── Gambling / Crypto ────────────────────────────────────────────────────
  { formNumber: "W-2G", sortOrder: 130, category: "informational", subcategory: "income",
    title: "Certain Gambling Winnings",
    description: "Reports gambling winnings of $600+ (or $1,200+ from slots/bingo). Issued by casinos and gaming establishments.",
    whoFiles: "Casino / gaming establishment", providedBy: "Casino or gaming establishment",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-w-2-g",
    instructionsUrl: "https://www.irs.gov/instructions/iw2g" },

  // ── Business Returns ─────────────────────────────────────────────────────
  { formNumber: "1120", sortOrder: 200, category: "business", subcategory: "return",
    title: "U.S. Corporation Income Tax Return",
    description: "Annual tax return for C corporations.",
    whoFiles: "C corporation", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1120",
    instructionsUrl: "https://www.irs.gov/instructions/i1120" },

  { formNumber: "1120-S", sortOrder: 201, category: "business", subcategory: "return",
    title: "U.S. Income Tax Return for an S Corporation",
    description: "Annual return for S corporations. Income/loss passes through to shareholders' individual returns.",
    whoFiles: "S corporation", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1120-s",
    instructionsUrl: "https://www.irs.gov/instructions/i1120s" },

  { formNumber: "1065", sortOrder: 202, category: "business", subcategory: "return",
    title: "U.S. Return of Partnership Income",
    description: "Annual return for partnerships (including multi-member LLCs). Income/loss passes through to partners via Schedule K-1.",
    whoFiles: "Partnership / multi-member LLC", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-1065",
    instructionsUrl: "https://www.irs.gov/instructions/i1065" },

  { formNumber: "Schedule K-1 (1065)", sortOrder: 203, category: "informational", subcategory: "income",
    title: "Partner's Share of Income, Deductions, Credits, etc.",
    description: "Issued by the partnership to each partner showing their share of income, deductions, and credits.",
    whoFiles: "Partnership", providedBy: "Your partnership or LLC",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-k-1-form-1065",
    instructionsUrl: "https://www.irs.gov/instructions/i1065sk1" },

  { formNumber: "Schedule K-1 (1120-S)", sortOrder: 204, category: "informational", subcategory: "income",
    title: "Shareholder's Share of Income, Deductions, Credits, etc.",
    description: "Issued by an S corporation to each shareholder showing their share of income, deductions, and credits.",
    whoFiles: "S corporation", providedBy: "Your S corporation",
    filingMethods: [],
    irsUrl: "https://www.irs.gov/forms-pubs/about-schedule-k-1-form-1120-s",
    instructionsUrl: "https://www.irs.gov/instructions/i1120ssk1" },

  { formNumber: "941", sortOrder: 210, category: "employer", subcategory: "employment",
    title: "Employer's Quarterly Federal Tax Return",
    description: "Quarterly return for employers to report federal income tax, Social Security, and Medicare taxes withheld from employees.",
    whoFiles: "Employer", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-941",
    instructionsUrl: "https://www.irs.gov/instructions/i941" },

  { formNumber: "940", sortOrder: 211, category: "employer", subcategory: "employment",
    title: "Employer's Annual Federal Unemployment (FUTA) Tax Return",
    description: "Annual return for employers to report and pay Federal Unemployment Tax Act (FUTA) tax.",
    whoFiles: "Employer", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-940",
    instructionsUrl: "https://www.irs.gov/instructions/i940" },

  { formNumber: "SS-4", sortOrder: 220, category: "business", subcategory: "id",
    title: "Application for Employer Identification Number (EIN)",
    description: "Used to obtain a federal Employer Identification Number for businesses, trusts, estates, and other entities.",
    whoFiles: "New business entity", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-ss-4",
    instructionsUrl: "https://www.irs.gov/instructions/iss4" },

  // ── Military-Specific ────────────────────────────────────────────────────
  { formNumber: "3903", sortOrder: 300, category: "individual", subcategory: "deduction",
    title: "Moving Expenses",
    description: "Active-duty military members can deduct moving expenses related to a permanent change of station (PCS). Limited to military only since 2018.",
    whoFiles: "Active-duty military member", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-3903",
    instructionsUrl: "https://www.irs.gov/instructions/i3903" },

  // ── Miscellaneous ────────────────────────────────────────────────────────
  { formNumber: "8822", sortOrder: 400, category: "individual", subcategory: "administrative",
    title: "Change of Address",
    description: "Notifies the IRS of a change of address to ensure correct delivery of notices and refunds.",
    whoFiles: "Taxpayer who has moved", filingMethods: ["mail"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8822",
    instructionsUrl: "https://www.irs.gov/forms-pubs/about-form-8822" },

  { formNumber: "9465", sortOrder: 401, category: "individual", subcategory: "payment",
    title: "Installment Agreement Request",
    description: "Used to request a monthly installment plan if you cannot pay your full tax bill by the due date.",
    whoFiles: "Taxpayer unable to pay in full", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-9465",
    instructionsUrl: "https://www.irs.gov/instructions/i9465" },

  { formNumber: "8888", sortOrder: 402, category: "individual", subcategory: "payment",
    title: "Allocation of Refund",
    description: "Allows splitting a tax refund into up to three financial accounts or purchase of U.S. Savings Bonds.",
    whoFiles: "Taxpayer expecting a refund", filingMethods: ["mail", "efile"],
    irsUrl: "https://www.irs.gov/forms-pubs/about-form-8888",
    instructionsUrl: "https://www.irs.gov/instructions/i8888" },
];

export async function seedFederalForms() {
  const existing = await db.select().from(federalForms);
  if (existing.length > 0) return;

  for (const f of FEDERAL_FORMS) {
    await db.insert(federalForms).values({
      formNumber: f.formNumber,
      title: f.title,
      description: f.description,
      category: f.category,
      subcategory: f.subcategory ?? null,
      whoFiles: f.whoFiles,
      providedBy: f.providedBy ?? null,
      filingMethods: f.filingMethods,
      irsUrl: f.irsUrl ?? null,
      instructionsUrl: f.instructionsUrl ?? null,
      isActive: true,
      sortOrder: f.sortOrder,
    });
  }
  console.log(`[tax-seed] ${FEDERAL_FORMS.length} federal forms seeded.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. STATE FORMS
// ─────────────────────────────────────────────────────────────────────────────
const STATE_FORMS = [
  // States WITH income tax — primary individual return form
  { stateCode: "AL", stateName: "Alabama", formNumber: "40", title: "Individual Income Tax Return", description: "Alabama individual income tax return for residents.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.revenue.alabama.gov/individual-corporate/individual-income-tax/", hasIncomeTax: true },
  { stateCode: "AK", stateName: "Alaska", formNumber: "N/A", title: "No State Income Tax", description: "Alaska has no state individual income tax. No state return required.", category: "individual", whoFiles: "N/A", filingMethods: [], stateWebUrl: "https://tax.alaska.gov", hasIncomeTax: false },
  { stateCode: "AZ", stateName: "Arizona", formNumber: "140", title: "Resident Personal Income Tax Return", description: "Arizona resident individual income tax return. Flat 2.5% rate for 2024.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://azdor.gov/individual-income-tax-information", hasIncomeTax: true },
  { stateCode: "AR", stateName: "Arkansas", formNumber: "AR1000F", title: "Full Year Resident Individual Income Tax Return", description: "Arkansas full-year resident income tax return.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.dfa.arkansas.gov/income-tax/individual-income-tax/", hasIncomeTax: true },
  { stateCode: "CA", stateName: "California", formNumber: "540", title: "California Resident Income Tax Return", description: "California resident individual income tax return. Progressive rates up to 13.3% (among highest in the nation).", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.ftb.ca.gov/file/personal/", hasIncomeTax: true },
  { stateCode: "CO", stateName: "Colorado", formNumber: "DR 0104", title: "Individual Income Tax Return", description: "Colorado individual income tax return. Flat 4.40% rate for 2024.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://tax.colorado.gov/individual-income-tax", hasIncomeTax: true },
  { stateCode: "CT", stateName: "Connecticut", formNumber: "CT-1040", title: "Connecticut Resident Income Tax Return", description: "Connecticut resident income tax return with progressive rates 2%–6.99%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://portal.ct.gov/DRS/Individuals/Individual-Tax-Page", hasIncomeTax: true },
  { stateCode: "DE", stateName: "Delaware", formNumber: "200-01", title: "Resident Individual Income Tax Return", description: "Delaware resident income tax return with progressive rates up to 6.6%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://revenue.delaware.gov/individuals/personal-income-tax/", hasIncomeTax: true },
  { stateCode: "FL", stateName: "Florida", formNumber: "N/A", title: "No State Income Tax", description: "Florida has no state individual income tax. No state return required.", category: "individual", whoFiles: "N/A", filingMethods: [], stateWebUrl: "https://floridarevenue.com", hasIncomeTax: false },
  { stateCode: "GA", stateName: "Georgia", formNumber: "500", title: "Individual Income Tax Return", description: "Georgia individual income tax return. Flat 5.49% rate for 2024.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://dor.georgia.gov/individual-income-tax", hasIncomeTax: true },
  { stateCode: "HI", stateName: "Hawaii", formNumber: "N-11", title: "Hawaii Resident Income Tax Return", description: "Hawaii resident income tax return with progressive rates up to 11%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://tax.hawaii.gov/geninfo/whatisindtax/", hasIncomeTax: true },
  { stateCode: "ID", stateName: "Idaho", formNumber: "40", title: "Idaho Individual Income Tax Return", description: "Idaho resident income tax return. Flat 5.8% rate for 2024.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://tax.idaho.gov/taxes/income-tax/individual-income/", hasIncomeTax: true },
  { stateCode: "IL", stateName: "Illinois", formNumber: "IL-1040", title: "Individual Income Tax Return", description: "Illinois individual income tax return. Flat 4.95% rate.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://tax.illinois.gov/individuals/individual-income-tax.html", hasIncomeTax: true },
  { stateCode: "IN", stateName: "Indiana", formNumber: "IT-40", title: "Indiana Full-Year Resident Individual Income Tax Return", description: "Indiana income tax return. Flat 3.15% state rate plus county taxes.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.in.gov/dor/individual-income-taxes/", hasIncomeTax: true },
  { stateCode: "IA", stateName: "Iowa", formNumber: "IA 1040", title: "Iowa Individual Income Tax Return", description: "Iowa income tax return. Moving to flat 3.8% rate by 2025.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://tax.iowa.gov/individual-income-tax", hasIncomeTax: true },
  { stateCode: "KS", stateName: "Kansas", formNumber: "K-40", title: "Kansas Individual Income Tax Return", description: "Kansas income tax return with progressive rates 3.1%–5.7%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.ksrevenue.gov/persinc.html", hasIncomeTax: true },
  { stateCode: "KY", stateName: "Kentucky", formNumber: "740", title: "Kentucky Individual Income Tax Return", description: "Kentucky income tax return. Flat 4.0% rate for 2024.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://revenue.ky.gov/Individual/Pages/default.aspx", hasIncomeTax: true },
  { stateCode: "LA", stateName: "Louisiana", formNumber: "IT-540", title: "Louisiana Resident Individual Income Tax Return", description: "Louisiana income tax return with progressive rates 1.85%–4.25%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://revenue.louisiana.gov/IndividualIncomeTax", hasIncomeTax: true },
  { stateCode: "ME", stateName: "Maine", formNumber: "1040ME", title: "Maine Individual Income Tax Return", description: "Maine income tax return with progressive rates 5.8%–7.15%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.maine.gov/revenue/taxes/income-estate-tax/individual-income-tax", hasIncomeTax: true },
  { stateCode: "MD", stateName: "Maryland", formNumber: "502", title: "Maryland Resident Income Tax Return", description: "Maryland income tax return with progressive rates 2%–5.75% plus local income tax.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.marylandtaxes.gov/individual/", hasIncomeTax: true },
  { stateCode: "MA", stateName: "Massachusetts", formNumber: "1", title: "Massachusetts Resident Income Tax Return", description: "Massachusetts income tax return. Flat 5% rate (plus 4% surtax on income over $1M).", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.mass.gov/orgs/massachusetts-department-of-revenue", hasIncomeTax: true },
  { stateCode: "MI", stateName: "Michigan", formNumber: "MI-1040", title: "Michigan Individual Income Tax Return", description: "Michigan income tax return. Flat 4.25% rate.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.michigan.gov/taxes/iit", hasIncomeTax: true },
  { stateCode: "MN", stateName: "Minnesota", formNumber: "M1", title: "Minnesota Individual Income Tax Return", description: "Minnesota income tax return with progressive rates 5.35%–9.85%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.revenue.state.mn.us/individual-income-tax", hasIncomeTax: true },
  { stateCode: "MS", stateName: "Mississippi", formNumber: "80-105", title: "Mississippi Resident Individual Income Tax Return", description: "Mississippi income tax return. Flat 4.7% rate for 2024.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.dor.ms.gov/individual/ind-income-tax", hasIncomeTax: true },
  { stateCode: "MO", stateName: "Missouri", formNumber: "MO-1040", title: "Missouri Individual Income Tax Long Form", description: "Missouri income tax return with progressive rates up to 4.95%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://dor.mo.gov/individual/", hasIncomeTax: true },
  { stateCode: "MT", stateName: "Montana", formNumber: "2", title: "Montana Individual Income Tax Return", description: "Montana income tax return with progressive rates up to 6.75%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://mtrevenue.gov/taxes/individual-income-tax/", hasIncomeTax: true },
  { stateCode: "NE", stateName: "Nebraska", formNumber: "1040N", title: "Nebraska Individual Income Tax Return", description: "Nebraska income tax return with progressive rates.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://revenue.nebraska.gov/individuals", hasIncomeTax: true },
  { stateCode: "NV", stateName: "Nevada", formNumber: "N/A", title: "No State Income Tax", description: "Nevada has no state individual income tax. No state return required.", category: "individual", whoFiles: "N/A", filingMethods: [], stateWebUrl: "https://tax.nv.gov", hasIncomeTax: false },
  { stateCode: "NH", stateName: "New Hampshire", formNumber: "DP-10", title: "Interest and Dividends Tax Return", description: "New Hampshire taxes only interest and dividends at 3% for 2024 (eliminated January 1, 2025). No wage income tax.", category: "individual", whoFiles: "Taxpayer with interest/dividend income", filingMethods: ["mail"], stateWebUrl: "https://www.revenue.nh.gov/taxes/interest-dividends.htm", hasIncomeTax: true },
  { stateCode: "NJ", stateName: "New Jersey", formNumber: "NJ-1040", title: "New Jersey Resident Income Tax Return", description: "New Jersey income tax return with progressive rates 1.4%–10.75%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.nj.gov/treasury/taxation/njit35.shtml", hasIncomeTax: true },
  { stateCode: "NM", stateName: "New Mexico", formNumber: "PIT-1", title: "New Mexico Personal Income Tax Return", description: "New Mexico income tax return with progressive rates 1.7%–5.9%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.tax.newmexico.gov/individuals/", hasIncomeTax: true },
  { stateCode: "NY", stateName: "New York", formNumber: "IT-201", title: "Resident Income Tax Return", description: "New York resident income tax return with progressive rates 4%–10.9%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.tax.ny.gov/pit/file/it201_information.htm", hasIncomeTax: true },
  { stateCode: "NC", stateName: "North Carolina", formNumber: "D-400", title: "Individual Income Tax Return", description: "North Carolina income tax return. Flat 4.5% rate for 2024.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.ncdor.gov/taxes-forms/individual-income-tax", hasIncomeTax: true },
  { stateCode: "ND", stateName: "North Dakota", formNumber: "ND-1", title: "Individual Income Tax Return", description: "North Dakota income tax return with progressive rates up to 2.5%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.nd.gov/tax/individual", hasIncomeTax: true },
  { stateCode: "OH", stateName: "Ohio", formNumber: "IT 1040", title: "Ohio Individual Income Tax Return", description: "Ohio income tax return with progressive rates 2.765%–3.99%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://tax.ohio.gov/individual", hasIncomeTax: true },
  { stateCode: "OK", stateName: "Oklahoma", formNumber: "511", title: "Oklahoma Resident Income Tax Return", description: "Oklahoma income tax return with progressive rates 0.25%–4.75%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://oklahoma.gov/tax/individuals.html", hasIncomeTax: true },
  { stateCode: "OR", stateName: "Oregon", formNumber: "OR-40", title: "Oregon Individual Income Tax Return (Resident)", description: "Oregon income tax return with progressive rates 4.75%–9.9% (plus Metro/Multnomah taxes if applicable).", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.oregon.gov/dor/programs/individuals/Pages/default.aspx", hasIncomeTax: true },
  { stateCode: "PA", stateName: "Pennsylvania", formNumber: "PA-40", title: "Pennsylvania Personal Income Tax Return", description: "Pennsylvania income tax return. Flat 3.07% rate.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.revenue.pa.gov/TaxesAndPrograms/PersonalIncomeTax/Pages/default.aspx", hasIncomeTax: true },
  { stateCode: "RI", stateName: "Rhode Island", formNumber: "RI-1040", title: "Rhode Island Resident Individual Income Tax Return", description: "Rhode Island income tax return with progressive rates 3.75%–5.99%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://tax.ri.gov/tax-sections/income-taxes", hasIncomeTax: true },
  { stateCode: "SC", stateName: "South Carolina", formNumber: "SC1040", title: "Individual Income Tax Return", description: "South Carolina income tax return. Flat 6.4% rate for 2024.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://dor.sc.gov/tax/individual", hasIncomeTax: true },
  { stateCode: "SD", stateName: "South Dakota", formNumber: "N/A", title: "No State Income Tax", description: "South Dakota has no state individual income tax. No state return required.", category: "individual", whoFiles: "N/A", filingMethods: [], stateWebUrl: "https://dor.sd.gov", hasIncomeTax: false },
  { stateCode: "TN", stateName: "Tennessee", formNumber: "N/A", title: "No State Income Tax", description: "Tennessee eliminated its Hall Tax on interest and dividends in 2021. No state income tax required.", category: "individual", whoFiles: "N/A", filingMethods: [], stateWebUrl: "https://www.tn.gov/revenue", hasIncomeTax: false },
  { stateCode: "TX", stateName: "Texas", formNumber: "N/A", title: "No State Income Tax", description: "Texas has no state individual income tax. No state return required.", category: "individual", whoFiles: "N/A", filingMethods: [], stateWebUrl: "https://comptroller.texas.gov", hasIncomeTax: false },
  { stateCode: "UT", stateName: "Utah", formNumber: "TC-40", title: "Utah Individual Income Tax Return", description: "Utah income tax return. Flat 4.55% rate.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://tax.utah.gov/individual", hasIncomeTax: true },
  { stateCode: "VT", stateName: "Vermont", formNumber: "IN-111", title: "Vermont Income Tax Return", description: "Vermont income tax return with progressive rates 3.35%–8.75%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://tax.vermont.gov/individuals/income-tax", hasIncomeTax: true },
  { stateCode: "VA", stateName: "Virginia", formNumber: "760", title: "Virginia Resident Individual Income Tax Return", description: "Virginia income tax return with progressive rates 2%–5.75%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.tax.virginia.gov/individual-income-tax", hasIncomeTax: true },
  { stateCode: "WA", stateName: "Washington", formNumber: "N/A*", title: "No General Income Tax (Capital Gains Tax Applies)", description: "Washington has no general income tax. However, a 7% capital gains tax applies to gains over $262,000 for 2024.", category: "individual", whoFiles: "Taxpayer with capital gains >$262,000", filingMethods: ["efile"], stateWebUrl: "https://dor.wa.gov/taxes-rates/other-taxes/capital-gains-tax", hasIncomeTax: false },
  { stateCode: "WV", stateName: "West Virginia", formNumber: "IT-140", title: "West Virginia Personal Income Tax Return", description: "West Virginia income tax return with progressive rates.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://tax.wv.gov/Individuals/Pages/IndividualIncomeTax.aspx", hasIncomeTax: true },
  { stateCode: "WI", stateName: "Wisconsin", formNumber: "Form 1", title: "Wisconsin Income Tax Return", description: "Wisconsin income tax return with progressive rates 3.5%–7.65%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://www.revenue.wi.gov/pages/ise/individual.aspx", hasIncomeTax: true },
  { stateCode: "WY", stateName: "Wyoming", formNumber: "N/A", title: "No State Income Tax", description: "Wyoming has no state individual income tax. No state return required.", category: "individual", whoFiles: "N/A", filingMethods: [], stateWebUrl: "https://revenue.wyo.gov", hasIncomeTax: false },
  { stateCode: "DC", stateName: "District of Columbia", formNumber: "D-40", title: "DC Individual Income Tax Return", description: "DC resident income tax return with progressive rates 4%–10.75%.", category: "individual", whoFiles: "Taxpayer", filingMethods: ["mail", "efile"], stateWebUrl: "https://mytax.dc.gov/", hasIncomeTax: true },
];

export async function seedStateForms() {
  const existing = await db.select().from(stateForms);
  if (existing.length > 0) return;

  for (const f of STATE_FORMS) {
    await db.insert(stateForms).values({
      stateCode: f.stateCode,
      stateName: f.stateName,
      formNumber: f.formNumber,
      title: f.title,
      description: f.description,
      category: f.category,
      whoFiles: f.whoFiles,
      providedBy: null,
      filingMethods: f.filingMethods,
      stateWebUrl: f.stateWebUrl ?? null,
      hasIncomeTax: f.hasIncomeTax,
      isActive: true,
    });
  }
  console.log(`[tax-seed] ${STATE_FORMS.length} state forms seeded.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TAX BRACKETS (2024 Federal)
// ─────────────────────────────────────────────────────────────────────────────
export async function seedTaxBrackets(taxYear: number) {
  const existing = await db.select().from(taxBrackets).where(eq(taxBrackets.taxYear, taxYear));
  if (existing.length > 0) return;

  // Inflation-adjusted thresholds (approximate future years using ~3% annual adjustment)
  const factor = Math.pow(1.03, taxYear - 2024);
  const adj = (n: number) => Math.round(n * factor / 50) * 50; // round to nearest $50

  const brackets: Array<{ filingStatus: string; rate: number; from: number; to: number | null }> = [
    // Single
    { filingStatus: "single", rate: 0.10, from: 0,          to: adj(11600)  },
    { filingStatus: "single", rate: 0.12, from: adj(11600),  to: adj(47150)  },
    { filingStatus: "single", rate: 0.22, from: adj(47150),  to: adj(100525) },
    { filingStatus: "single", rate: 0.24, from: adj(100525), to: adj(191950) },
    { filingStatus: "single", rate: 0.32, from: adj(191950), to: adj(243725) },
    { filingStatus: "single", rate: 0.35, from: adj(243725), to: adj(609350) },
    { filingStatus: "single", rate: 0.37, from: adj(609350), to: null        },
    // Married Filing Jointly
    { filingStatus: "mfj", rate: 0.10, from: 0,           to: adj(23200)  },
    { filingStatus: "mfj", rate: 0.12, from: adj(23200),   to: adj(94300)  },
    { filingStatus: "mfj", rate: 0.22, from: adj(94300),   to: adj(201050) },
    { filingStatus: "mfj", rate: 0.24, from: adj(201050),  to: adj(383900) },
    { filingStatus: "mfj", rate: 0.32, from: adj(383900),  to: adj(487450) },
    { filingStatus: "mfj", rate: 0.35, from: adj(487450),  to: adj(731200) },
    { filingStatus: "mfj", rate: 0.37, from: adj(731200),  to: null        },
    // Married Filing Separately
    { filingStatus: "mfs", rate: 0.10, from: 0,           to: adj(11600)  },
    { filingStatus: "mfs", rate: 0.12, from: adj(11600),   to: adj(47150)  },
    { filingStatus: "mfs", rate: 0.22, from: adj(47150),   to: adj(100525) },
    { filingStatus: "mfs", rate: 0.24, from: adj(100525),  to: adj(191950) },
    { filingStatus: "mfs", rate: 0.32, from: adj(191950),  to: adj(243725) },
    { filingStatus: "mfs", rate: 0.35, from: adj(243725),  to: adj(365600) },
    { filingStatus: "mfs", rate: 0.37, from: adj(365600),  to: null        },
    // Head of Household
    { filingStatus: "hoh", rate: 0.10, from: 0,           to: adj(16550)  },
    { filingStatus: "hoh", rate: 0.12, from: adj(16550),   to: adj(63100)  },
    { filingStatus: "hoh", rate: 0.22, from: adj(63100),   to: adj(100500) },
    { filingStatus: "hoh", rate: 0.24, from: adj(100500),  to: adj(191950) },
    { filingStatus: "hoh", rate: 0.32, from: adj(191950),  to: adj(243700) },
    { filingStatus: "hoh", rate: 0.35, from: adj(243700),  to: adj(609350) },
    { filingStatus: "hoh", rate: 0.37, from: adj(609350),  to: null        },
    // Qualifying Widow(er) — same as MFJ
    { filingStatus: "qw",  rate: 0.10, from: 0,           to: adj(23200)  },
    { filingStatus: "qw",  rate: 0.12, from: adj(23200),   to: adj(94300)  },
    { filingStatus: "qw",  rate: 0.22, from: adj(94300),   to: adj(201050) },
    { filingStatus: "qw",  rate: 0.24, from: adj(201050),  to: adj(383900) },
    { filingStatus: "qw",  rate: 0.32, from: adj(383900),  to: adj(487450) },
    { filingStatus: "qw",  rate: 0.35, from: adj(487450),  to: adj(731200) },
    { filingStatus: "qw",  rate: 0.37, from: adj(731200),  to: null        },
  ];

  for (const b of brackets) {
    await db.insert(taxBrackets).values({
      taxYear,
      filingStatus: b.filingStatus,
      rate: b.rate,
      incomeFrom: String(b.from),
      incomeTo: b.to !== null ? String(b.to) : null,
    });
  }
  console.log(`[tax-seed] ${brackets.length} tax brackets seeded for ${taxYear}.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. STANDARD DEDUCTIONS
// ─────────────────────────────────────────────────────────────────────────────
export async function seedStandardDeductions(taxYear: number) {
  const existing = await db.select().from(standardDeductions).where(eq(standardDeductions.taxYear, taxYear));
  if (existing.length > 0) return;

  const factor = Math.pow(1.03, taxYear - 2024);
  const adj = (n: number) => Math.round(n * factor / 50) * 50;

  const deductions = [
    { filingStatus: "single", base: 14600, add65: 1950, addBlind: 1950 },
    { filingStatus: "mfj",    base: 29200, add65: 1550, addBlind: 1550 },
    { filingStatus: "mfs",    base: 14600, add65: 1550, addBlind: 1550 },
    { filingStatus: "hoh",    base: 21900, add65: 1950, addBlind: 1950 },
    { filingStatus: "qw",     base: 29200, add65: 1550, addBlind: 1550 },
  ];

  for (const d of deductions) {
    await db.insert(standardDeductions).values({
      taxYear,
      filingStatus: d.filingStatus,
      baseAmount: String(adj(d.base)),
      age65Addition: String(adj(d.add65)),
      blindAddition: String(adj(d.addBlind)),
    });
  }
  console.log(`[tax-seed] Standard deductions seeded for ${taxYear}.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SPECIAL TAX RATES
// ─────────────────────────────────────────────────────────────────────────────
export async function seedSpecialRates(taxYear: number) {
  const existing = await db.select().from(specialTaxRates).where(eq(specialTaxRates.taxYear, taxYear));
  if (existing.length > 0) return;

  const factor = Math.pow(1.03, taxYear - 2024);
  const adj = (n: number) => Math.round(n * factor / 50) * 50;

  const rates = [
    // FICA
    { rateType: "ss_employee",       filingStatus: null, rate: 0.062, wageBase: adj(168600), thresholdFrom: null, thresholdTo: null, description: "Social Security tax (employee share). Applies to wages up to the wage base." },
    { rateType: "ss_employer",       filingStatus: null, rate: 0.062, wageBase: adj(168600), thresholdFrom: null, thresholdTo: null, description: "Social Security tax (employer share). Matches employee contribution." },
    { rateType: "medicare_employee", filingStatus: null, rate: 0.0145, wageBase: null,       thresholdFrom: null, thresholdTo: null, description: "Medicare tax (employee share). No wage base limit." },
    { rateType: "medicare_employer", filingStatus: null, rate: 0.0145, wageBase: null,       thresholdFrom: null, thresholdTo: null, description: "Medicare tax (employer share). No wage base limit." },
    // Additional Medicare (0.9%)
    { rateType: "add_medicare_single", filingStatus: "single", rate: 0.009, wageBase: null, thresholdFrom: adj(200000), thresholdTo: null, description: "Additional 0.9% Medicare on wages over $200,000 (single/MFS)." },
    { rateType: "add_medicare_mfj",    filingStatus: "mfj",    rate: 0.009, wageBase: null, thresholdFrom: adj(250000), thresholdTo: null, description: "Additional 0.9% Medicare on wages over $250,000 (MFJ)." },
    { rateType: "add_medicare_mfs",    filingStatus: "mfs",    rate: 0.009, wageBase: null, thresholdFrom: adj(125000), thresholdTo: null, description: "Additional 0.9% Medicare on wages over $125,000 (MFS)." },
    // Self-Employment Tax
    { rateType: "se_full",  filingStatus: null, rate: 0.153, wageBase: adj(168600), thresholdFrom: null, thresholdTo: null, description: "Self-employment tax (15.3%) on net SE earnings up to SS wage base." },
    { rateType: "se_med",   filingStatus: null, rate: 0.029, wageBase: null,        thresholdFrom: adj(168600), thresholdTo: null, description: "Self-employment tax (2.9% Medicare portion) above SS wage base." },
    // Net Investment Income Tax (NIIT)
    { rateType: "niit_single", filingStatus: "single", rate: 0.038, wageBase: null, thresholdFrom: adj(200000), thresholdTo: null, description: "3.8% Net Investment Income Tax on investment income above threshold." },
    { rateType: "niit_mfj",    filingStatus: "mfj",    rate: 0.038, wageBase: null, thresholdFrom: adj(250000), thresholdTo: null, description: "3.8% Net Investment Income Tax on investment income above threshold." },
    { rateType: "niit_mfs",    filingStatus: "mfs",    rate: 0.038, wageBase: null, thresholdFrom: adj(125000), thresholdTo: null, description: "3.8% Net Investment Income Tax on investment income above threshold." },
    { rateType: "niit_hoh",    filingStatus: "hoh",    rate: 0.038, wageBase: null, thresholdFrom: adj(200000), thresholdTo: null, description: "3.8% Net Investment Income Tax on investment income above threshold." },
    // Long-Term Capital Gains Rates
    { rateType: "ltcg_0_single", filingStatus: "single", rate: 0.00, wageBase: null, thresholdFrom: 0, thresholdTo: adj(47025), description: "0% long-term capital gains rate for single filers." },
    { rateType: "ltcg_15_single",filingStatus: "single", rate: 0.15, wageBase: null, thresholdFrom: adj(47025), thresholdTo: adj(518900), description: "15% long-term capital gains rate for single filers." },
    { rateType: "ltcg_20_single",filingStatus: "single", rate: 0.20, wageBase: null, thresholdFrom: adj(518900), thresholdTo: null, description: "20% long-term capital gains rate for single filers." },
    { rateType: "ltcg_0_mfj",   filingStatus: "mfj",    rate: 0.00, wageBase: null, thresholdFrom: 0, thresholdTo: adj(94050),  description: "0% long-term capital gains rate for MFJ filers." },
    { rateType: "ltcg_15_mfj",  filingStatus: "mfj",    rate: 0.15, wageBase: null, thresholdFrom: adj(94050),  thresholdTo: adj(583750), description: "15% long-term capital gains rate for MFJ filers." },
    { rateType: "ltcg_20_mfj",  filingStatus: "mfj",    rate: 0.20, wageBase: null, thresholdFrom: adj(583750), thresholdTo: null, description: "20% long-term capital gains rate for MFJ filers." },
    // AMT
    { rateType: "amt_rate1", filingStatus: null, rate: 0.26, wageBase: null, thresholdFrom: 0, thresholdTo: adj(232600), description: "26% AMT rate on AMTI up to threshold." },
    { rateType: "amt_rate2", filingStatus: null, rate: 0.28, wageBase: null, thresholdFrom: adj(232600), thresholdTo: null, description: "28% AMT rate on AMTI above threshold." },
    { rateType: "amt_exempt_single", filingStatus: "single", rate: 0, wageBase: null, thresholdFrom: adj(85700),  thresholdTo: adj(609350), description: "AMT exemption for single filers ($85,700, phases out at $609,350)." },
    { rateType: "amt_exempt_mfj",    filingStatus: "mfj",    rate: 0, wageBase: null, thresholdFrom: adj(133300), thresholdTo: adj(1218700), description: "AMT exemption for MFJ filers ($133,300, phases out at $1,218,700)." },
    // Kiddie Tax
    { rateType: "kiddie_unearned", filingStatus: null, rate: 0, wageBase: null, thresholdFrom: adj(2500), thresholdTo: null, description: "Kiddie tax: unearned income over $2,500 taxed at parent's rate for children under 19 (or 24 if student)." },
  ];

  for (const r of rates) {
    await db.insert(specialTaxRates).values({
      taxYear,
      rateType: r.rateType,
      filingStatus: r.filingStatus,
      rate: r.rate,
      wageBase: r.wageBase !== null ? String(r.wageBase) : null,
      thresholdFrom: r.thresholdFrom !== null ? String(r.thresholdFrom) : null,
      thresholdTo:   r.thresholdTo   !== null ? String(r.thresholdTo)   : null,
      description: r.description,
    });
  }
  console.log(`[tax-seed] ${rates.length} special tax rates seeded for ${taxYear}.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. QUESTIONNAIRE QUESTIONS
// ─────────────────────────────────────────────────────────────────────────────
export async function seedQuestions() {
  const existing = await db.select().from(taxQuestions);
  if (existing.length > 0) return;

  const questions = [
    // ── Identity & Status ───────────────────────────────────────────────────
    { questionKey: "entity_type", category: "identity", sortOrder: 1,
      questionText: "Are you filing as an individual or a business?",
      helpText: "Choose 'Individual' if you are filing a personal tax return (Form 1040). Choose 'Business' if you are filing for a corporation, partnership, or S-corp.",
      inputType: "single_choice", isRequired: true, appliesToIndividual: true, appliesToBusiness: true,
      options: [
        { value: "individual", label: "Individual / Sole Proprietor" },
        { value: "business",   label: "Business (Corporation, Partnership, or S-Corp)" },
      ],
    },
    { questionKey: "filing_status", category: "identity", sortOrder: 2,
      questionText: "What is your filing status for this tax year?",
      helpText: "Your filing status affects your tax brackets, standard deduction, and eligibility for many credits.",
      inputType: "single_choice", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false,
      options: [
        { value: "single",    label: "Single", helpText: "Unmarried or legally separated as of December 31." },
        { value: "mfj",      label: "Married Filing Jointly", helpText: "Married and filing one return together with your spouse." },
        { value: "mfs",      label: "Married Filing Separately", helpText: "Married but filing separate returns." },
        { value: "hoh",      label: "Head of Household", helpText: "Unmarried and paid more than half the cost of keeping a home for a qualifying person." },
        { value: "qw",       label: "Qualifying Surviving Spouse", helpText: "Spouse died in the past 2 years and you have a qualifying child." },
      ],
    },
    { questionKey: "age_65_or_older", category: "identity", sortOrder: 3,
      questionText: "Were you (or your spouse if filing jointly) age 65 or older as of December 31 of the tax year?",
      helpText: "Taxpayers 65+ may use Form 1040-SR and receive a higher standard deduction.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "residency_status", category: "identity", sortOrder: 4,
      questionText: "What is your U.S. residency status?",
      helpText: "This determines which tax return form applies to you.",
      inputType: "single_choice", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false,
      options: [
        { value: "citizen_resident", label: "U.S. Citizen or Resident Alien" },
        { value: "nonresident",      label: "Nonresident Alien" },
        { value: "dual_status",      label: "Dual-Status Alien" },
      ],
    },
    { questionKey: "state_of_residence", category: "identity", sortOrder: 5,
      questionText: "What state did you live in for the majority of the tax year?",
      helpText: "This determines which state income tax return(s) you may need to file.",
      inputType: "state_select", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "military_status", category: "identity", sortOrder: 6,
      questionText: "What is your military status?",
      helpText: "Active duty military members may qualify for special deductions (moving expenses) and state tax exemptions.",
      inputType: "single_choice", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false,
      options: [
        { value: "civilian",     label: "Civilian (not military)" },
        { value: "active_duty",  label: "Active Duty Military" },
        { value: "veteran",      label: "Veteran / Retired Military" },
        { value: "reserve",      label: "Reserve / National Guard" },
      ],
    },
    { questionKey: "married_status_change", category: "identity", sortOrder: 7,
      questionText: "Did your marital status change during the tax year (married, divorced, or widowed)?",
      helpText: "A change in marital status can affect your filing status, withholding, and applicable deductions.",
      inputType: "yes_no", isRequired: false, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },

    // ── Income Sources ──────────────────────────────────────────────────────
    { questionKey: "has_w2", category: "income", sortOrder: 10,
      questionText: "Did you receive a W-2 (wages from an employer) during the tax year?",
      helpText: "W-2 income comes from being an employee. Your employer withholds income tax, Social Security, and Medicare. You should receive your W-2 by January 31.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_self_employment", category: "income", sortOrder: 11,
      questionText: "Did you earn income from self-employment, freelancing, or a side business?",
      helpText: "This includes any work where you were paid as an independent contractor, received 1099-NEC forms, or ran your own business as a sole proprietor.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_rental_income", category: "income", sortOrder: 12,
      questionText: "Did you receive rental income from any property you own?",
      helpText: "Rental income from houses, apartments, vacation rentals (Airbnb/VRBO), or commercial property must be reported.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_investment_income", category: "income", sortOrder: 13,
      questionText: "Did you have investment income (dividends, interest, or sold stocks/bonds/crypto)?",
      helpText: "This includes stock dividends, mutual fund distributions, bank interest, capital gains from selling investments, or gains from cryptocurrency transactions.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_retirement_income", category: "income", sortOrder: 14,
      questionText: "Did you receive distributions from a pension, 401(k), IRA, or other retirement plan?",
      helpText: "Any withdrawals from qualified retirement plans generate a 1099-R and may be taxable.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_social_security", category: "income", sortOrder: 15,
      questionText: "Did you receive Social Security benefits?",
      helpText: "SSA-1099 is sent by the Social Security Administration. Up to 85% of benefits may be taxable depending on your combined income.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_unemployment", category: "income", sortOrder: 16,
      questionText: "Did you receive unemployment compensation?",
      helpText: "Unemployment benefits are fully taxable and reported on Form 1099-G from your state.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_foreign_income", category: "income", sortOrder: 17,
      questionText: "Did you earn income in a foreign country or pay taxes to a foreign government?",
      helpText: "Foreign income must be reported. You may qualify for the Foreign Earned Income Exclusion (Form 2555) or the Foreign Tax Credit (Form 1116).",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_gambling", category: "income", sortOrder: 18,
      questionText: "Did you have gambling winnings (casino, lottery, sports betting, online gaming)?",
      helpText: "All gambling winnings are taxable. You may receive Form W-2G for larger winnings. You can deduct losses only if you itemize.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_partnership_k1", category: "income", sortOrder: 19,
      questionText: "Did you receive a Schedule K-1 from a partnership, S-corporation, trust, or estate?",
      helpText: "K-1 forms report your share of income, deductions, and credits from pass-through entities.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },

    // ── Deductions & Adjustments ─────────────────────────────────────────────
    { questionKey: "wants_itemize", category: "deductions", sortOrder: 20,
      questionText: "Do you think you may want to itemize your deductions instead of taking the standard deduction?",
      helpText: "Itemizing makes sense if your deductible expenses (mortgage interest, state taxes, charity, medical) exceed the standard deduction ($14,600 single / $29,200 MFJ for 2024).",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_mortgage", category: "deductions", sortOrder: 21,
      questionText: "Did you pay mortgage interest on a home loan?",
      helpText: "Your lender will send Form 1098 showing the mortgage interest paid. This is deductible if you itemize.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "sold_home", category: "deductions", sortOrder: 22,
      questionText: "Did you sell your primary home or any real estate during the tax year?",
      helpText: "Gains on home sales may be excluded up to $250,000 ($500,000 MFJ). Any gain above the exclusion is taxable and reported on Schedule D.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_student_loan", category: "deductions", sortOrder: 23,
      questionText: "Did you pay student loan interest?",
      helpText: "You can deduct up to $2,500 of student loan interest. Your servicer sends Form 1098-E if you paid $600 or more.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_hsa", category: "deductions", sortOrder: 24,
      questionText: "Did you contribute to or withdraw from a Health Savings Account (HSA)?",
      helpText: "HSA contributions are tax-deductible. Withdrawals for qualified medical expenses are tax-free. Form 8889 is required.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },

    // ── Credits ─────────────────────────────────────────────────────────────
    { questionKey: "has_dependents", category: "credits", sortOrder: 30,
      questionText: "Do you have qualifying children or dependents?",
      helpText: "Qualifying children may entitle you to the Child Tax Credit ($2,000/child), Earned Income Credit, and other benefits.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_childcare_expenses", category: "credits", sortOrder: 31,
      questionText: "Did you pay for childcare or dependent care so you (and your spouse) could work or look for work?",
      helpText: "Qualifying expenses for daycare, babysitters, or after-school programs for children under 13 may qualify for the Child and Dependent Care Credit.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "has_dependents", dependsOnVal: "yes",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_education_expenses", category: "credits", sortOrder: 32,
      questionText: "Did you (or a dependent) pay tuition for college, university, or a vocational school?",
      helpText: "The American Opportunity Credit (up to $2,500) and Lifetime Learning Credit (up to $2,000) may apply. Your school sends Form 1098-T.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "adopted_child", category: "credits", sortOrder: 33,
      questionText: "Did you adopt a child during the tax year?",
      helpText: "The Adoption Credit (up to $16,810 per child for 2024) is available for qualified adoption expenses.",
      inputType: "yes_no", isRequired: false, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "made_retirement_contributions", category: "credits", sortOrder: 34,
      questionText: "Did you contribute to a traditional IRA, Roth IRA, or employer retirement plan (401k, 403b, etc.)?",
      helpText: "Traditional IRA contributions may be deductible. All eligible contributions may qualify for the Saver's Credit if your income qualifies.",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },

    // ── Healthcare ──────────────────────────────────────────────────────────
    { questionKey: "health_insurance_source", category: "healthcare", sortOrder: 40,
      questionText: "What was your primary source of health insurance coverage during the tax year?",
      helpText: "Your insurance source determines which tax forms are relevant to you.",
      inputType: "single_choice", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false,
      options: [
        { value: "employer",    label: "Employer-provided insurance" },
        { value: "marketplace", label: "Health Insurance Marketplace (Healthcare.gov / state exchange)" },
        { value: "medicare",    label: "Medicare" },
        { value: "medicaid",    label: "Medicaid / CHIP" },
        { value: "self_paid",   label: "Self-paid / Direct purchase (not Marketplace)" },
        { value: "military",    label: "TRICARE / VA coverage" },
        { value: "uninsured",   label: "I had no health insurance for part or all of the year" },
        { value: "multiple",    label: "Multiple sources" },
      ],
    },

    // ── Special Situations ───────────────────────────────────────────────────
    { questionKey: "has_home_office", category: "special", sortOrder: 50,
      questionText: "Did you use part of your home exclusively and regularly for business purposes?",
      helpText: "Self-employed individuals who use a dedicated space at home for their business may deduct home office expenses (Form 8829).",
      inputType: "yes_no", isRequired: false, dependsOnKey: "has_self_employment", dependsOnVal: "yes",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_energy_improvements", category: "special", sortOrder: 51,
      questionText: "Did you make energy-efficiency improvements to your home (solar panels, heat pump, insulation, EV charger)?",
      helpText: "The Residential Clean Energy Credit covers 30% of eligible costs for solar and battery systems. The Energy Efficient Home Improvement Credit covers other upgrades.",
      inputType: "yes_no", isRequired: false, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_noncash_donations", category: "special", sortOrder: 52,
      questionText: "Did you make noncash charitable donations totaling more than $500 (clothing, furniture, car, etc.)?",
      helpText: "Noncash donations over $500 require Form 8283. Donations over $5,000 require a qualified appraisal.",
      inputType: "yes_no", isRequired: false, dependsOnKey: "wants_itemize", dependsOnVal: "yes",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "early_retirement_withdrawal", category: "special", sortOrder: 53,
      questionText: "Did you take an early withdrawal (before age 59½) from a retirement account?",
      helpText: "Early withdrawals generally incur a 10% penalty plus income taxes unless an exception applies.",
      inputType: "yes_no", isRequired: false, dependsOnKey: "has_retirement_income", dependsOnVal: "yes",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "has_foreign_accounts", category: "special", sortOrder: 54,
      questionText: "Did you have any foreign bank or financial accounts with a total value over $10,000 at any point during the year?",
      helpText: "If yes, you must file an FBAR (FinCEN Form 114) by April 15. You may also need Form 8938 if accounts exceed FATCA thresholds.",
      inputType: "yes_no", isRequired: false, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "needs_extension", category: "special", sortOrder: 55,
      questionText: "Do you need more time to file and plan to request a filing extension?",
      helpText: "An automatic 6-month extension (to October 15) is available by filing Form 4868. This extends the time to FILE, not the time to PAY.",
      inputType: "yes_no", isRequired: false, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "made_estimated_payments", category: "special", sortOrder: 56,
      questionText: "Did you make quarterly estimated tax payments during the tax year?",
      helpText: "If you made estimated payments (1040-ES), you'll report them on your return. If you underpaid, you may owe a penalty (Form 2210).",
      inputType: "yes_no", isRequired: false, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    { questionKey: "owes_back_taxes", category: "special", sortOrder: 57,
      questionText: "Do you owe back taxes or expect to be unable to pay your full tax bill?",
      helpText: "If you can't pay in full, you may set up an installment agreement with the IRS using Form 9465.",
      inputType: "yes_no", isRequired: false, dependsOnKey: "entity_type", dependsOnVal: "individual",
      appliesToIndividual: true, appliesToBusiness: false, options: null,
    },
    // Business-specific
    { questionKey: "business_entity_type", category: "identity", sortOrder: 60,
      questionText: "What type of business entity are you filing for?",
      helpText: "The entity type determines which business return form to use.",
      inputType: "single_choice", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "business",
      appliesToIndividual: false, appliesToBusiness: true,
      options: [
        { value: "c_corp",           label: "C Corporation (Form 1120)" },
        { value: "s_corp",           label: "S Corporation (Form 1120-S)" },
        { value: "partnership",      label: "Partnership / Multi-Member LLC (Form 1065)" },
        { value: "sole_prop_llc",    label: "Single-Member LLC / Sole Proprietor (Schedule C on 1040)" },
      ],
    },
    { questionKey: "has_employees", category: "employer", sortOrder: 61,
      questionText: "Do you have employees (W-2 employees, not contractors)?",
      helpText: "Employers must file quarterly payroll tax returns (Form 941) and annual unemployment returns (Form 940).",
      inputType: "yes_no", isRequired: true, dependsOnKey: "entity_type", dependsOnVal: "business",
      appliesToIndividual: false, appliesToBusiness: true, options: null,
    },
  ];

  for (const q of questions) {
    await db.insert(taxQuestions).values({
      questionKey:   q.questionKey,
      category:      q.category,
      questionText:  q.questionText,
      helpText:      q.helpText ?? null,
      inputType:     q.inputType,
      options:       q.options ?? null,
      isRequired:    q.isRequired,
      dependsOnKey:  q.dependsOnKey ?? null,
      dependsOnVal:  q.dependsOnVal ?? null,
      sortOrder:     q.sortOrder,
      appliesToIndividual: q.appliesToIndividual,
      appliesToBusiness:   q.appliesToBusiness,
    });
  }
  console.log(`[tax-seed] ${questions.length} questionnaire questions seeded.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. FORM REQUIREMENT RULES
// ─────────────────────────────────────────────────────────────────────────────
export async function seedFormRules() {
  const existing = await db.select().from(formRequirementRules);
  if (existing.length > 0) return;

  const rules = [
    // Every individual needs 1040
    { questionKey: "entity_type", questionValue: "individual",   formSource: "federal", formNumber: "1040",          priority: "required", note: "Every individual taxpayer files Form 1040." },
    // 65+ can use 1040-SR
    { questionKey: "age_65_or_older",    questionValue: "yes",  formSource: "federal", formNumber: "1040-SR",        priority: "likely",   note: "Taxpayers 65+ may use Form 1040-SR (larger print, same content as 1040)." },
    // Nonresident uses 1040-NR
    { questionKey: "residency_status",   questionValue: "nonresident", formSource: "federal", formNumber: "1040-NR", priority: "required", note: "Nonresident aliens must file Form 1040-NR instead of Form 1040." },
    // W-2 income
    { questionKey: "has_w2",             questionValue: "yes",  formSource: "federal", formNumber: "W-2",            priority: "required", note: "Your employer provides Form W-2 by January 31. You'll need it to complete your 1040." },
    // Self-employment
    { questionKey: "has_self_employment",questionValue: "yes",  formSource: "federal", formNumber: "Schedule C",     priority: "required", note: "Schedule C reports profit or loss from your self-employed business." },
    { questionKey: "has_self_employment",questionValue: "yes",  formSource: "federal", formNumber: "Schedule SE",    priority: "required", note: "Schedule SE calculates your self-employment tax (Social Security + Medicare)." },
    { questionKey: "has_self_employment",questionValue: "yes",  formSource: "federal", formNumber: "1040-ES",        priority: "likely",   note: "If you expect to owe $1,000+ after withholding, you should make quarterly estimated tax payments." },
    { questionKey: "has_self_employment",questionValue: "yes",  formSource: "federal", formNumber: "8995",           priority: "likely",   note: "You may qualify for the 20% Qualified Business Income deduction (Form 8995)." },
    { questionKey: "has_self_employment",questionValue: "yes",  formSource: "federal", formNumber: "1099-NEC",       priority: "required", note: "Clients who paid you $600+ will send you Form 1099-NEC." },
    // Home office
    { questionKey: "has_home_office",    questionValue: "yes",  formSource: "federal", formNumber: "8829",           priority: "required", note: "Form 8829 calculates your home office deduction." },
    // Rental income
    { questionKey: "has_rental_income",  questionValue: "yes",  formSource: "federal", formNumber: "Schedule E",     priority: "required", note: "Schedule E reports rental income and expenses." },
    // Investment income
    { questionKey: "has_investment_income", questionValue: "yes", formSource: "federal", formNumber: "Schedule D",   priority: "required", note: "Schedule D summarizes capital gains and losses." },
    { questionKey: "has_investment_income", questionValue: "yes", formSource: "federal", formNumber: "8949",         priority: "required", note: "Form 8949 details each capital asset sale (stocks, bonds, crypto, etc.)." },
    { questionKey: "has_investment_income", questionValue: "yes", formSource: "federal", formNumber: "1099-B",       priority: "required", note: "Your broker sends Form 1099-B showing proceeds from securities sales." },
    { questionKey: "has_investment_income", questionValue: "yes", formSource: "federal", formNumber: "1099-DIV",     priority: "required", note: "Your brokerage sends Form 1099-DIV for dividends of $10+." },
    { questionKey: "has_investment_income", questionValue: "yes", formSource: "federal", formNumber: "1099-INT",     priority: "required", note: "Banks send Form 1099-INT for interest income of $10+." },
    { questionKey: "has_investment_income", questionValue: "yes", formSource: "federal", formNumber: "Schedule B",   priority: "likely",   note: "Schedule B is required when interest/dividends exceed $1,500." },
    // Retirement distributions
    { questionKey: "has_retirement_income", questionValue: "yes", formSource: "federal", formNumber: "1099-R",       priority: "required", note: "Your plan administrator sends Form 1099-R for each distribution." },
    { questionKey: "early_retirement_withdrawal", questionValue: "yes", formSource: "federal", formNumber: "5329",   priority: "required", note: "Form 5329 calculates the 10% early withdrawal penalty (unless an exception applies)." },
    // Social Security
    { questionKey: "has_social_security",questionValue: "yes",  formSource: "federal", formNumber: "SSA-1099",       priority: "required", note: "The SSA sends you Form SSA-1099 showing your benefits. Up to 85% may be taxable." },
    // Unemployment
    { questionKey: "has_unemployment",   questionValue: "yes",  formSource: "federal", formNumber: "1099-G",         priority: "required", note: "Your state sends Form 1099-G showing unemployment benefits paid." },
    // Dependents
    { questionKey: "has_dependents",     questionValue: "yes",  formSource: "federal", formNumber: "8812",           priority: "required", note: "Form 8812 calculates the Child Tax Credit ($2,000/child) and Additional Child Tax Credit." },
    { questionKey: "has_childcare_expenses", questionValue: "yes", formSource: "federal", formNumber: "2441",        priority: "required", note: "Form 2441 claims the Child and Dependent Care Credit." },
    // Education
    { questionKey: "has_education_expenses", questionValue: "yes", formSource: "federal", formNumber: "8863",        priority: "required", note: "Form 8863 claims the American Opportunity Credit or Lifetime Learning Credit." },
    { questionKey: "has_education_expenses", questionValue: "yes", formSource: "federal", formNumber: "1098-T",      priority: "required", note: "Your school sends Form 1098-T showing tuition paid. Needed to complete Form 8863." },
    // Adoption
    { questionKey: "adopted_child",      questionValue: "yes",  formSource: "federal", formNumber: "8839",           priority: "required", note: "Form 8839 claims the Adoption Credit (up to $16,810 per child for 2024)." },
    // Retirement contributions
    { questionKey: "made_retirement_contributions", questionValue: "yes", formSource: "federal", formNumber: "5498", priority: "required", note: "Your IRA custodian sends Form 5498 showing your contributions. Keep for your records." },
    { questionKey: "made_retirement_contributions", questionValue: "yes", formSource: "federal", formNumber: "8880", priority: "likely",   note: "Form 8880 claims the Saver's Credit for lower-income taxpayers contributing to retirement plans." },
    // Mortgage / itemizing
    { questionKey: "has_mortgage",       questionValue: "yes",  formSource: "federal", formNumber: "1098",           priority: "required", note: "Your lender sends Form 1098 showing mortgage interest paid. Required to itemize." },
    { questionKey: "wants_itemize",      questionValue: "yes",  formSource: "federal", formNumber: "Schedule A",     priority: "required", note: "Schedule A is used to itemize deductions (mortgage interest, SALT, charity, medical)." },
    { questionKey: "has_noncash_donations", questionValue: "yes", formSource: "federal", formNumber: "8283",         priority: "required", note: "Form 8283 documents noncash charitable contributions over $500." },
    // Student loan
    { questionKey: "has_student_loan",   questionValue: "yes",  formSource: "federal", formNumber: "1098-E",         priority: "required", note: "Your loan servicer sends Form 1098-E for student loan interest of $600+." },
    { questionKey: "has_student_loan",   questionValue: "yes",  formSource: "federal", formNumber: "Schedule 1",     priority: "required", note: "Schedule 1 is used to deduct student loan interest (up to $2,500)." },
    // HSA
    { questionKey: "has_hsa",            questionValue: "yes",  formSource: "federal", formNumber: "8889",           priority: "required", note: "Form 8889 reports HSA contributions and distributions." },
    { questionKey: "has_hsa",            questionValue: "yes",  formSource: "federal", formNumber: "1099-SA",        priority: "required", note: "Your HSA administrator sends Form 1099-SA for distributions." },
    { questionKey: "has_hsa",            questionValue: "yes",  formSource: "federal", formNumber: "5498-SA",        priority: "required", note: "Your HSA administrator sends Form 5498-SA showing contributions." },
    // Health insurance — Marketplace
    { questionKey: "health_insurance_source", questionValue: "marketplace", formSource: "federal", formNumber: "1095-A", priority: "required", note: "Healthcare.gov sends Form 1095-A showing Marketplace coverage. Required to complete Form 8962." },
    { questionKey: "health_insurance_source", questionValue: "marketplace", formSource: "federal", formNumber: "8962",   priority: "required", note: "Form 8962 reconciles advance premium tax credit payments with your actual eligibility." },
    // Foreign income
    { questionKey: "has_foreign_income", questionValue: "yes",  formSource: "federal", formNumber: "2555",           priority: "likely",   note: "Form 2555 claims the Foreign Earned Income Exclusion (up to $126,500 for 2024) if you lived abroad." },
    { questionKey: "has_foreign_income", questionValue: "yes",  formSource: "federal", formNumber: "1116",           priority: "likely",   note: "Form 1116 claims a credit for foreign income taxes paid, reducing double taxation." },
    { questionKey: "has_foreign_income", questionValue: "yes",  formSource: "federal", formNumber: "Schedule 3",     priority: "required", note: "Schedule 3 carries the Foreign Tax Credit from Form 1116 to your 1040." },
    // Foreign accounts
    { questionKey: "has_foreign_accounts", questionValue: "yes", formSource: "federal", formNumber: "FinCEN 114 (FBAR)", priority: "required", note: "FBAR must be filed electronically with FinCEN (not the IRS) by April 15." },
    { questionKey: "has_foreign_accounts", questionValue: "yes", formSource: "federal", formNumber: "8938",          priority: "likely",   note: "Form 8938 (FATCA) is required if foreign assets exceed $50,000 ($100,000 MFJ)." },
    // Home sale
    { questionKey: "sold_home",          questionValue: "yes",  formSource: "federal", formNumber: "8949",           priority: "required", note: "Form 8949 reports the details of your home sale." },
    { questionKey: "sold_home",          questionValue: "yes",  formSource: "federal", formNumber: "Schedule D",     priority: "required", note: "Schedule D summarizes the gain/loss from your home sale." },
    // Energy
    { questionKey: "has_energy_improvements", questionValue: "yes", formSource: "federal", formNumber: "5695",       priority: "required", note: "Form 5695 claims the Residential Clean Energy Credit (30% for solar) and Home Improvement Credit." },
    // Gambling
    { questionKey: "has_gambling",       questionValue: "yes",  formSource: "federal", formNumber: "W-2G",           priority: "required", note: "Casinos send Form W-2G for winnings of $600+ (or $1,200+ for slots/bingo)." },
    { questionKey: "has_gambling",       questionValue: "yes",  formSource: "federal", formNumber: "Schedule 1",     priority: "required", note: "Gambling winnings and losses are reported on Schedule 1." },
    // Partnership K-1
    { questionKey: "has_partnership_k1",  questionValue: "yes", formSource: "federal", formNumber: "Schedule K-1 (1065)", priority: "required", note: "Your partnership or LLC provides Schedule K-1 showing your share of income/losses." },
    // Extension
    { questionKey: "needs_extension",    questionValue: "yes",  formSource: "federal", formNumber: "4868",           priority: "required", note: "File Form 4868 by April 15 for an automatic 6-month extension to file (not to pay)." },
    // Estimated payments
    { questionKey: "made_estimated_payments", questionValue: "yes", formSource: "federal", formNumber: "2210",       priority: "maybe",    note: "Form 2210 checks if you owe an underpayment penalty. Often not required if withholding covers 90%+ of tax." },
    // Installment agreement
    { questionKey: "owes_back_taxes",    questionValue: "yes",  formSource: "federal", formNumber: "9465",           priority: "likely",   note: "Form 9465 requests a monthly installment plan if you can't pay your full tax bill." },
    // Military
    { questionKey: "military_status",    questionValue: "active_duty", formSource: "federal", formNumber: "3903",    priority: "likely",   note: "Active duty members can deduct PCS moving expenses on Form 3903." },
    // Business
    { questionKey: "business_entity_type", questionValue: "c_corp",      formSource: "federal", formNumber: "1120",          priority: "required", note: "C corporations file Form 1120." },
    { questionKey: "business_entity_type", questionValue: "s_corp",      formSource: "federal", formNumber: "1120-S",         priority: "required", note: "S corporations file Form 1120-S." },
    { questionKey: "business_entity_type", questionValue: "partnership",  formSource: "federal", formNumber: "1065",           priority: "required", note: "Partnerships file Form 1065." },
    { questionKey: "business_entity_type", questionValue: "partnership",  formSource: "federal", formNumber: "Schedule K-1 (1065)", priority: "required", note: "Form 1065 must include Schedule K-1 for each partner." },
    { questionKey: "business_entity_type", questionValue: "sole_prop_llc",formSource: "federal", formNumber: "Schedule C",     priority: "required", note: "Sole proprietors and single-member LLCs report on Schedule C attached to Form 1040." },
    { questionKey: "has_employees",      questionValue: "yes",  formSource: "federal", formNumber: "941",            priority: "required", note: "Employers file quarterly payroll tax returns on Form 941." },
    { questionKey: "has_employees",      questionValue: "yes",  formSource: "federal", formNumber: "940",            priority: "required", note: "Employers file an annual FUTA tax return on Form 940." },
    { questionKey: "has_employees",      questionValue: "yes",  formSource: "federal", formNumber: "W-2",            priority: "required", note: "Employers must issue W-2 to each employee by January 31." },
  ];

  for (const r of rules) {
    await db.insert(formRequirementRules).values(r);
  }
  console.log(`[tax-seed] ${rules.length} form requirement rules seeded.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER SEED FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
export async function seedTaxData(taxYear: number) {
  console.log(`[tax-seed] Seeding tax data for ${taxYear}...`);
  await seedTaxPeriod(taxYear);
  await seedFederalForms();
  await seedStateForms();
  await seedTaxBrackets(taxYear);
  await seedStandardDeductions(taxYear);
  await seedSpecialRates(taxYear);
  await seedQuestions();
  await seedFormRules();
  console.log(`[tax-seed] ✓ All tax data seeded for ${taxYear}.`);
}
