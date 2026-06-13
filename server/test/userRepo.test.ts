import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../src/db/test-utils';
import { users } from '../src/db/schema';
import { upsertUser, resolveUserNames } from '../src/repos/userRepo';

describe('userRepo.upsertUser', () => {
  it('inserts a new user with the given sub and name', () => {
    const { db } = makeTestDb();
    upsertUser(db, 'sub-1', 'Alice');

    const row = db.select().from(users).where(eq(users.sub, 'sub-1')).get();
    expect(row?.name).toBe('Alice');
    expect(typeof row?.lastSeenAt).toBe('number');
  });

  it('updates the name (and lastSeenAt) on sub conflict instead of inserting a duplicate', () => {
    const { db } = makeTestDb();
    upsertUser(db, 'sub-1', 'Alice');
    const first = db.select().from(users).where(eq(users.sub, 'sub-1')).get();

    upsertUser(db, 'sub-1', 'Alice Renamed');

    const rows = db.select().from(users).where(eq(users.sub, 'sub-1')).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Alice Renamed');
    // lastSeenAt is refreshed to "now", never moving backwards.
    expect(rows[0]?.lastSeenAt).toBeGreaterThanOrEqual(first!.lastSeenAt);
  });
});

describe('userRepo.resolveUserNames', () => {
  it('returns a sub->name map for known subs', () => {
    const { db } = makeTestDb();
    upsertUser(db, 'sub-1', 'Alice');
    upsertUser(db, 'sub-2', 'Bob');

    const map = resolveUserNames(db, ['sub-1', 'sub-2']);
    expect(map.get('sub-1')).toBe('Alice');
    expect(map.get('sub-2')).toBe('Bob');
    expect(map.size).toBe(2);
  });

  it('omits unknown subs (absent from the map, not blank)', () => {
    const { db } = makeTestDb();
    upsertUser(db, 'sub-1', 'Alice');

    const map = resolveUserNames(db, ['sub-1', 'ghost']);
    expect(map.get('sub-1')).toBe('Alice');
    expect(map.has('ghost')).toBe(false);
  });

  it('dedupes the input subs', () => {
    const { db } = makeTestDb();
    upsertUser(db, 'sub-1', 'Alice');

    const map = resolveUserNames(db, ['sub-1', 'sub-1', 'sub-1']);
    expect(map.get('sub-1')).toBe('Alice');
    expect(map.size).toBe(1);
  });

  it('returns an empty map for empty input (no IN () SQL)', () => {
    const { db } = makeTestDb();
    const map = resolveUserNames(db, []);
    expect(map.size).toBe(0);
  });
});
