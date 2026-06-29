import { purgeExpiredLoans } from '../repos/loanRepo';
import type { Db } from '../repos/deviceRepo';

/**
 * Returned loans older than this are purged. `borrowerName` is personal data
 * (DSGVO), so the deletion is an explicit scheduled policy — not a side effect
 * of someone happening to read the history.
 */
export const HISTORY_RETENTION_MONTHS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The retention cutoff: returned loans with `returned_at` before this timestamp
 * are expired. Pure and testable (the reference time is injectable).
 */
export function getRetentionCutoffMs(referenceMs: number = Date.now()): number {
  const d = new Date(referenceMs);
  d.setUTCMonth(d.getUTCMonth() - HISTORY_RETENTION_MONTHS);
  return d.getTime();
}

/** Purge expired returned loans once; returns the number of rows deleted. */
export function runPurge(db: Db, referenceMs?: number): number {
  return purgeExpiredLoans(db, getRetentionCutoffMs(referenceMs));
}

/**
 * Start the retention schedule: an immediate purge (clears any backlog, e.g.
 * straight after a data migration) plus a daily timer. The interval is
 * `.unref()`-ed so it never keeps the process alive, and a cleanup function is
 * returned to stop it.
 *
 * This is a process-lifetime side effect — call it from startServer(), never
 * from buildApp(), so unit tests that build the app stay side-effect-free.
 */
export function startRetentionSchedule(db: Db): () => void {
  const purge = (): void => {
    try {
      const deleted = runPurge(db);
      if (deleted > 0) console.log(`[retention] purged ${deleted} expired loan(s)`);
    } catch (err: unknown) {
      console.error('[retention] purge failed:', err instanceof Error ? err.message : err);
    }
  };

  purge();
  const handle = setInterval(purge, DAY_MS);
  handle.unref();
  return () => clearInterval(handle);
}
