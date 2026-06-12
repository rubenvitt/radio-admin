import { createDb, type DbHandle } from './index';

/** The drizzle database type shared by production (`getDb`) and tests (`makeTestDb`). */
export type TestDb = DbHandle['db'];

/**
 * Build a fresh, isolated, migrated in-memory database for every call.
 * Reuses the production `createDb(':memory:')` so the migrations folder, FK
 * pragma and drizzle schema are identical to production — tests exercise the
 * real DDL, not a hand-rolled copy.
 */
export function makeTestDb(): DbHandle {
  return createDb(':memory:');
}
