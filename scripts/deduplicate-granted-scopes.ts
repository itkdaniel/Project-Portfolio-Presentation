/**
 * scripts/deduplicate-granted-scopes.ts
 *
 * One-time migration: finds duplicate active (user_id, scope) rows in the
 * granted_scopes table and revokes all but the most-recently granted row for
 * each (user_id, scope) pair.
 *
 * The partial unique index (granted_scopes_user_scope_active_idx) prevents NEW
 * duplicates, but rows inserted before the index existed can still lurk.  This
 * script makes the database consistent so that revokeScope() always targets
 * exactly one row.
 *
 * Run with:
 *   npx tsx scripts/deduplicate-granted-scopes.ts
 *
 * Safe to re-run — rows that are already unique are left untouched.
 */

import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

export interface DeduplicationResult {
  duplicatePairs: number;
  totalRevoked:   number;
}

/**
 * Core deduplication logic — exported so tests can call it directly without
 * closing the shared connection pool.
 */
export async function deduplicateGrantedScopes(
  opts: { verbose?: boolean } = {},
): Promise<DeduplicationResult> {
  const log = opts.verbose !== false ? console.log : () => {};

  log("→ Scanning granted_scopes for duplicate active rows…");

  const duplicates = await db.execute<{ user_id: string; scope: string; cnt: string }>(sql`
    SELECT user_id, scope, COUNT(*) AS cnt
    FROM   granted_scopes
    WHERE  revoked_at IS NULL
    GROUP  BY user_id, scope
    HAVING COUNT(*) > 1
  `);

  const rows = duplicates.rows;

  if (rows.length === 0) {
    log("✓ No duplicate active grants found — database is already clean.");
    return { duplicatePairs: 0, totalRevoked: 0 };
  }

  log(`  Found ${rows.length} (user_id, scope) pair(s) with duplicates.`);
  let totalRevoked = 0;

  for (const { user_id, scope } of rows) {
    const newestResult = await db.execute<{ id: string }>(sql`
      SELECT id
      FROM   granted_scopes
      WHERE  user_id    = ${user_id}
        AND  scope      = ${scope}
        AND  revoked_at IS NULL
      ORDER  BY granted_at DESC
      LIMIT  1
    `);

    const newest = newestResult.rows[0];
    if (!newest) continue;

    const keepId = newest.id;

    const revoked = await db.execute<{ id: string }>(sql`
      UPDATE granted_scopes
      SET    revoked_at = NOW()
      WHERE  user_id    = ${user_id}
        AND  scope      = ${scope}
        AND  revoked_at IS NULL
        AND  id        <> ${keepId}
      RETURNING id
    `);

    const count = revoked.rows.length;
    totalRevoked += count;
    log(`  user=${user_id}  scope=${scope}  kept=${keepId}  revoked=${count} duplicate(s)`);
  }

  log(`\n✓ Migration complete. ${totalRevoked} duplicate row(s) revoked.`);
  return { duplicatePairs: rows.length, totalRevoked };
}

// ── Run as script ─────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith("deduplicate-granted-scopes.ts")) {
  deduplicateGrantedScopes({ verbose: true })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    })
    .finally(() => pool.end());
}
