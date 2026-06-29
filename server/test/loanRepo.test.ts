import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../src/db/test-utils';
import { loans } from '../src/db/schema';
import {
  createLoan,
  returnLoan,
  getLoanById,
  findActiveLoans,
  listLoans,
  purgeExpiredLoans,
  LoanConflictError,
  type CreateLoanInput,
} from '../src/repos/loanRepo';

const input = (over: Partial<CreateLoanInput> = {}): CreateLoanInput => ({
  deviceId: 'dev-a',
  snapshotCallSign: 'Florian 4-23',
  snapshotSerialNumber: 'SN-1',
  snapshotDeviceType: 'Funkgerät',
  borrowerName: 'Max',
  ...over,
});

/** Pin a loan's borrowedAt for deterministic ordering/filter assertions. */
function setBorrowedAt(db: ReturnType<typeof makeTestDb>['db'], id: string, ms: number) {
  db.update(loans).set({ borrowedAt: ms }).where(eq(loans.id, id)).run();
}

describe('loanRepo create + read', () => {
  it('creates an active loan and reads it back', () => {
    const { db } = makeTestDb();
    const loan = createLoan(db, input());
    expect(loan.id).toBeTruthy();
    expect(loan.deviceId).toBe('dev-a');
    expect(loan.snapshotCallSign).toBe('Florian 4-23');
    expect(loan.returnedAt).toBeNull();
    expect(loan.returnNote).toBeNull();
    expect(typeof loan.borrowedAt).toBe('number');

    expect(getLoanById(db, loan.id)).toEqual(loan);
    expect(getLoanById(db, 'missing')).toBeUndefined();
  });

  it('allows two different devices to be on loan at the same time', () => {
    const { db } = makeTestDb();
    createLoan(db, input({ deviceId: 'dev-a' }));
    createLoan(db, input({ deviceId: 'dev-b' }));
    expect(findActiveLoans(db)).toHaveLength(2);
  });
});

describe('loanRepo atomicity (partial unique index)', () => {
  it('rejects a second active loan for the same device', () => {
    const { db } = makeTestDb();
    createLoan(db, input({ deviceId: 'dev-a' }));
    expect(() => createLoan(db, input({ deviceId: 'dev-a', borrowerName: 'Erika' }))).toThrow(
      LoanConflictError,
    );
    expect(findActiveLoans(db)).toHaveLength(1);
  });

  it('allows re-borrowing a device after it was returned', () => {
    const { db } = makeTestDb();
    const first = createLoan(db, input({ deviceId: 'dev-a' }));
    returnLoan(db, first.id, null);
    // The partial predicate (WHERE returned_at IS NULL) must let this succeed.
    const second = createLoan(db, input({ deviceId: 'dev-a', borrowerName: 'Erika' }));
    expect(second.id).not.toBe(first.id);
    expect(findActiveLoans(db)).toHaveLength(1);
  });
});

describe('loanRepo return', () => {
  it('closes an open loan with a note', () => {
    const { db } = makeTestDb();
    const loan = createLoan(db, input());
    const res = returnLoan(db, loan.id, 'Display kaputt');
    expect(res.alreadyReturned).toBe(false);
    expect(res.updated?.returnedAt).toBeGreaterThan(0);
    expect(res.updated?.returnNote).toBe('Display kaputt');
  });

  it('reports alreadyReturned on a second return, and not-found otherwise', () => {
    const { db } = makeTestDb();
    const loan = createLoan(db, input());
    returnLoan(db, loan.id, null);

    const again = returnLoan(db, loan.id, null);
    expect(again).toEqual({ updated: null, alreadyReturned: true });

    const missing = returnLoan(db, 'nope', null);
    expect(missing).toEqual({ updated: null, alreadyReturned: false });
  });
});

describe('loanRepo findActiveLoans', () => {
  it('excludes returned loans and orders by borrowedAt desc', () => {
    const { db } = makeTestDb();
    const older = createLoan(db, input({ deviceId: 'dev-a' }));
    const newer = createLoan(db, input({ deviceId: 'dev-b' }));
    const returned = createLoan(db, input({ deviceId: 'dev-c' }));
    setBorrowedAt(db, older.id, 1_000);
    setBorrowedAt(db, newer.id, 2_000);
    returnLoan(db, returned.id, null);

    const active = findActiveLoans(db);
    expect(active.map((l) => l.deviceId)).toEqual(['dev-b', 'dev-a']);
  });
});

describe('loanRepo listLoans', () => {
  it('paginates, filters by device and by borrowedAt range', () => {
    const { db } = makeTestDb();
    // Two loans on dev-a (one returned, one active — both appear in the history)
    // plus one active loan on dev-b.
    const a = createLoan(db, input({ deviceId: 'dev-a' }));
    returnLoan(db, a.id, null);
    const b = createLoan(db, input({ deviceId: 'dev-b' }));
    const c = createLoan(db, input({ deviceId: 'dev-a' }));
    setBorrowedAt(db, a.id, 1_000);
    setBorrowedAt(db, b.id, 2_000);
    setBorrowedAt(db, c.id, 3_000);

    const page1 = listLoans(db, { page: 1, pageSize: 2 });
    expect(page1.total).toBe(3);
    expect(page1.rows.map((l) => l.borrowedAt)).toEqual([3_000, 2_000]);

    const page2 = listLoans(db, { page: 2, pageSize: 2 });
    expect(page2.rows.map((l) => l.borrowedAt)).toEqual([1_000]);

    const byDevice = listLoans(db, { page: 1, pageSize: 10, deviceId: 'dev-a' });
    expect(byDevice.total).toBe(2);
    expect(byDevice.rows.every((l) => l.deviceId === 'dev-a')).toBe(true);

    const byRange = listLoans(db, { page: 1, pageSize: 10, from: 1_500, to: 2_500 });
    expect(byRange.rows.map((l) => l.borrowedAt)).toEqual([2_000]);
  });
});

describe('loanRepo purgeExpiredLoans', () => {
  it('deletes returned loans older than the cutoff and keeps active + recent ones', () => {
    const { db } = makeTestDb();
    const old = createLoan(db, input({ deviceId: 'dev-a' }));
    const recent = createLoan(db, input({ deviceId: 'dev-b' }));
    const active = createLoan(db, input({ deviceId: 'dev-c' }));
    returnLoan(db, old.id, null);
    returnLoan(db, recent.id, null);
    db.update(loans).set({ returnedAt: 1_000 }).where(eq(loans.id, old.id)).run();
    db.update(loans).set({ returnedAt: 9_000 }).where(eq(loans.id, recent.id)).run();

    const deleted = purgeExpiredLoans(db, 5_000);
    expect(deleted).toBe(1);
    expect(getLoanById(db, old.id)).toBeUndefined();
    expect(getLoanById(db, recent.id)).toBeDefined();
    expect(getLoanById(db, active.id)).toBeDefined();
  });
});
