import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from './deviceRepo';
import { newId } from '../db/id';
import { apiTokens } from '../db/schema';

/** Full api_tokens row as stored (includes tokenHash — never expose directly). */
export interface ApiTokenRecord {
  id: string;
  name: string;
  tokenHash: string;
  prefix: string;
  createdAt: number;
  createdBy: string | null;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

/** Public list shape — deliberately omits tokenHash. */
export interface ApiTokenListItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

/** sha256 hex of the plaintext secret. */
function sha256hex(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Mint a new API token. The plaintext `secret` (`ra_` + 24 random bytes hex) is
 * returned ONCE; only its sha256 hash and an 11-char display prefix are stored.
 */
export function createApiToken(
  db: Db,
  name: string,
  createdBy: string | null,
): { record: ApiTokenRecord; secret: string } {
  const secret = `ra_${randomBytes(24).toString('hex')}`;
  const record: ApiTokenRecord = {
    id: newId(),
    name,
    tokenHash: sha256hex(secret),
    prefix: secret.slice(0, 11),
    createdAt: Date.now(),
    createdBy,
    lastUsedAt: null,
    revokedAt: null,
  };
  db.insert(apiTokens).values(record).run();
  return { record, secret };
}

/**
 * Verify a presented plaintext secret: hash it, look up a NON-revoked row by the
 * hash. On a match, stamp `lastUsedAt = now` and return the row; otherwise null.
 */
export function verifyApiToken(db: Db, secret: string): ApiTokenRecord | null {
  if (!secret) return null;
  const hash = sha256hex(secret);
  const row = db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt)))
    .get();
  if (!row) return null;
  const now = Date.now();
  db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.id)).run();
  return { ...row, lastUsedAt: now };
}

/** List tokens newest-first. NEVER returns tokenHash. */
export function listApiTokens(db: Db): ApiTokenListItem[] {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .orderBy(desc(apiTokens.createdAt))
    .all();
}

/** Revoke a token (set revokedAt). Returns false if the id does not exist. */
export function revokeApiToken(db: Db, id: string): boolean {
  const res = db
    .update(apiTokens)
    .set({ revokedAt: Date.now() })
    .where(eq(apiTokens.id, id))
    .run();
  return res.changes > 0;
}
