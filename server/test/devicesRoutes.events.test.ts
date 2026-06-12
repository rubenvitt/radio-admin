import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';

interface EventRow {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  source: string;
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
});
