import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser, updaterUser } from './helpers';
import { deviceEvents, softwareVersions } from '../src/db/schema';

describe('POST /api/devices', () => {
  it('admin creates a device, writes create-events and registers the software version', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request('/api/devices', {
      method: 'POST',
      headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
      body: JSON.stringify({ issi: '900', rufname: 'Echo', softwareVersion: 'FW 3.0' }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; issi: string };
    expect(created.issi).toBe('900');

    const events = db
      .select()
      .from(deviceEvents)
      .where(eq(deviceEvents.deviceId, created.id))
      .all();
    const fields = events.map((e) => e.field).sort();
    expect(fields).toEqual(['issi', 'rufname', 'softwareVersion']);
    expect(events.every((e) => e.source === 'create')).toBe(true);

    const versions = db
      .select()
      .from(softwareVersions)
      .where(eq(softwareVersions.value, 'FW 3.0'))
      .all();
    expect(versions.length).toBe(1);
  });

  it('rejects updater with 403', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request('/api/devices', {
      method: 'POST',
      headers: { Cookie: await authCookie(updaterUser), 'content-type': 'application/json' },
      body: JSON.stringify({ issi: '901' }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects invalid body (missing issi) with 400', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request('/api/devices', {
      method: 'POST',
      headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
      body: JSON.stringify({ rufname: 'NoIssi' }),
    });
    expect(res.status).toBe(400);
  });
});
