import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveMigrationsDir } from './migrations-dir.js';

/**
 * Apply all committed drizzle migrations to the SQLite file at `databasePath`.
 * Idempotent: drizzle records applied migrations in `__drizzle_migrations`, so
 * re-running is a no-op. Creates the parent directory if needed. No drizzle-kit
 * is required at runtime — only the committed `server/drizzle/*.sql`.
 */
export function runMigrations(databasePath: string): void {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: resolveMigrationsDir(import.meta.url) });
  sqlite.close();
}

// CLI entry: `node dist/migrate.js`. Guarded so importing the module is
// side-effect-free (the test imports runMigrations without running it).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.env.DATABASE_PATH ?? './data/data.sqlite';
  runMigrations(path);
  console.log(`[migrate] applied migrations to ${path}`);
}
