import { describe, it, expect } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser } from './helpers';
import { deviceEvents, softwareVersions } from '../src/db/schema';

async function postDevice(app: ReturnType<typeof buildTestApp>, body: object) {
  return app.request('/api/devices', {
    method: 'POST',
    headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('duplicate-ISSI conflict handling', () => {
  it('POSTing two devices with the same issi returns a structured 409 on the second', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);

    const first = await postDevice(app, { issi: '5000', rufname: 'A' });
    expect(first.status).toBe(201);

    const second = await postDevice(app, { issi: '5000', rufname: 'B' });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'issi_conflict' });
  });

  it('PATCH changing an issi to an existing one returns 409', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);

    await postDevice(app, { issi: '6000' });
    const created = await postDevice(app, { issi: '6001' });
    const { id } = (await created.json()) as { id: string };

    const res = await app.request(`/api/devices/${id}`, {
      method: 'PATCH',
      headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
      body: JSON.stringify({ issi: '6000' }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'issi_conflict' });
  });

  it('a conflicting create rolls back the whole write (no orphaned events / sw-version)', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    await postDevice(app, { issi: '7000' });

    const before = db.select({ c: count() }).from(deviceEvents).get()?.c ?? 0;

    const res = await postDevice(app, { issi: '7000', softwareVersion: 'FW-NEW-9.9' });
    expect(res.status).toBe(409);

    // No new events and no orphaned software-version registered by the failed insert.
    const after = db.select({ c: count() }).from(deviceEvents).get()?.c ?? 0;
    expect(after).toBe(before);
    const versions = db
      .select()
      .from(softwareVersions)
      .where(eq(softwareVersions.value, 'FW-NEW-9.9'))
      .all();
    expect(versions).toHaveLength(0);
  });
});
