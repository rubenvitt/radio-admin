import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { signSession } from './session';
import { SESSION_COOKIE } from './oauth-tx';
import { requireAuth, requireRole, warnIfDevBypass } from './middleware';
import type { AppConfig } from '../config';

const secret = 'super-secret-value-at-least-32-chars';

function baseConfig(over: Partial<AppConfig> = {}): AppConfig {
  return {
    DATABASE_PATH: '/tmp/x.sqlite',
    SESSION_SECRET: secret,
    OIDC_ISSUER: 'https://id.example.org',
    OIDC_CLIENT_ID: 'c',
    OIDC_CLIENT_SECRET: 's',
    OIDC_REDIRECT_URI: 'https://app/api/auth/callback',
    OIDC_ADMIN_GROUP: 'admin',
    OIDC_UPDATER_GROUP: 'personal',
    AUTH_DEV_BYPASS: false,
    DEV_USER_ROLE: 'admin',
    DEV_USER_NAME: 'Dev User',
    PORT: 3000,
    ...over,
  };
}

// Minimal app exposing the current user under /whoami and an admin-only stub.
function makeApp(cfg: AppConfig) {
  const app = new Hono();
  app.use('*', requireAuth(cfg));
  app.get('/whoami', (c) => c.json(c.get('user')));
  app.post('/admin-only', requireRole('admin'), (c) => c.json({ ok: true }));
  return app;
}

describe('requireAuth', () => {
  it('returns 401 when no session cookie is present', async () => {
    const app = makeApp(baseConfig());
    const res = await app.request('/whoami');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid/garbage session cookie', async () => {
    const app = makeApp(baseConfig());
    const res = await app.request('/whoami', {
      headers: { cookie: `${SESSION_COOKIE}=garbage` },
    });
    expect(res.status).toBe(401);
  });

  it('passes through and sets c.get("user") for a valid session', async () => {
    const app = makeApp(baseConfig());
    const token = await signSession({ sub: 'u1', name: 'Alice', role: 'updater' }, secret);
    const res = await app.request('/whoami', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sub: 'u1', name: 'Alice', role: 'updater' });
  });
});

describe('dev-bypass', () => {
  it('injects a fake user with DEV_USER_ROLE and no cookie', async () => {
    const app = makeApp(baseConfig({ AUTH_DEV_BYPASS: true, DEV_USER_ROLE: 'updater', DEV_USER_NAME: 'Tester' }));
    const res = await app.request('/whoami');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sub: 'dev-user', name: 'Tester', role: 'updater' });
  });
});

describe('requireRole', () => {
  it('403 when an updater hits an admin-only route', async () => {
    const app = makeApp(baseConfig());
    const token = await signSession({ sub: 'u1', name: 'A', role: 'updater' }, secret);
    const res = await app.request('/admin-only', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('200 when an admin hits an admin-only route', async () => {
    const app = makeApp(baseConfig());
    const token = await signSession({ sub: 'u1', name: 'A', role: 'admin' }, secret);
    const res = await app.request('/admin-only', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('warnIfDevBypass', () => {
  it('logs a loud warning only when bypass is enabled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnIfDevBypass(baseConfig({ AUTH_DEV_BYPASS: false }));
    expect(warn).not.toHaveBeenCalled();
    warnIfDevBypass(baseConfig({ AUTH_DEV_BYPASS: true }));
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).toMatch(/AUTH_DEV_BYPASS/);
    warn.mockRestore();
  });
});
