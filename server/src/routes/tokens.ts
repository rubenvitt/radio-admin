import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole } from '../auth/middleware';
import type { Db } from '../repos/deviceRepo';
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from '../repos/apiTokenRepo';

const createTokenSchema = z.object({ name: z.string().min(1) }).strip();

/**
 * Admin API-token management. Mounted under `/api` AFTER the session guard, and
 * every route additionally requires the `admin` role. The one-time plaintext
 * token is returned only by POST; it is never retrievable afterwards.
 */
export function tokenRoutes(db: Db) {
  const r = new Hono();

  // POST /api/tokens — mint a token; returns the plaintext `token` ONCE.
  r.post('/tokens', requireRole('admin'), async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = createTokenSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'Ungültige Eingabe', issues: parsed.error.issues }, 400);
    }
    const user = c.get('user');
    const createdBy = user.name ?? user.sub;
    const { record, secret } = createApiToken(db, parsed.data.name, createdBy);
    return c.json(
      {
        id: record.id,
        name: record.name,
        token: secret,
        prefix: record.prefix,
        createdAt: record.createdAt,
      },
      201,
    );
  });

  // GET /api/tokens — list tokens (no secrets, no hashes).
  r.get('/tokens', requireRole('admin'), (c) => c.json(listApiTokens(db)));

  // DELETE /api/tokens/:id — revoke a token. 204 on success, 404 if unknown.
  r.delete('/tokens/:id', requireRole('admin'), (c) => {
    const ok = revokeApiToken(db, c.req.param('id'));
    if (!ok) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });

  return r;
}
