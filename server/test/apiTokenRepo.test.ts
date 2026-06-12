import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { makeTestDb } from '../src/db/test-utils';
import {
  createApiToken,
  verifyApiToken,
  listApiTokens,
  revokeApiToken,
} from '../src/repos/apiTokenRepo';

describe('apiTokenRepo', () => {
  it('createApiToken returns a ra_ plaintext secret once and stores only its hash + prefix', () => {
    const { db } = makeTestDb();
    const { record, secret } = createApiToken(db, 'CI bot', 'admin-1');
    expect(secret).toMatch(/^ra_[0-9a-f]{48}$/); // 24 bytes -> 48 hex chars
    expect(record.name).toBe('CI bot');
    expect(record.createdBy).toBe('admin-1');
    expect(record.prefix).toBe(secret.slice(0, 11));
    // The stored hash is sha256(secret); the plaintext is never persisted.
    expect(record.tokenHash).toBe(createHash('sha256').update(secret).digest('hex'));
    expect(record.tokenHash).not.toContain(secret);
    expect(record.lastUsedAt).toBeNull();
    expect(record.revokedAt).toBeNull();
  });

  it('verifyApiToken accepts the matching secret and stamps lastUsedAt', () => {
    const { db } = makeTestDb();
    const { secret } = createApiToken(db, 'svc', null);
    const before = Date.now();
    const verified = verifyApiToken(db, secret);
    expect(verified).not.toBeNull();
    expect(verified?.name).toBe('svc');
    expect(verified?.lastUsedAt).toBeGreaterThanOrEqual(before);
    // The stamp is persisted.
    const list = listApiTokens(db);
    expect(list[0]?.lastUsedAt).toBe(verified?.lastUsedAt);
  });

  it('verifyApiToken rejects a garbage or empty secret', () => {
    const { db } = makeTestDb();
    createApiToken(db, 'svc', null);
    expect(verifyApiToken(db, 'ra_deadbeef')).toBeNull();
    expect(verifyApiToken(db, '')).toBeNull();
  });

  it('verifyApiToken rejects a revoked token', () => {
    const { db } = makeTestDb();
    const { record, secret } = createApiToken(db, 'svc', null);
    expect(revokeApiToken(db, record.id)).toBe(true);
    expect(verifyApiToken(db, secret)).toBeNull();
  });

  it('listApiTokens never exposes the hash', () => {
    const { db } = makeTestDb();
    createApiToken(db, 'first', null);
    createApiToken(db, 'second', null);
    const list = listApiTokens(db);
    expect(list).toHaveLength(2);
    expect(list.map((i) => i.name).sort()).toEqual(['first', 'second']);
    for (const item of list) {
      expect(item).not.toHaveProperty('tokenHash');
      expect(Object.keys(item).sort()).toEqual(
        ['createdAt', 'id', 'lastUsedAt', 'name', 'prefix', 'revokedAt'].sort(),
      );
    }
  });

  it('revokeApiToken returns false for an unknown id', () => {
    const { db } = makeTestDb();
    expect(revokeApiToken(db, 'nope')).toBe(false);
  });
});
