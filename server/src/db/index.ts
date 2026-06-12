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

const DATABASE_PATH = process.env.DATABASE_PATH ?? './data/data.sqlite';

/** Application-wide database, initialized from DATABASE_PATH with migrations applied. */
export const { db, sqlite } = createDb(DATABASE_PATH);
