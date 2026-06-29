import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser, updaterUser } from './helpers';
import { loans } from '../src/db/schema';
import { createLoan, returnLoan } from '../src/repos/loanRepo';
import type { LoanHistoryResponse, LoanRecord } from '@ra/shared';

function seed(db: ReturnType<typeof makeTestDb>['db'], deviceId: string) {
  return createLoan(db, {
    deviceId,
    snapshotCallSign: 'CS',
    snapshotSerialNumber: null,
    snapshotDeviceType: null,
    borrowerName: 'Max',
  });
}

describe('GET /api/loans (session overview)', () => {
  it('401 without a session', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    expect((await app.request('/api/loans')).status).toBe(401);
  });

  it('200 paginated for an admin and an updater (read open to all roles)', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    seed(db, 'dev-a');
    seed(db, 'dev-b');

    for (const user of [adminUser, updaterUser]) {
      const res = await app.request('/api/loans?page=1&pageSize=10', {
        headers: { Cookie: await authCookie(user) },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as LoanHistoryResponse;
      expect(body.total).toBe(2);
      expect(body.rows).toHaveLength(2);
    }
  });
});

describe('GET /api/loans/active', () => {
  it('returns only active loans', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    seed(db, 'dev-a');
    const returned = seed(db, 'dev-b');
    returnLoan(db, returned.id, null);

    const res = await app.request('/api/loans/active', { headers: { Cookie: await authCookie(adminUser) } });
    expect(res.status).toBe(200);
    const active = (await res.json()) as LoanRecord[];
    expect(active).toHaveLength(1);
    expect(active[0]?.deviceId).toBe('dev-a');
  });
});

describe('POST /api/loans/purge', () => {
  it('403 for an updater, 200 + count for an admin', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const stale = seed(db, 'dev-a');
    returnLoan(db, stale.id, null);
    db.update(loans).set({ returnedAt: 1_000 }).where(eq(loans.id, stale.id)).run();

    const forbidden = await app.request('/api/loans/purge', {
      method: 'POST',
      headers: { Cookie: await authCookie(updaterUser) },
    });
    expect(forbidden.status).toBe(403);

    const ok = await app.request('/api/loans/purge', {
      method: 'POST',
      headers: { Cookie: await authCookie(adminUser) },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ deleted: 1 });
  });
});
