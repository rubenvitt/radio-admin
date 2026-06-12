import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../src/migrate.js';

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('runMigrations', () => {
  it('creates the schema in an empty database file', () => {
    dir = mkdtempSync(join(tmpdir(), 'ra-mig-'));
    const dbPath = join(dir, 'data.sqlite');

    runMigrations(dbPath);

    const db = new Database(dbPath, { readonly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    db.close();

    expect(tables).toContain('devices');
    expect(tables).toContain('software_versions');
    expect(tables).toContain('device_events');
  });

  it('is idempotent (running twice does not throw)', () => {
    dir = mkdtempSync(join(tmpdir(), 'ra-mig-'));
    const dbPath = join(dir, 'data.sqlite');
    runMigrations(dbPath);
    expect(() => runMigrations(dbPath)).not.toThrow();
  });
});
