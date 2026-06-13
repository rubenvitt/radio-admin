import { inArray } from 'drizzle-orm';
import type { Db } from './deviceRepo';
import { users } from '../db/schema';

/**
 * Record a known user: insert by `sub`, or on conflict refresh `name` and
 * `lastSeenAt`. Called on authentication so audit columns (which store `sub`)
 * can later be resolved to a display name, and a renamed user's name stays
 * current. Cheap conflict-update — safe to call per request under dev-bypass.
 */
export function upsertUser(db: Db, sub: string, name: string): void {
  const now = Date.now();
  db.insert(users)
    .values({ sub, name, lastSeenAt: now })
    .onConflictDoUpdate({
      target: users.sub,
      set: { name, lastSeenAt: now },
    })
    .run();
}

/**
 * Resolve `sub -> name` for the known subs among `subs`. Input is deduped;
 * unknown subs are absent from the returned map (callers fall back to the raw
 * sub). Empty input returns an empty map without touching the db — avoids the
 * invalid `IN ()` SQL that SQLite would reject.
 */
export function resolveUserNames(db: Db, subs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const unique = [...new Set(subs)];
  if (unique.length === 0) return map;

  const rows = db
    .select({ sub: users.sub, name: users.name })
    .from(users)
    .where(inArray(users.sub, unique))
    .all();
  for (const r of rows) map.set(r.sub, r.name);
  return map;
}
