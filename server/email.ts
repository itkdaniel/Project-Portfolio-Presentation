/**
 * server/email.ts
 * Email service with Nodemailer. Reads configuration from the email_config table.
 * Falls back to console logging when SMTP is disabled or not configured.
 */

import { db } from "./db";
import { emailConfig } from "@shared/schema";
import { log } from "./logger";
import type { Booking } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmailPayload {
  to:      string;
  subject: string;
  html:    string;
  text?:   string;
}

export interface SendResult {
  success:  boolean;
  messageId?: string;
  error?:   string;
  mode:     "smtp" | "log" | "disabled";
}

// ── Config loader ─────────────────────────────────────────────────────────────

async function getConfig() {
  const [cfg] = await db.select().from(emailConfig).limit(1);
  return cfg ?? null;
}

// ── Core send ─────────────────────────────────────────────────────────────────

export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  const cfg = await getConfig();

  if (!cfg?.enabled || !cfg.smtpHost) {
    log("[email] Email disabled or not configured — logging to console instead");
    log(`[email] TO: ${payload.to}`);
    log(`[email] SUBJECT: ${payload.subject}`);
    log(`[email] BODY: ${payload.text ?? "(html only)"}`);
    return { success: true, mode: "log" };
  }

  try {
    // Dynamic import so nodemailer is only loaded when actually sending
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host:   cfg.smtpHost,
      port:   cfg.smtpPort,
      secure: cfg.smtpSecure,
      auth:   { user: cfg.smtpUser, pass: cfg.smtpPassword },
    });

    const info = await transporter.sendMail({
      from:    `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to:      payload.to,
      replyTo: cfg.replyTo ?? cfg.adminEmail,
      subject: payload.subject,
      html:    payload.html,
      text:    payload.text,
    });

    log(`[email] Sent to ${payload.to} (messageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId, mode: "smtp" };
  } catch (err: any) {
    log(`[email] ERROR: ${err.message}`);
    return { success: false, error: err.message, mode: "smtp" };
  }
}

// ── Booking confirmation email (to the user who booked) ───────────────────────

