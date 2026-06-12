import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { authCookie, updaterUser } from './helpers';

describe('test harness', () => {
  it('provides a migrated in-memory db', () => {
    const { db, sqlite } = makeTestDb();
    const rows = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name);
    expect(names).toContain('devices');
    expect(names).toContain('software_versions');
    expect(names).toContain('device_events');
    expect(db).toBeDefined();
  });

  it('mints a session cookie for a role', async () => {
    const cookie = await authCookie(updaterUser);
    expect(cookie).toMatch(/^ra_session=.+/);
  });
});
