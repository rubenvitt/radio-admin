import { describe, it, expect, vi, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../src/db/test-utils';
import { buildTestApp, authCookie } from '../helpers';
import * as deviceRepo from '../../src/repos/deviceRepo';
import { createDevice } from '../../src/repos/deviceRepo';
import type { Db } from '../../src/repos/deviceRepo';
import { devices } from '../../src/db/schema';

const aliceAdmin = { sub: 'u-alice', name: 'Alice Admin', role: 'admin' as const };

function seed(db: Db) {
  createDevice(db, { issi: '1001', softwareVersion: 'FW 12.2' }, 'seed');
  createDevice(db, { issi: '1002', softwareVersion: 'FW 12.2' }, 'seed');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/import/commit rollback', () => {
  it('rolls back the whole batch when a write throws mid-transaction (no partial commit)', async () => {
    const { db } = makeTestDb();
    seed(db);
    const app = buildTestApp(db);

    // Force the SECOND updateDevice call to throw, simulating a constraint
    // violation on a later row. The transaction wrapper must undo the first.
    const real = deviceRepo.updateDevice;
    let calls = 0;
    vi.spyOn(deviceRepo, 'updateDevice').mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) throw new Error('simulated constraint violation');
      return real(...args);
    });

    const res = await app.request('/api/import/commit', {
      method: 'POST',
      headers: { Cookie: await authCookie(aliceAdmin), 'content-type': 'application/json' },
      body: JSON.stringify({
        dryRun: false,
        mapping: { issi: 0, softwareVersion: 1 },
        rows: [
          ['1001', 'FW 99.0'], // updated first -> would succeed
          ['1002', 'FW 99.0'], // updated second -> throws
        ],
      }),
    });

    // The handler propagates the throw -> non-2xx; no row was persisted.
    expect(res.status).toBeGreaterThanOrEqual(500);

    const dev1 = db.select().from(devices).where(eq(devices.issi, '1001')).get();
    const dev2 = db.select().from(devices).where(eq(devices.issi, '1002')).get();
    // First row's update must have been rolled back, not committed.
    expect(dev1?.softwareVersion).toBe('FW 12.2');
    expect(dev2?.softwareVersion).toBe('FW 12.2');
  });
});
