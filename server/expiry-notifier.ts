/**
 * server/expiry-notifier.ts
 * Daily scheduled job that sends in-app + email warnings to users whose
 * AI scope grants are expiring within the next WARN_DAYS days.
 *
 * Registered once at startup via startExpiryNotifier().
 */

import { storage } from "./storage";
import { sendNotification } from "./notify";
import { log } from "./logger";

const WARN_DAYS = 3;
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year:  "numeric",
    month: "long",
    day:   "numeric",
  });
}

export async function runExpiryNotifications(): Promise<void> {
  log("[expiry-notifier] Checking for grants expiring within 3 days…");

  let grants: Awaited<ReturnType<typeof storage.getExpiringGrants>>;
  try {
    grants = await storage.getExpiringGrants(WARN_DAYS);
  } catch (err: any) {
    log(`[expiry-notifier] ERROR fetching expiring grants: ${err.message}`);
    return;
  }

  if (grants.length === 0) {
    log("[expiry-notifier] No expiring grants found.");
    return;
  }

  log(`[expiry-notifier] Sending expiry warnings for ${grants.length} grant(s).`);

  const settingsLink = "/settings#integrations";
  const appBase = process.env.APP_URL ?? "http://localhost:5000";

  for (const grant of grants) {
    const expiryDate = formatDate(grant.expiresAt!);
    const scopeLabel = grant.scope === "uncensored" ? "Uncensored AI" : grant.scope;
    const displayName = grant.username ?? grant.email ?? grant.userId;

    try {
      await sendNotification(grant.userId, {
        type:  "warning",
        title: `Your ${scopeLabel} access expires soon`,
        body:  `Your ${scopeLabel} access is set to expire on ${expiryDate}. ` +
               `If you need continued access, please submit a renewal request from your Settings page.`,
        link:  settingsLink,
        emailSubject: `Action Required — Your ${scopeLabel} access expires on ${expiryDate}`,
        emailHtml: `
<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Inter',Arial,sans-serif;color:#e4e4e7;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#18181b;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
<tr><td style="background:linear-gradient(135deg,#78350f 0%,#1a1a2e 100%);padding:32px 40px;text-align:center;">
<h1 style="margin:0;font-size:20px;font-weight:700;color:#fef3c7;">⚠ AI Access Expiring Soon</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="color:#d4d4d8;line-height:1.6;">Hi ${displayName},</p>
<p style="color:#d4d4d8;line-height:1.6;">
  Your <strong style="color:#f4f4f5;">${scopeLabel}</strong> access is scheduled to expire on
  <strong style="color:#fbbf24;">${expiryDate}</strong>.
</p>
<p style="color:#d4d4d8;line-height:1.6;">
  If you need continued access, please visit your Settings page and submit a renewal request
  before the expiry date.
</p>
<p style="margin-top:24px;">
  <a href="${appBase}/settings#integrations"
     style="display:inline-block;background:#f59e0b;color:#000;text-decoration:none;padding:10px 24px;border-radius:9999px;font-weight:600;font-size:14px;">
    Request Renewal
  </a>
</p>
<p style="color:#71717a;font-size:12px;margin-top:24px;">
  NexusConsult — Automation &amp; Consulting Services<br/>
  You received this email because you have an active AI scope grant on the platform.
</p>
</td></tr>
</table></td></tr></table>
</body></html>`,
        emailText:
          `Hi ${displayName},\n\n` +
          `Your ${scopeLabel} access is expiring on ${expiryDate}.\n\n` +
          `To request a renewal, visit: ${appBase}/settings#integrations\n\n` +
          `— NexusConsult`,
      });

      log(`[expiry-notifier] Notified user ${grant.userId} (${grant.scope} expires ${expiryDate})`);
    } catch (err: any) {
      log(`[expiry-notifier] ERROR notifying user ${grant.userId}: ${err.message}`);
    }
  }
}

export function startExpiryNotifier(): void {
  runExpiryNotifications().catch(() => {});
  const handle = setInterval(() => {
    runExpiryNotifications().catch(() => {});
  }, INTERVAL_MS);
  if (handle.unref) handle.unref();
  log("[expiry-notifier] Daily expiry-notification job scheduled (every 24 h).");
}
