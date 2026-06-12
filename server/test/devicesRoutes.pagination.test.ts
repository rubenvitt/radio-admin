import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';

interface ListBody {
  rows: unknown[];
  total: number;
  page: number;
  pageSize: number;
}

describe('GET /api/devices pagination guards', () => {
  it('non-numeric page/pageSize fall back to sane defaults (not NaN)', async () => {
    const { db } = makeTestDb();
    createDevice(db, { issi: '1' }, null);
    const app = buildTestApp(db);
    const res = await app.request('/api/devices?page=abc&pageSize=xyz', {
      headers: { Cookie: await authCookie(adminUser) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(25);
    expect(body.rows).toHaveLength(1); // NaN offset/limit would have returned nothing
  });

  it('caps pageSize and floors page at 1 for out-of-range values', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request('/api/devices?page=0&pageSize=99999', {
      headers: { Cookie: await authCookie(adminUser) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(200); // capped at the max
  });
});
