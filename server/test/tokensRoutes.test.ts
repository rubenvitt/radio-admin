import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser, updaterUser } from './helpers';

interface CreateResp {
  id: string;
  name: string;
  token: string;
  prefix: string;
  createdAt: number;
}
interface ListItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

async function post(app: ReturnType<typeof buildTestApp>, cookie: string, body: unknown) {
  return app.request('/api/tokens', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('admin token routes', () => {
  it('POST /api/tokens mints a one-time plaintext token (admin)', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await post(app, await authCookie(adminUser), { name: 'CI bot' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as CreateResp;
    expect(body.name).toBe('CI bot');
    expect(body.token).toMatch(/^ra_[0-9a-f]{48}$/);
    expect(body.prefix).toBe(body.token.slice(0, 11));
    expect(typeof body.createdAt).toBe('number');
  });

  it('GET /api/tokens lists without secrets/hashes (admin)', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const cookie = await authCookie(adminUser);
    await post(app, cookie, { name: 'svc-a' });
    const res = await app.request('/api/tokens', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const list = (await res.json()) as ListItem[];
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('svc-a');
    expect(list[0]).not.toHaveProperty('token');
    expect(list[0]).not.toHaveProperty('tokenHash');
  });

  it('DELETE /api/tokens/:id revokes (204) and 404 for unknown', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const cookie = await authCookie(adminUser);
    const created = (await (await post(app, cookie, { name: 'gone' })).json()) as CreateResp;
    const del = await app.request(`/api/tokens/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(del.status).toBe(204);
    const list = (await (await app.request('/api/tokens', { headers: { Cookie: cookie } })).json()) as ListItem[];
    expect(list[0]?.revokedAt).not.toBeNull();
    const missing = await app.request('/api/tokens/nope', {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(missing.status).toBe(404);
  });

  it('rejects non-admins with 403 and unauthenticated with 401', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const updater = await post(app, await authCookie(updaterUser), { name: 'x' });
    expect(updater.status).toBe(403);
    const anon = await app.request('/api/tokens', { method: 'GET' });
    expect(anon.status).toBe(401);
  });

  it('rejects a missing/empty name with 400 (admin)', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await post(app, await authCookie(adminUser), { name: '' });
    expect(res.status).toBe(400);
  });
});
