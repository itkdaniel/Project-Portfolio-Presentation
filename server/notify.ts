/**
 * server/notify.ts
 * Centralized notification dispatcher. Routes to: in-app DB, email, SMS (Twilio).
 * All notification sends throughout the app flow through sendNotification().
 * SMS is a no-op (logged warning) when Twilio env vars are absent.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { users, userNotificationPrefs, notifications } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "./logger";
import { sendEmail } from "./email";
import { pubsub } from "./pubsub";

export interface NotifyPayload {
  type?:  string;   // "info" | "success" | "warning" | "error" | "scope_request" | "scope_update"
  title:  string;
  body:   string;
  link?:  string;   // optional deep-link shown in the notification
  emailSubject?: string;
  emailHtml?:    string;
  emailText?:    string;
}

// ── Get or auto-create notification prefs for a user ─────────────────────────

async function getPrefs(userId: string) {
  const [prefs] = await db.select().from(userNotificationPrefs).where(eq(userNotificationPrefs.userId, userId));
  if (prefs) return prefs;
  const [created] = await db.insert(userNotificationPrefs).values({ userId }).returning();
  return created;
}

// ── SMS via Twilio ────────────────────────────────────────────────────────────

async function sendSms(to: string, body: string): Promise<void> {
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !auth || !from) {
    log("[notify/sms] Twilio env vars not configured — skipping SMS");
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const encoded = Buffer.from(`${sid}:${auth}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encoded}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      log(`[notify/sms] Twilio error ${res.status}: ${text}`);
    } else {
      log(`[notify/sms] SMS sent to ${to}`);
    }
  } catch (err: any) {
    log(`[notify/sms] ERROR: ${err.message}`);
  }
}

// ── Main dispatcher ────────────────────────────────────────────────────────────

export async function sendNotification(userId: string, payload: NotifyPayload): Promise<void> {
  const prefs = await getPrefs(userId);

  // 1. In-app notification (default enabled)
  if (prefs.inApp) {
    const [notification] = await db.insert(notifications).values({
      userId,
      type:  payload.type ?? "info",
      title: payload.title,
      body:  payload.body,
      read:  false,
      link:  payload.link,
    }).returning();
    pubsub.publishToUser(userId, "notification:created", notification);
  }

  // 2. Email
  if (prefs.email) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user?.email) {
      const html = payload.emailHtml ?? `
<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Inter',Arial,sans-serif;color:#e4e4e7;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#18181b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
<tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#1a1a2e 100%);padding:32px 40px;text-align:center;">
<h1 style="margin:0;font-size:20px;font-weight:700;color:#f4f4f5;">${payload.title}</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="color:#d4d4d8;line-height:1.6;">${payload.body}</p>
${payload.link ? `<p style="margin-top:24px;"><a href="${payload.link}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 24px;border-radius:9999px;font-weight:600;font-size:14px;">View Details</a></p>` : ""}
<p style="color:#71717a;font-size:12px;margin-top:24px;">NexusConsult — Automation &amp; Consulting Services</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
      sendEmail({
        to:      user.email,
        subject: payload.emailSubject ?? payload.title,
        html,
        text: payload.emailText ?? `${payload.title}\n\n${payload.body}`,
      }).catch(() => {});
    }
  }

  // 3. SMS
  if (prefs.sms && prefs.smsPhone) {
    const smsBody = `${payload.title}: ${payload.body}`.slice(0, 160);
    sendSms(prefs.smsPhone, smsBody).catch(() => {});
  }
}

// ── Notify all admins ──────────────────────────────────────────────────────────

export async function notifyAllAdmins(payload: NotifyPayload): Promise<void> {
  const admins = await db.select().from(users).where(eq(users.role, "admin"));
  await Promise.all(admins.map(a => sendNotification(a.id, payload)));
}

// ── HMAC-signed one-click approval links ──────────────────────────────────────

function getSigningKey(): string {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) throw new Error("FIELD_ENCRYPTION_KEY env var is required for signed approval links");
  return key;
}

/**
 * Generate a signed URL for one-click scope request approval/denial in admin emails.
 * Token expires in 48 hours. Uses HMAC-SHA256 with FIELD_ENCRYPTION_KEY.
 */
export function generateApprovalLink(scopeRequestId: string, action: "approved" | "denied"): string {
  const exp = Math.floor(Date.now() / 1000) + 48 * 3600; // 48h from now
  const payload = `${scopeRequestId}:${action}:${exp}`;
  const sig = createHmac("sha256", getSigningKey()).update(payload).digest("hex");
  const base = process.env.APP_URL ?? "http://localhost:5000";
  return `${base}/api/scope-requests/${scopeRequestId}/confirm?action=${action}&exp=${exp}&sig=${sig}`;
}

/**
 * Verify a one-click approval link token.
 * Returns false if expired, tampered, or malformed.
 */
export function verifyApprovalToken(scopeRequestId: string, action: string, exp: string, sig: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const expNum = parseInt(exp, 10);
  if (!expNum || expNum < now) return false;
  const payload = `${scopeRequestId}:${action}:${exp}`;
  const expected = createHmac("sha256", getSigningKey()).update(payload).digest("hex");
  try {
    // Constant-time comparison to prevent timing attacks
    const sigBuf      = Buffer.from(sig,      "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

// ── Test-send (one message per enabled channel) ────────────────────────────────

export async function testSendNotification(userId: string): Promise<{ channels: string[] }> {
  const prefs = await getPrefs(userId);
  const channels: string[] = [];

  if (prefs.inApp) {
    const [notification] = await db.insert(notifications).values({
      userId,
      type:  "info",
      title: "Test Notification",
      body:  "This is a test in-app notification from NexusConsult.",
      read:  false,
    }).returning();
    pubsub.publishToUser(userId, "notification:created", notification);
    channels.push("in_app");
  }

  if (prefs.email) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user?.email) {
      await sendEmail({
        to:      user.email,
        subject: "NexusConsult — Test Notification",
        html:    `<p style="font-family:sans-serif;">This is a test notification from <strong>NexusConsult</strong>. Your notification settings are working.</p>`,
        text:    "This is a test notification from NexusConsult. Your notification settings are working.",
      });
      channels.push("email");
    }
  }

  if (prefs.sms && prefs.smsPhone) {
    await sendSms(prefs.smsPhone, "NexusConsult: This is a test SMS notification.");
    channels.push("sms");
  }

  return { channels };
}
