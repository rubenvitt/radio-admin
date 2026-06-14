import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser, updaterUser } from './helpers';
import { createDevice, getDeviceById } from '../src/repos/deviceRepo';
import { deviceEvents } from '../src/db/schema';

async function post(app: ReturnType<typeof buildTestApp>, id: string, user: Parameters<typeof authCookie>[0], body: unknown) {
  return app.request(`/api/devices/${id}/update-note`, {
    method: 'POST',
    headers: { Cookie: await authCookie(user), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/devices/:id/update-note', () => {
  it('updater appends a note without touching existing notes', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '800', notes: 'STAMM-NOTIZ' }, null);
    const app = buildTestApp(db);

    const res = await post(app, d.id, updaterUser, { text: 'ISSI weicht ab: 999' });
    expect(res.status).toBe(200);

    const after = getDeviceById(db, d.id)!;
    expect(after.notes).toBe('STAMM-NOTIZ'); // untouched
    expect(after.updateNote).toContain('ISSI weicht ab: 999');
    expect(after.updateNote).toContain(`· ${updaterUser.name}]`);

    const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, d.id)).all();
    expect(events).toHaveLength(1);
    expect(events[0]?.field).toBe('updateNote');
    expect(events[0]?.source).toBe('update-note');
  });

  it('appends a second line, preserving the first', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '801' }, null);
    const app = buildTestApp(db);
    await post(app, d.id, updaterUser, { text: 'erste' });
    await post(app, d.id, adminUser, { text: 'zweite' });
    const note = getDeviceById(db, d.id)!.updateNote!;
    expect(note.split('\n')).toHaveLength(2);
    expect(note).toContain('erste');
    expect(note).toContain('zweite');
  });

  it('400 on empty text, 404 on unknown id', async () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '802' }, null);
    const app = buildTestApp(db);
    expect((await post(app, d.id, updaterUser, { text: '   ' })).status).toBe(400);
    expect((await post(app, 'nope', updaterUser, { text: 'x' })).status).toBe(404);
  });
});
