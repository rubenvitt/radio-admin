import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser } from './helpers';
import { createDevice, writeEvents } from '../src/repos/deviceRepo';
import { upsertUser } from '../src/repos/userRepo';

interface EventRow {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  source: string;
  changedBy: string | null;
  changedByName: string | null;
}

describe('GET /api/devices/:id/events', () => {
  it('returns the change history newest-first after a PATCH', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '600', status: 'einsatzbereit' }, null);
    const app = buildTestApp(db);
    const cookie = await authCookie(adminUser);

    await app.request(`/api/devices/${d.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in Reparatur' }),
    });

    const res = await app.request(`/api/devices/${d.id}/events`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const events = (await res.json()) as EventRow[];
    expect(Array.isArray(events)).toBe(true);
    const statusEvent = events.find((e) => e.field === 'status');
    expect(statusEvent).toMatchObject({
      field: 'status',
      oldValue: 'einsatzbereit',
      newValue: 'in Reparatur',
      source: 'manual',
    });
  });

  it('adds changedByName, resolving known subs and falling back to the raw sub', async () => {
    const { db } = makeTestDb();
    upsertUser(db, adminUser.sub, adminUser.name);
    const d = createDevice(db, { issi: '601' }, adminUser.sub);
    // One event by a known user, one by an unknown sub.
    writeEvents(db, d.id, [{ field: 'status', oldValue: null, newValue: 'a' }], adminUser.sub, 'manual');
    writeEvents(db, d.id, [{ field: 'location', oldValue: null, newValue: 'b' }], 'ghost-sub', 'manual');

    const app = buildTestApp(db);
    const cookie = await authCookie(adminUser);
    const res = await app.request(`/api/devices/${d.id}/events`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const events = (await res.json()) as EventRow[];

    const known = events.find((e) => e.field === 'status');
    expect(known?.changedBy).toBe(adminUser.sub);
    expect(known?.changedByName).toBe(adminUser.name);

    const unknown = events.find((e) => e.field === 'location');
    expect(unknown?.changedBy).toBe('ghost-sub');
    expect(unknown?.changedByName).toBe('ghost-sub');
  });
});
