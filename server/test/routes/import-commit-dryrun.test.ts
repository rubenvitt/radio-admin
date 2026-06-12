import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../../src/db/test-utils';
import { buildTestApp, authCookie, adminUser, updaterUser } from '../helpers';
import { createDevice } from '../../src/repos/deviceRepo';
import type { Db } from '../../src/repos/deviceRepo';

interface DryRunBody {
  dryRun: boolean;
  summary: Record<string, number>;
  rows: { rowIndex: number; issi: string; class: string; changes: unknown[]; error?: string }[];
}

function seed(db: Db) {
  createDevice(db, { issi: '1001', softwareVersion: 'FW 12.2', status: 'einsatzbereit' }, 'seed');
  createDevice(db, { issi: '1002', softwareVersion: 'FW 12.3', status: 'einsatzbereit' }, 'seed');
}

// mapping is field -> column-index (the committed importCommitSchema shape).
const mapping = { issi: 0, softwareVersion: 1 };

describe('POST /api/import/commit (dryRun)', () => {
  it('admin dryRun classifies created/updated/unchanged/error and never writes', async () => {
    const { db } = makeTestDb();
    seed(db);
    const app = buildTestApp(db);
    const res = await app.request('/api/import/commit', {
      method: 'POST',
      headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
      body: JSON.stringify({
        dryRun: true,
        mapping,
        rows: [
          ['1001', 'FW 12.3'], // updated
          ['1002', 'FW 12.3'], // unchanged
          ['9999', 'FW 12.3'], // created (admin)
          ['', 'FW 12.3'], // error: empty issi
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as DryRunBody;
    expect(body.summary).toEqual({
      created: 1,
      updated: 1,
      unchanged: 1,
      error: 1,
      'skipped-no-permission': 0,
    });
    expect(body.rows).toHaveLength(4);
    expect(body.rows[0]?.class).toBe('updated');
    expect(body.rows[0]?.changes).toEqual([
      { field: 'softwareVersion', oldValue: 'FW 12.2', newValue: 'FW 12.3' },
    ]);
    expect(body.rows[3]?.class).toBe('error');
    expect(body.rows[3]?.error).toMatch(/issi/i);
  });

  it('flags duplicate ISSI within the file as error on the second occurrence', async () => {
    const { db } = makeTestDb();
    seed(db);
    const app = buildTestApp(db);
    const res = await app.request('/api/import/commit', {
      method: 'POST',
      headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
      body: JSON.stringify({
        dryRun: true,
        mapping,
        rows: [
          ['1001', 'FW 12.3'],
          ['1001', 'FW 12.4'], // duplicate in file
        ],
      }),
    });
    const body = (await res.json()) as DryRunBody;
    expect(body.rows[0]?.class).toBe('updated');
    expect(body.rows[1]?.class).toBe('error');
    expect(body.rows[1]?.error).toMatch(/duplikat|duplicate/i);
    expect(body.summary.error).toBe(1);
  });

  it('updater dryRun reports unknown ISSI as skipped-no-permission (no created)', async () => {
    const { db } = makeTestDb();
    seed(db);
    const app = buildTestApp(db);
    const res = await app.request('/api/import/commit', {
      method: 'POST',
      headers: { Cookie: await authCookie(updaterUser), 'content-type': 'application/json' },
      body: JSON.stringify({
        dryRun: true,
        mapping: { issi: 0, softwareVersion: 1, location: 2 },
        rows: [
          ['1001', 'FW 12.3', 'Werkstatt'], // updated, but location ignored for updater
          ['8888', 'FW 12.3', 'Werkstatt'], // skipped-no-permission
        ],
      }),
    });
    const body = (await res.json()) as DryRunBody;
    expect(body.summary.created).toBe(0);
    expect(body.summary['skipped-no-permission']).toBe(1);
    expect(body.rows[0]?.class).toBe('updated');
    expect(body.rows[0]?.changes).toEqual([
      { field: 'softwareVersion', oldValue: 'FW 12.2', newValue: 'FW 12.3' },
    ]); // location NOT in changes (filtered for updater)
  });

  it('returns 400 when mapping omits issi (zod refinement)', async () => {
    const { db } = makeTestDb();
    seed(db);
    const app = buildTestApp(db);
    const res = await app.request('/api/import/commit', {
      method: 'POST',
      headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: true, mapping: { softwareVersion: 0 }, rows: [['x']] }),
    });
    expect(res.status).toBe(400);
  });
});
