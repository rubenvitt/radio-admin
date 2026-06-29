/*
 * One-time loan data migration (Phase 3 of the loan-ownership move).
 *
 * Copies the still-relevant loans (active + returned within the retention window)
 * from radio-inventar's Postgres `Loan` table into radio-admin's SQLite `loans`
 * table. Idempotent: re-running skips rows whose id already exists
 * (ON CONFLICT(id) DO NOTHING), so it is safe to run twice.
 *
 * Run it during the cutover window with radio-admin NOT serving loan writes, so
 * it cannot race the partial unique index `loans_device_active_uidx`. The source
 * Postgres already enforces "one active loan per device", so any conflict here
 * signals a real data problem to fix — not something to ignore.
 *
 * Usage (run from the `server/` package dir so better-sqlite3 + pg resolve):
 *   cd server
 *   INVENTAR_DATABASE_URL=postgresql://user:pass@host:5432/radio_inventar \
 *   DATABASE_PATH=/data/data.sqlite \
 *   npx tsx scripts/import-loans.ts [--dry-run]
 *
 * The target SQLite must already have the loans table — apply migrations first
 * (`node dist/migrate.js`, or boot the server once). `pg` is a server
 * devDependency added for this script.
 */
import Database from 'better-sqlite3';
import { Client, types } from 'pg';

const RETENTION_MONTHS = 2;

// Prisma stores the Loan timestamps as TIMESTAMP(3) WITHOUT TIME ZONE in UTC
// wall-clock, but node-postgres parses OID 1114 in the operator's LOCAL time by
// default — which would shift every migrated timestamp by the local offset.
// Force UTC interpretation so the imported epoch-ms values are correct.
types.setTypeParser(1114, (v: string) => new Date(`${v.replace(' ', 'T')}Z`));

interface PgLoan {
  id: string;
  deviceId: string;
  snapshotCallSign: string;
  snapshotSerialNumber: string | null;
  snapshotDeviceType: string | null;
  borrowerName: string;
  borrowedAt: Date;
  returnedAt: Date | null;
  returnNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toMs(d: Date | null): number | null {
  return d === null ? null : new Date(d).getTime();
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const pgUrl = process.env.INVENTAR_DATABASE_URL;
  const sqlitePath = process.env.DATABASE_PATH ?? './data/data.sqlite';
  if (!pgUrl) throw new Error('INVENTAR_DATABASE_URL is required');

  const pg = new Client({ connectionString: pgUrl });
  await pg.connect();
  const { rows } = await pg.query<PgLoan>(
    `SELECT id, "deviceId", "snapshotCallSign", "snapshotSerialNumber",
            "snapshotDeviceType", "borrowerName", "borrowedAt", "returnedAt",
            "returnNote", "createdAt", "updatedAt"
       FROM "Loan"
      WHERE "returnedAt" IS NULL
         OR "returnedAt" >= NOW() - INTERVAL '${RETENTION_MONTHS} months'
      ORDER BY "borrowedAt" ASC`,
  );
  await pg.end();

  console.log(
    `[import-loans] read ${rows.length} loan(s) from Postgres (active + returned <= ${RETENTION_MONTHS} months)`,
  );
  if (dryRun) {
    console.log('[import-loans] DRY RUN — nothing written.');
    return;
  }

  const db = new Database(sqlitePath);
  db.pragma('foreign_keys = ON');

  // Preflight: a populated target usually means the import already ran (or
  // radio-admin has been serving writes). ON CONFLICT(id) keeps existing rows,
  // but surface it so the operator can confirm this is intended.
  const preexisting = db.prepare('SELECT COUNT(*) AS c FROM loans').get() as { c: number };
  if (preexisting.c > 0) {
    console.warn(
      `[import-loans] WARNING: target loans table already has ${preexisting.c} row(s); existing ids are kept (ON CONFLICT DO NOTHING).`,
    );
  }

  const insert = db.prepare(
    `INSERT INTO loans (id, device_id, snapshot_call_sign, snapshot_serial_number,
        snapshot_device_type, borrower_name, borrowed_at, returned_at, return_note,
        created_at, updated_at)
     VALUES (@id, @deviceId, @snapshotCallSign, @snapshotSerialNumber,
        @snapshotDeviceType, @borrowerName, @borrowedAt, @returnedAt, @returnNote,
        @createdAt, @updatedAt)
     ON CONFLICT(id) DO NOTHING`,
  );

  let inserted = 0;
  let skipped = 0;
  const now = Date.now();
  const run = db.transaction((items: PgLoan[]) => {
    for (const r of items) {
      const res = insert.run({
        id: r.id,
        deviceId: r.deviceId,
        snapshotCallSign: r.snapshotCallSign,
        snapshotSerialNumber: r.snapshotSerialNumber,
        snapshotDeviceType: r.snapshotDeviceType,
        borrowerName: r.borrowerName,
        borrowedAt: toMs(r.borrowedAt) ?? now,
        returnedAt: toMs(r.returnedAt),
        returnNote: r.returnNote,
        createdAt: toMs(r.createdAt) ?? now,
        updatedAt: toMs(r.updatedAt) ?? now,
      });
      if (res.changes > 0) inserted += 1;
      else skipped += 1;
    }
  });
  run(rows);

  const active = db.prepare('SELECT COUNT(*) AS c FROM loans WHERE returned_at IS NULL').get() as {
    c: number;
  };
  db.close();

  console.log(`[import-loans] inserted=${inserted} skipped(existing)=${skipped}`);
  console.log(`[import-loans] active loans now in radio-admin: ${active.c}`);
}

main().catch((err: unknown) => {
  console.error('[import-loans] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
