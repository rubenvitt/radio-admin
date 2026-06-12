import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';
import { insertSoftwareVersionIfNew } from '../src/repos/softwareVersionRepo';

describe('GET /api/devices(/:id)', () => {
  it('lists devices with updateStatus and reads one by id', async () => {
    const { db } = makeTestDb();
    insertSoftwareVersionIfNew(db, 'FW 2.0', null, 2000);
    const d = createDevice(db, { issi: '500', rufname: 'Delta', softwareVersion: 'FW 2.0' }, null);
    const app = buildTestApp(db);
    const cookie = await authCookie(adminUser);

    const listRes = await app.request('/api/devices', { headers: { Cookie: cookie } });
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as { total: number; rows: { updateStatus: string }[] };
    expect(body.total).toBe(1);
    expect(body.rows[0]?.updateStatus).toBe('aktuell');

    const oneRes = await app.request(`/api/devices/${d.id}`, { headers: { Cookie: cookie } });
    expect(oneRes.status).toBe(200);
    const one = (await oneRes.json()) as { issi: string; updateStatus: string };
    expect(one.issi).toBe('500');
    expect(one.updateStatus).toBe('aktuell');

    const missing = await app.request('/api/devices/nope', { headers: { Cookie: cookie } });
    expect(missing.status).toBe(404);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request('/api/devices');
    expect(res.status).toBe(401);
  });
});
