import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

// Resolve the migrations folder relative to THIS module, not process.cwd()
// (under vitest the cwd is not guaranteed to be the server package root).
const moduleDir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(moduleDir, '../../drizzle');

export interface DbHandle {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: Database.Database;
}

/** Open a SQLite database, enable FK enforcement, run migrations, return the drizzle db + raw handle. */
export function createDb(path: string): DbHandle {
  // better-sqlite3 does not create parent directories; ensure they exist for
  // on-disk paths (':memory:' has no parent dir).
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, sqlite };
}

let appHandle: DbHandle | undefined;

/**
 * Lazily-initialized application-wide database (from DATABASE_PATH, migrations applied).
 * Lazy so that merely importing this module has no side effects — route modules and
 * tests can import types/helpers without opening or migrating the production database.
 * Tests build isolated databases via `createDb(':memory:')` / `makeTestDb()` instead.
 */
export function getDb(): DbHandle {
  if (!appHandle) {
    appHandle = createDb(process.env.DATABASE_PATH ?? './data/data.sqlite');
  }
  return appHandle;
}
