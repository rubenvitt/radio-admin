import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { makeTestDb } from '../src/db/test-utils';
import { signSession } from '../src/auth/session';
import { SESSION_COOKIE } from '../src/auth/oauth-tx';
import { buildTestApp, TEST_SECRET } from './helpers';

describe('buildApp wires the auth router', () => {
  it('exposes GET /api/auth/me (401 without a session)', async () => {
    const { db } = makeTestDb();
    const res = await buildTestApp(db).request('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns { name, role } for a valid session at /api/auth/me', async () => {
    const { db } = makeTestDb();
    const token = await signSession({ sub: 'u1', name: 'Alice', role: 'admin' }, TEST_SECRET);
    const res = await buildTestApp(db).request('/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Alice', role: 'admin' });
  });

  it('keeps POST /api/auth/logout PUBLIC (reachable without a session)', async () => {
    // logout (like login/callback) is registered before the global /api/* guard,
    // so an unauthenticated request reaches the handler instead of the guard's
    // 401. This proves the public auth routes are mounted ahead of requireAuth.
    // (login/callback redirect behavior is covered in auth/routes.test.ts; we
    // avoid /api/auth/login here because it would trigger real OIDC discovery.)
    const { db } = makeTestDb();
    const res = await buildTestApp(db).request('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('reflects the dev-bypass user at /api/auth/me under AUTH_DEV_BYPASS', async () => {
    const cfg = loadConfig({
      AUTH_DEV_BYPASS: 'true',
      DEV_USER_ROLE: 'updater',
      DEV_USER_NAME: 'Dev',
    });
    const { db } = makeTestDb();
    const res = await buildApp(cfg, db).request('/api/auth/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Dev', role: 'updater' });
  });
});