export async function sendBookingConfirmationToUser(booking: Booking): Promise<SendResult> {
  const cfg = await getConfig();
  const github   = cfg?.githubUrl   ?? "https://github.com/itkdaniel";
  const linkedin = cfg?.linkedinUrl ?? "https://linkedin.com/in/itkdaniel";
  const website  = cfg?.websiteUrl  ?? "https://nexusconsult.dev";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmed — NexusConsult</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Inter',Arial,sans-serif;color:#e4e4e7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;min-height:100vh;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#18181b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#1a1a2e 100%);padding:40px 40px 30px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:16px;">
              <div style="width:36px;height:36px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:8px;display:flex;align-items:center;justify-content:center;">
                <span style="font-size:18px;">⬡</span>
              </div>
              <span style="font-size:20px;font-weight:700;letter-spacing:-0.5px;">Nexus<span style="color:#3b82f6;">Consult</span></span>
            </div>
            <div style="width:56px;height:56px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:50%;margin:0 auto 16px;line-height:56px;text-align:center;font-size:24px;">✓</div>
            <h1 style="margin:0;font-size:24px;font-weight:700;color:#f4f4f5;">Booking Confirmed</h1>
            <p style="margin:8px 0 0;color:#a1a1aa;font-size:14px;">Your consultation session has been scheduled</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:32px 40px 0;">
            <p style="margin:0 0 8px;font-size:16px;color:#d4d4d8;">Hi <strong style="color:#f4f4f5;">${booking.name}</strong>,</p>
            <p style="margin:0;color:#a1a1aa;line-height:1.6;">
              Thank you for scheduling a consultation. Here are the details of your upcoming session:
            </p>
          </td>
        </tr>

        <!-- Details card -->
        <tr>
          <td style="padding:24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#27272a;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
              <tr>
                <td style="padding:20px 24px;">
                  ${detailRow("📅", "Date", booking.date)}
                  ${detailRow("🕐", "Time", booking.time)}
                  ${detailRow("📋", "Meeting Type", booking.meetingType)}
                  ${detailRow("📝", "Details", booking.details)}
                  ${booking.company ? detailRow("🏢", "Company", booking.company) : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 40px 32px;text-align:center;">
            <p style="color:#a1a1aa;font-size:14px;margin-bottom:20px;">
              Need to reschedule or have questions? Simply reply to this email.
            </p>
            <a href="${website}/book" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 32px;border-radius:9999px;font-weight:600;font-size:14px;">
              Book Another Session
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#09090b;padding:24px 40px;border-top:1px solid rgba(255,255,255,0.05);">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#71717a;font-size:12px;">
                  <strong style="color:#a1a1aa;">NexusConsult</strong><br/>
                  Automation &amp; Consulting Services
                </td>
                <td align="right">
                  <a href="${github}" style="display:inline-block;width:32px;height:32px;background:#27272a;border-radius:50%;text-align:center;line-height:32px;text-decoration:none;margin-left:8px;" title="GitHub">
                    <span style="font-size:14px;">⌨</span>
                  </a>
                  <a href="${linkedin}" style="display:inline-block;width:32px;height:32px;background:#27272a;border-radius:50%;text-align:center;line-height:32px;text-decoration:none;margin-left:8px;" title="LinkedIn">
                    <span style="font-size:14px;">in</span>
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return sendEmail({
    to:      booking.email,
    subject: `✓ Booking Confirmed — ${booking.date} at ${booking.time}`,
    html,
    text: `Hi ${booking.name},\n\nYour booking is confirmed!\n\nDate: ${booking.date}\nTime: ${booking.time}\nType: ${booking.meetingType}\nDetails: ${booking.details}\n\nNexusConsult`,
  });
}

// ── Admin notification email ───────────────────────────────────────────────────

export async function sendBookingNotificationToAdmin(booking: Booking): Promise<SendResult> {
  const cfg = await getConfig();
  if (!cfg) return { success: false, error: "No email config", mode: "disabled" };

  const adminEmail = cfg.adminEmail || "admin@nexusconsult.dev";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>New Booking — NexusConsult</title></head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Inter',Arial,sans-serif;color:#e4e4e7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;min-height:100vh;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#18181b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

        <tr>
          <td style="background:linear-gradient(135deg,#1a3a1f 0%,#1a1a2e 100%);padding:32px 40px 28px;text-align:center;">
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#f4f4f5;">🔔 New Booking Request</h1>
            <p style="margin:8px 0 0;color:#a1a1aa;font-size:14px;">A new consultation has been scheduled</p>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#27272a;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
              <tr>
                <td style="padding:20px 24px;">
                  ${detailRow("👤", "Name",    booking.name)}
                  ${detailRow("📧", "Email",   booking.email)}
                  ${booking.company ? detailRow("🏢", "Company", booking.company) : ""}
                  ${detailRow("📅", "Date",    booking.date)}
                  ${detailRow("🕐", "Time",    booking.time)}
                  ${detailRow("📋", "Type",    booking.meetingType)}
                  ${detailRow("📝", "Details", booking.details)}
                  ${detailRow("🆔", "Booking ID", booking.id)}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 40px 32px;text-align:center;">
            <p style="color:#a1a1aa;font-size:13px;margin-bottom:16px;">Respond promptly to confirm this booking with the client.</p>
          </td>
        </tr>

        <tr>
          <td style="background:#09090b;padding:20px 40px;border-top:1px solid rgba(255,255,255,0.05);">
            <p style="margin:0;color:#52525b;font-size:11px;text-align:center;">
              NexusConsult Admin Notification — Do not reply to this email
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return sendEmail({
    to:      adminEmail,
    subject: `[NexusConsult] New Booking: ${booking.name} on ${booking.date}`,
    html,
    text: `New booking received!\n\nName: ${booking.name}\nEmail: ${booking.email}\nCompany: ${booking.company ?? "N/A"}\nDate: ${booking.date}\nTime: ${booking.time}\nType: ${booking.meetingType}\nDetails: ${booking.details}\nID: ${booking.id}`,
  });
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function detailRow(icon: string, label: string, value: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td width="28" style="vertical-align:top;padding-top:1px;font-size:16px;">${icon}</td>
        <td>
          <span style="display:block;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">${label}</span>
          <span style="font-size:14px;color:#d4d4d8;">${value}</span>
        </td>
      </tr>
    </table>`;
}

// ── Email config management ────────────────────────────────────────────────────

export async function getEmailConfig() {
  const [cfg] = await db.select().from(emailConfig).limit(1);
  if (!cfg) {
    // Auto-create default config row
    const [newCfg] = await db.insert(emailConfig).values({}).returning();
    return newCfg;
  }
  return cfg;
}

export async function updateEmailConfig(updates: Partial<typeof emailConfig.$inferInsert>) {
  const cfg = await getEmailConfig();
  const [updated] = await db
    .update(emailConfig)
    .set({ ...updates, updatedAt: new Date() })
    .where((t: any) => t.id.equals ? t.id.equals(cfg.id) : true)
    .returning();
  return updated;
}

export async function sendTestEmail(to: string): Promise<SendResult> {
  return sendEmail({
    to,
    subject: "NexusConsult — Test Email",
    html:    `<p style="font-family:sans-serif;">This is a test email from <strong>NexusConsult</strong>. Your email configuration is working correctly.</p>`,
    text:    "This is a test email from NexusConsult. Your email configuration is working correctly.",
  });
}
