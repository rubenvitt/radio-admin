import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../db/test-utils';
import { loans } from '../db/schema';
import { createLoan, returnLoan, getLoanById } from '../repos/loanRepo';
import { getRetentionCutoffMs, runPurge, startRetentionSchedule } from './retentionService';

describe('getRetentionCutoffMs', () => {
  it('subtracts two months from the reference time', () => {
    expect(getRetentionCutoffMs(Date.UTC(2026, 2, 15))).toBe(Date.UTC(2026, 0, 15)); // Mar → Jan
  });

  it('handles the year boundary', () => {
    expect(getRetentionCutoffMs(Date.UTC(2026, 1, 15))).toBe(Date.UTC(2025, 11, 15)); // Feb → Dec prev year
  });
});

describe('runPurge', () => {
  it('deletes returned loans older than the cutoff and keeps recent ones', () => {
    const { db } = makeTestDb();
    const old = createLoan(db, base('dev-a'));
    const recent = createLoan(db, base('dev-b'));
    returnLoan(db, old.id, null);
    returnLoan(db, recent.id, null);
    // Reference = 2026-03-15 → cutoff 2026-01-15.
    db.update(loans).set({ returnedAt: Date.UTC(2025, 11, 1) }).where(eq(loans.id, old.id)).run();
    db.update(loans).set({ returnedAt: Date.UTC(2026, 2, 1) }).where(eq(loans.id, recent.id)).run();

    const deleted = runPurge(db, Date.UTC(2026, 2, 15));
    expect(deleted).toBe(1);
    expect(getLoanById(db, old.id)).toBeUndefined();
    expect(getLoanById(db, recent.id)).toBeDefined();
  });
});

describe('startRetentionSchedule', () => {
  it('purges immediately and returns a working cleanup', () => {
    const { db } = makeTestDb();
    const stale = createLoan(db, base('dev-a'));
    returnLoan(db, stale.id, null);
    // Returned in 1970 → older than any realistic cutoff.
    db.update(loans).set({ returnedAt: 1_000 }).where(eq(loans.id, stale.id)).run();

    const stop = startRetentionSchedule(db);
    try {
      expect(getLoanById(db, stale.id)).toBeUndefined(); // immediate purge ran
    } finally {
      stop();
    }
    expect(typeof stop).toBe('function');
  });
});

function base(deviceId: string) {
  return {
    deviceId,
    snapshotCallSign: 'CS',
    snapshotSerialNumber: null,
    snapshotDeviceType: null,
    borrowerName: 'Max',
  };
}
