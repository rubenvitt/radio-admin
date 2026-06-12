import { describe, it, expect, afterEach } from 'vitest';
import { createDb } from './index';
import { devices } from './schema';
import { eq } from 'drizzle-orm';

let close: (() => void) | undefined;

afterEach(() => {
  close?.();
  close = undefined;
});

describe('createDb', () => {
  it('runs migrations and round-trips a device on an in-memory database', () => {
    const { db, sqlite } = createDb(':memory:');
    close = () => sqlite.close();

    // tables created by the applied migration
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain('devices');
    expect(tables).toContain('software_versions');
    expect(tables).toContain('device_events');

    const now = Date.now();
    db.insert(devices).values({ issi: '12345', createdAt: now, updatedAt: now }).run();

    const rows = db.select().from(devices).where(eq(devices.issi, '12345')).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.issi).toBe('12345');
    expect(rows[0]?.id).toMatch(/^[a-z0-9]{24}$/); // cuid2 default applied
  });

  it('enforces foreign keys (PRAGMA foreign_keys = ON)', () => {
    const { sqlite } = createDb(':memory:');
    close = () => sqlite.close();
    const fk = sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(fk.foreign_keys).toBe(1);
  });
});
