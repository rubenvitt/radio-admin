import { and, count, desc, eq, gte, isNotNull, isNull, lt, lte, type SQL } from 'drizzle-orm';
import { loans } from '../db/schema';
import { newId } from '../db/id';
import type { Db } from './deviceRepo';
import type { LoanRecord, LoanHistoryParams } from '@ra/shared';

/**
 * Pure loan persistence functions `(db, …) => result`, mirroring deviceRepo.
 * Business rules (device existence, loanable/condition gating) live in the route
 * handler; this layer only owns the rows + the atomicity guarantee.
 */

/** Thrown when a second ACTIVE loan for the same device hits the partial unique index. */
export class LoanConflictError extends Error {
  constructor() {
    super('device_already_on_loan');
    this.name = 'LoanConflictError';
  }
}

export interface CreateLoanInput {
  deviceId: string;
  snapshotCallSign: string;
  snapshotSerialNumber: string | null;
  snapshotDeviceType: string | null;
  borrowerName: string;
}

export interface ReturnLoanResult {
  /** The returned loan, or null when nothing was updated. */
  updated: LoanRecord | null;
  /** True when the loan exists but was already returned (→ 409 vs 404). */
  alreadyReturned: boolean;
}

export interface ListLoansResult {
  rows: LoanRecord[];
  total: number;
  page: number;
  pageSize: number;
}

type LoanRow = typeof loans.$inferSelect;

/** Project a DB row to the public LoanRecord shape (drops internal audit columns). */
function toLoanRecord(row: LoanRow): LoanRecord {
  return {
    id: row.id,
    deviceId: row.deviceId,
    snapshotCallSign: row.snapshotCallSign,
    snapshotSerialNumber: row.snapshotSerialNumber,
    snapshotDeviceType: row.snapshotDeviceType,
    borrowerName: row.borrowerName,
    borrowedAt: row.borrowedAt,
    returnedAt: row.returnedAt,
    returnNote: row.returnNote,
  };
}

/**
 * better-sqlite3 surfaces a UNIQUE-constraint violation with this code. On the
 * loans table the only UNIQUE index is the partial `loans_device_active_uidx`
 * (the PK violation reports a different code), so this unambiguously means
 * "device already has an active loan".
 */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * Create an active loan. Throws {@link LoanConflictError} when the device already
 * has an open loan (partial-unique-index violation) — no SELECT-then-insert race.
 */
export function createLoan(db: Db, input: CreateLoanInput): LoanRecord {
  const now = Date.now();
  const row: LoanRow = {
    id: newId(),
    deviceId: input.deviceId,
    snapshotCallSign: input.snapshotCallSign,
    snapshotSerialNumber: input.snapshotSerialNumber,
    snapshotDeviceType: input.snapshotDeviceType,
    borrowerName: input.borrowerName,
    borrowedAt: now,
    returnedAt: null,
    returnNote: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    db.insert(loans).values(row).run();
  } catch (err: unknown) {
    if (isUniqueViolation(err)) throw new LoanConflictError();
    throw err;
  }
  return toLoanRecord(row);
}

/**
 * Atomically close an open loan: only the still-active row (returned_at IS NULL)
 * is updated. A zero-row update means the loan is missing or already returned —
 * the caller maps that to 404 vs 409 via `alreadyReturned`.
 */
export function returnLoan(db: Db, loanId: string, returnNote: string | null): ReturnLoanResult {
  const now = Date.now();
  const res = db
    .update(loans)
    .set({ returnedAt: now, returnNote, updatedAt: now })
    .where(and(eq(loans.id, loanId), isNull(loans.returnedAt)))
    .run();

  if (res.changes === 0) {
    const existing = db.select({ id: loans.id }).from(loans).where(eq(loans.id, loanId)).get();
    return { updated: null, alreadyReturned: existing !== undefined };
  }

  const row = db.select().from(loans).where(eq(loans.id, loanId)).get();
  return { updated: row ? toLoanRecord(row) : null, alreadyReturned: false };
}

export function getLoanById(db: Db, id: string): LoanRecord | undefined {
  const row = db.select().from(loans).where(eq(loans.id, id)).get();
  return row ? toLoanRecord(row) : undefined;
}

/** All active loans (returned_at IS NULL), newest-borrowed first. */
export function findActiveLoans(db: Db): LoanRecord[] {
  return db
    .select()
    .from(loans)
    .where(isNull(loans.returnedAt))
    .orderBy(desc(loans.borrowedAt))
    .all()
    .map(toLoanRecord);
}

/** Paginated loan list (active + returned), newest-borrowed first, with optional filters. */
export function listLoans(db: Db, params: LoanHistoryParams): ListLoansResult {
  const conds: SQL[] = [];
  if (params.deviceId) conds.push(eq(loans.deviceId, params.deviceId));
  if (params.from !== undefined) conds.push(gte(loans.borrowedAt, params.from));
  if (params.to !== undefined) conds.push(lte(loans.borrowedAt, params.to));
  const where = conds.length ? and(...conds) : undefined;

  const { page, pageSize } = params;

  const totalRow = db.select({ c: count() }).from(loans).where(where).get();
  const total = totalRow?.c ?? 0;

  const rows = db
    .select()
    .from(loans)
    .where(where)
    .orderBy(desc(loans.borrowedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()
    .map(toLoanRecord);

  return { rows, total, page, pageSize };
}

/**
 * Delete returned loans whose return is older than the cutoff (retention).
 * Active loans (returned_at IS NULL) are always kept. Returns the row count.
 */
export function purgeExpiredLoans(db: Db, cutoffMs: number): number {
  const res = db
    .delete(loans)
    .where(and(isNotNull(loans.returnedAt), lt(loans.returnedAt, cutoffMs)))
    .run();
  return res.changes;
}
