import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { createDb } from './index';
import { devices, deviceEvents } from './schema';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('db smoke test (temp file)', () => {
  it('migrates a fresh on-disk db, inserts a device + event, and reads them back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ra-smoke-'));
    const dbPath = join(dir, 'data.sqlite');
    const { db, sqlite } = createDb(dbPath);
    cleanup = () => {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const now = Date.now();

    // insert device, capture generated cuid2 id
    const inserted = db
      .insert(devices)
      .values({ issi: '99001', rufname: 'Florian 1', createdAt: now, updatedAt: now })
      .returning()
      .all();
    expect(inserted).toHaveLength(1);
    const deviceId = inserted[0]!.id;
    expect(deviceId).toMatch(/^[a-z0-9]{24}$/);

    // insert a related event (exercises the FK to devices.id)
    db.insert(deviceEvents)
      .values({
        deviceId,
        field: 'rufname',
        oldValue: null,
        newValue: 'Florian 1',
        changedBy: 'smoke',
        changedAt: now,
        source: 'create',
      })
      .run();

    // read device back
    const devs = db.select().from(devices).where(eq(devices.issi, '99001')).all();
    expect(devs).toHaveLength(1);
    expect(devs[0]?.rufname).toBe('Florian 1');

    // read event back, linked by FK
    const evs = db.select().from(deviceEvents).where(eq(deviceEvents.deviceId, deviceId)).all();
    expect(evs).toHaveLength(1);
    expect(evs[0]?.field).toBe('rufname');
    expect(evs[0]?.source).toBe('create');
  });
});
