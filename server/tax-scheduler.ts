/**
 * Tax Scheduler — Annual Auto-Update
 * Runs on application startup and then checks every 24 hours.
 * On January 1 of a new year, seeds the next tax year's data.
 */

import { db } from "./db";
import { taxPeriods } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  seedTaxBrackets, seedStandardDeductions, seedSpecialRates, seedTaxPeriod,
} from "./tax-seed";

function msUntilNextMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 5, 0); // 00:00:05 next day
  return tomorrow.getTime() - now.getTime();
}

async function checkAndSeedNewTaxYear() {
  const now = new Date();
  const currentYear = now.getFullYear();
  // Tax year to seed = previous calendar year (e.g. in 2025, seed tax year 2024)
  // AND seed the upcoming year so rate lookups work ahead of filing season
  const taxYearsToEnsure = [currentYear - 1, currentYear];

  for (const taxYear of taxYearsToEnsure) {
    const existing = await db
      .select()
      .from(taxPeriods)
      .where(eq(taxPeriods.taxYear, taxYear));

    if (existing.length === 0) {
      console.log(`[tax-scheduler] New tax year detected: ${taxYear}. Running auto-seed...`);
      await seedTaxPeriod(taxYear);
      await seedTaxBrackets(taxYear);
      await seedStandardDeductions(taxYear);
      await seedSpecialRates(taxYear);
      // Mark prior years as closed
      const priorYear = taxYear - 2;
      const prior = await db.select().from(taxPeriods).where(eq(taxPeriods.taxYear, priorYear));
      if (prior.length > 0 && prior[0].status === "active") {
        await db
          .update(taxPeriods)
          .set({ status: "closed" })
          .where(eq(taxPeriods.taxYear, priorYear));
        console.log(`[tax-scheduler] Marked tax year ${priorYear} as closed.`);
      }
      console.log(`[tax-scheduler] ✓ Tax year ${taxYear} auto-seeded.`);
    }
  }
}

function scheduleDailyCheck() {
  const ms = msUntilNextMidnight();
  console.log(`[tax-scheduler] Next daily tax-year check in ${Math.round(ms / 3600000)}h.`);

  setTimeout(async () => {
    await checkAndSeedNewTaxYear();
    // After first run, check every 24 hours
    setInterval(checkAndSeedNewTaxYear, 24 * 60 * 60 * 1000);
  }, ms);
}

export async function initTaxScheduler() {
  try {
    await checkAndSeedNewTaxYear();
    scheduleDailyCheck();
    console.log("[tax-scheduler] Initialized.");
  } catch (err) {
    console.error("[tax-scheduler] Init error:", err);
  }
}
