import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';

describe('GET /api/suggestions', () => {
  it('returns distinct, non-null, sorted values for a valid field', async () => {
    const { db } = makeTestDb();
    createDevice(db, { issi: '1', location: 'Wache' }, null);
    createDevice(db, { issi: '2', location: 'Werkstatt' }, null);
    createDevice(db, { issi: '3', location: 'Wache' }, null);
    createDevice(db, { issi: '4' }, null); // null location
    const app = buildTestApp(db);
    const res = await app.request('/api/suggestions?field=location', {
      headers: { Cookie: await authCookie(adminUser) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { values: string[] };
    expect(body.values).toEqual(['Wache', 'Werkstatt']);
  });

  it('rejects an unknown field with 400', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request('/api/suggestions?field=secret', {
      headers: { Cookie: await authCookie(adminUser) },
    });
    expect(res.status).toBe(400);
  });
});
