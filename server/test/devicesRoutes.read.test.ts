import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';
import {
  insertSoftwareVersionIfNew,
  listSoftwareVersions,
  setTargetVersion,
} from '../src/repos/softwareVersionRepo';
import { upsertUser } from '../src/repos/userRepo';

describe('GET /api/devices(/:id)', () => {
  it('lists devices with updateStatus and reads one by id', async () => {
    const { db } = makeTestDb();
    insertSoftwareVersionIfNew(db, 'FW 2.0', null, 2000);
    const target = listSoftwareVersions(db).find((v) => v.value === 'FW 2.0');
    if (target) setTargetVersion(db, target.id); // FW 2.0 is the target → 'aktuell'
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

  it('resolves createdBy/updatedBy subs to display names', async () => {
    const { db } = makeTestDb();
    upsertUser(db, adminUser.sub, adminUser.name);
    const d = createDevice(db, { issi: '700', rufname: 'Echo' }, adminUser.sub);
    const app = buildTestApp(db);
    const cookie = await authCookie(adminUser);

    const res = await app.request(`/api/devices/${d.id}`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const one = (await res.json()) as {
      createdBy: string;
      updatedBy: string;
      createdByName: string;
      updatedByName: string;
    };
    // Raw subs are preserved (additive resolution).
    expect(one.createdBy).toBe(adminUser.sub);
    expect(one.updatedBy).toBe(adminUser.sub);
    expect(one.createdByName).toBe(adminUser.name);
    expect(one.updatedByName).toBe(adminUser.name);
  });

  it('falls back to the raw sub when no users row exists', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '701', rufname: 'Foxtrot' }, 'ghost-sub');
    const app = buildTestApp(db);
    const cookie = await authCookie(adminUser);

    const res = await app.request(`/api/devices/${d.id}`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const one = (await res.json()) as { createdByName: string; updatedByName: string };
    expect(one.createdByName).toBe('ghost-sub');
    expect(one.updatedByName).toBe('ghost-sub');
  });
});
