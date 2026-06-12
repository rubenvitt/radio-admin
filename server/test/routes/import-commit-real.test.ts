import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../../src/db/test-utils';
import { buildTestApp, authCookie } from '../helpers';
import { createDevice } from '../../src/repos/deviceRepo';
import type { Db } from '../../src/repos/deviceRepo';
import { devices, deviceEvents, softwareVersions } from '../../src/db/schema';

interface CommitBody {
  dryRun: boolean;
  summary: Record<string, number>;
  rows: { rowIndex: number; issi: string; class: string }[];
}

function seed(db: Db) {
  createDevice(db, { issi: '1001', softwareVersion: 'FW 12.2', status: 'einsatzbereit' }, 'seed');
}

const aliceAdmin = { sub: 'u-alice', name: 'Alice Admin', role: 'admin' as const };
const uweUpdater = { sub: 'u-uwe', name: 'Uwe Updater', role: 'updater' as const };

describe('POST /api/import/commit (real run)', () => {
  it('admin: updates matched device, creates new device, creates missing software_versions, writes csv-import events', async () => {
    const { db } = makeTestDb();
    seed(db);
    const app = buildTestApp(db);
    const res = await app.request('/api/import/commit', {
      method: 'POST',
      headers: { Cookie: await authCookie(aliceAdmin), 'content-type': 'application/json' },
      body: JSON.stringify({
        dryRun: false,
        mapping: { issi: 0, softwareVersion: 1, status: 2 },
        rows: [
          ['1001', 'FW 13.0', 'einsatzbereit'], // update swVersion only
          ['7777', 'FW 13.0', 'in Reparatur'], // create
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as CommitBody;
    expect(body.summary).toMatchObject({ created: 1, updated: 1 });

    const updated = db.select().from(devices).where(eq(devices.issi, '1001')).get();
    expect(updated?.softwareVersion).toBe('FW 13.0');
    expect(updated?.updatedBy).toBe('Alice Admin');

    const created = db.select().from(devices).where(eq(devices.issi, '7777')).get();
    expect(created).toBeTruthy();
    expect(created?.status).toBe('in Reparatur');
    expect(created?.createdBy).toBe('Alice Admin');

    // new software_versions row created exactly once for 'FW 13.0'
    const versions = db.select().from(softwareVersions).where(eq(softwareVersions.value, 'FW 13.0')).all();
    expect(versions).toHaveLength(1);

    // events written with source csv-import
    const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, updated!.id)).all();
    expect(
      events.some((e) => e.field === 'softwareVersion' && e.source === 'csv-import' && e.newValue === 'FW 13.0'),
    ).toBe(true);
  });

  it('updater: updates allowed fields of matched device, ignores locked columns, does NOT create unknown ISSI', async () => {
    const { db } = makeTestDb();
    seed(db);
    const app = buildTestApp(db);
    const res = await app.request('/api/import/commit', {
      method: 'POST',
      headers: { Cookie: await authCookie(uweUpdater), 'content-type': 'application/json' },
      body: JSON.stringify({
        dryRun: false,
        mapping: { issi: 0, softwareVersion: 1, location: 2 },
        rows: [
          ['1001', 'FW 13.0', 'Werkstatt'], // swVersion updated, location ignored
          ['5555', 'FW 13.0', 'Werkstatt'], // skipped-no-permission, not created
        ],
      }),
    });
    const body = (await res.json()) as CommitBody;
    expect(body.summary).toMatchObject({ updated: 1, 'skipped-no-permission': 1, created: 0 });

    const dev = db.select().from(devices).where(eq(devices.issi, '1001')).get();
    expect(dev?.softwareVersion).toBe('FW 13.0');
    expect(dev?.location).not.toBe('Werkstatt'); // locked field untouched

    const notCreated = db.select().from(devices).where(eq(devices.issi, '5555')).get();
    expect(notCreated).toBeUndefined();
  });

  it('is transactional: an in-file duplicate is classed error and skipped, leaving a single insert', async () => {
    const { db } = makeTestDb();
    seed(db);
    const app = buildTestApp(db);
    const res = await app.request('/api/import/commit', {
      method: 'POST',
      headers: { Cookie: await authCookie(aliceAdmin), 'content-type': 'application/json' },
      body: JSON.stringify({
        dryRun: false,
        mapping: { issi: 0, softwareVersion: 1 },
        rows: [
          ['4444', 'FW 9.0'],
          ['4444', 'FW 9.1'], // duplicate-in-file -> error, not applied
        ],
      }),
    });
    const body = (await res.json()) as CommitBody;
    expect(body.summary.error).toBe(1);
    expect(body.summary.created).toBe(1);
    const rows = db.select().from(devices).where(eq(devices.issi, '4444')).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.softwareVersion).toBe('FW 9.0');
  });

  it('writes no events for unchanged rows', async () => {
    const { db } = makeTestDb();
    seed(db);
    const app = buildTestApp(db);
    await app.request('/api/import/commit', {
      method: 'POST',
      headers: { Cookie: await authCookie(aliceAdmin), 'content-type': 'application/json' },
      body: JSON.stringify({
        dryRun: false,
        mapping: { issi: 0, softwareVersion: 1, status: 2 },
        rows: [['1001', 'FW 12.2', 'einsatzbereit']], // identical -> unchanged
      }),
    });
    const dev = db.select().from(devices).where(eq(devices.issi, '1001')).get();
    const events = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, dev!.id)).all();
    expect(events.filter((e) => e.source === 'csv-import')).toHaveLength(0);
  });
});
