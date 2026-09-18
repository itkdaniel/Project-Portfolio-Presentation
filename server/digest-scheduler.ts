/**
 * Weekly activity digest scheduler.
 *
 * Sends the digest every Monday at 08:00 UTC. The scheduler uses a single
 * timeout followed by another calculated timeout instead of setInterval so
 * daylight-saving changes or a slow send run cannot shift or overlap runs.
 */

import { storage } from "./storage";
import { sendNotification } from "./notify";
import { log } from "./logger";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeeklyDigestRunResult {
  total: number;
  sent: number;
  failed: number;
}

export function nextMondayAt8Utc(now = new Date()): Date {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    8,
    0,
    0,
    0,
  ));
  const daysUntilMonday = (1 - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + (daysUntilMonday === 0 && next <= now ? 7 : daysUntilMonday));
  return next;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPeriod(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Send a digest to every user who enabled the weekly digest setting.
 *
 * The default period is the seven days ending at the current instant. The
 * optional end time makes the period deterministic for the scheduled run and
 * for callers that need to replay a specific period.
 */
export async function runWeeklyDigest(endAt = new Date()): Promise<WeeklyDigestRunResult> {
  const periodEnd = new Date(endAt);
  const periodStart = new Date(periodEnd.getTime() - WEEK_MS);
  const recipients = await storage.getWeeklyDigestRecipients();
  let sent = 0;
  let failed = 0;

  await Promise.all(recipients.map(async (recipient) => {
    try {
      const activity = await storage.getWeeklyDigestActivity(recipient.id, periodStart, periodEnd);
      const name = recipient.fullName?.trim() || recipient.username;
      const period = `${formatPeriod(periodStart)} – ${formatPeriod(periodEnd)}`;
      const body = [
        `Here is your NexusConsult activity summary for ${period}.`,
        "",
        `New projects: ${activity.newProjects}`,
        `Bookings: ${activity.bookings}`,
        `Pending scope requests: ${activity.pendingScopeRequests}`,
      ].join("\n");
      const safeName = escapeHtml(name);
      const html = `
        <p style="color:#d4d4d8;line-height:1.6;">Hello ${safeName},</p>
        <p style="color:#d4d4d8;line-height:1.6;">Here is your NexusConsult activity summary for ${escapeHtml(period)}.</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;color:#d4d4d8;">
          <tr><td style="padding:8px 0;border-bottom:1px solid #3f3f46;">New projects</td><td align="right" style="padding:8px 0;border-bottom:1px solid #3f3f46;font-weight:600;">${activity.newProjects}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #3f3f46;">Bookings</td><td align="right" style="padding:8px 0;border-bottom:1px solid #3f3f46;font-weight:600;">${activity.bookings}</td></tr>
          <tr><td style="padding:8px 0;">Pending scope requests</td><td align="right" style="padding:8px 0;font-weight:600;">${activity.pendingScopeRequests}</td></tr>
        </table>`;

      await sendNotification(recipient.id, {
        type: "info",
        title: "Your weekly NexusConsult digest",
        body,
        link: "/dashboard",
        emailSubject: `NexusConsult weekly digest — ${period}`,
        emailHtml: html,
        emailText: body,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      log(`[digest-scheduler] Failed to send digest to ${recipient.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));

  return { total: recipients.length, sent, failed };
}

function scheduleNextDigest(): void {
  const nextRun = nextMondayAt8Utc();
  const delay = Math.max(0, nextRun.getTime() - Date.now());
  log(`[digest-scheduler] Next weekly digest in ${Math.round(delay / 3600000)}h (${nextRun.toISOString()}).`);

  setTimeout(async () => {
    try {
      const result = await runWeeklyDigest(nextRun);
      log(`[digest-scheduler] Digest complete: ${result.sent}/${result.total} sent, ${result.failed} failed.`);
    } catch (error) {
      log(`[digest-scheduler] Run error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      scheduleNextDigest();
    }
  }, delay);
}

export function initWeeklyDigestScheduler(): void {
  scheduleNextDigest();
  log("[digest-scheduler] Initialized.");
}