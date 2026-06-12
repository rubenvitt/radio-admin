import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser, updaterUser } from './helpers';
import { createDevice, getDeviceById } from '../src/repos/deviceRepo';

describe('DELETE /api/devices/:id', () => {
  it('admin deletes a device', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '800' }, null);
    const app = buildTestApp(db);
    const res = await app.request(`/api/devices/${d.id}`, {
      method: 'DELETE',
      headers: { Cookie: await authCookie(adminUser) },
    });
    expect(res.status).toBe(204);
    expect(getDeviceById(db, d.id)).toBeUndefined();
  });

  it('updater gets 403 and the device survives', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '801' }, null);
    const app = buildTestApp(db);
    const res = await app.request(`/api/devices/${d.id}`, {
      method: 'DELETE',
      headers: { Cookie: await authCookie(updaterUser) },
    });
    expect(res.status).toBe(403);
    expect(getDeviceById(db, d.id)).toBeDefined();
  });

  it('admin delete of unknown id returns 404', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request('/api/devices/nope', {
      method: 'DELETE',
      headers: { Cookie: await authCookie(adminUser) },
    });
    expect(res.status).toBe(404);
  });
});
