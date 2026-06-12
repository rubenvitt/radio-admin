import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser, updaterUser } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';
import { insertSoftwareVersionIfNew } from '../src/repos/softwareVersionRepo';
import { deviceEvents, softwareVersions } from '../src/db/schema';

describe('PATCH /api/devices/:id', () => {
  it('admin patches an update field + an identity field, writes one event per change', async () => {
    const { db } = makeTestDb();
    insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
    const d = createDevice(db, { issi: '700', rufname: 'Foxtrot', softwareVersion: 'FW 1.0' }, null);
    const app = buildTestApp(db);
    const res = await app.request(`/api/devices/${d.id}`, {
      method: 'PATCH',
      headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
      body: JSON.stringify({ rufname: 'Foxtrot-2', status: 'in Reparatur' }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { rufname: string; status: string };
    expect(updated.rufname).toBe('Foxtrot-2');
    expect(updated.status).toBe('in Reparatur');

    const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, d.id)).all();
    const changed = events.map((e) => e.field).sort();
    expect(changed).toEqual(['rufname', 'status']);
    expect(events.every((e) => e.source === 'manual')).toBe(true);
  });

  it('updater PATCH drops identity fields (rufname ignored, status applied)', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '701', rufname: 'Golf', status: 'einsatzbereit' }, null);
    const app = buildTestApp(db);
    const res = await app.request(`/api/devices/${d.id}`, {
      method: 'PATCH',
      headers: { Cookie: await authCookie(updaterUser), 'content-type': 'application/json' },
      body: JSON.stringify({ rufname: 'HACK', issi: '999', status: 'in Reparatur' }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as { rufname: string; issi: string; status: string };
    expect(updated.rufname).toBe('Golf'); // identity field untouched
    expect(updated.issi).toBe('701'); // ISSI (match-key) untouched
    expect(updated.status).toBe('in Reparatur'); // allowed update field applied

    const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, d.id)).all();
    expect(events.map((e) => e.field)).toEqual(['status']);
  });

  it('registers a brand-new softwareVersion value on save', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '702' }, null);
    const app = buildTestApp(db);
    const res = await app.request(`/api/devices/${d.id}`, {
      method: 'PATCH',
      headers: { Cookie: await authCookie(updaterUser), 'content-type': 'application/json' },
      body: JSON.stringify({ softwareVersion: 'FW 5.0' }),
    });
    expect(res.status).toBe(200);
    const versions = db
      .select()
      .from(softwareVersions)
      .where(eq(softwareVersions.value, 'FW 5.0'))
      .all();
    expect(versions.length).toBe(1);
  });

  it('404 on unknown id', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request('/api/devices/nope', {
      method: 'PATCH',
      headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});
