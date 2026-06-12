import { describe, it, expect } from 'vitest';
import { signSession } from './session';
import { signOauthTx, OAUTH_TX_COOKIE, SESSION_COOKIE } from './oauth-tx';
import { createAuthRoutes } from './routes';
import { createFakeAuthService } from './fake-auth-service';
import type { AppConfig } from '../config';

const secret = 'super-secret-value-at-least-16';
function cfg(over: Partial<AppConfig> = {}): AppConfig {
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

// Helper: extract a cookie value from a Set-Cookie header.
function cookieVal(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null;
  const m = setCookie.split(/,\s*(?=[^ ;]+=)/).map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  if (!m) return null;
  return decodeURIComponent(m.slice(name.length + 1).split(';')[0] ?? '');
}

describe('GET /api/auth/login', () => {
  it('redirects to provider authorization URL and sets a signed oauth_tx cookie', async () => {
    const auth = createFakeAuthService({
      authorizationUrl: 'https://id.example.org/authorize?state=state-123',
      tx: { state: 'state-123', nonce: 'nonce-123', code_verifier: 'verifier-123' },
    });
    const app = createAuthRoutes(cfg(), auth);
    const res = await app.request('/api/auth/login');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('id.example.org/authorize');
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${OAUTH_TX_COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
  });
});

describe('GET /api/auth/callback', () => {
  it('exchanges code, maps groups->role, sets session cookie, clears oauth_tx, redirects to /', async () => {
    const tx = { state: 'state-123', nonce: 'nonce-123', code_verifier: 'verifier-123' };
    const auth = createFakeAuthService({
      tx,
      result: { sub: 'user-1', name: 'Alice Admin', groups: ['admin'] },
    });
    const app = createAuthRoutes(cfg(), auth);
    const txCookie = await signOauthTx(tx, secret);
    const res = await app.request('/api/auth/callback?code=abc&state=state-123', {
      headers: { cookie: `${OAUTH_TX_COOKIE}=${txCookie}` },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    // session cookie decodes to an admin claim
    const token = cookieVal(setCookie, SESSION_COOKIE);
    expect(token).toBeTruthy();
  });

  it('returns 403 (redirect to /403) when groups map to no role', async () => {
    const tx = { state: 'state-123', nonce: 'nonce-123', code_verifier: 'verifier-123' };
    const auth = createFakeAuthService({
      tx,
      result: { sub: 'user-2', name: 'No Role', groups: ['some-other-group'] },
    });
    const app = createAuthRoutes(cfg(), auth);
    const txCookie = await signOauthTx(tx, secret);
    const res = await app.request('/api/auth/callback?code=abc&state=state-123', {
      headers: { cookie: `${OAUTH_TX_COOKIE}=${txCookie}` },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/403');
    expect(res.headers.get('set-cookie') ?? '').not.toContain(`${SESSION_COOKIE}=`);
  });

  it('returns 400 when the oauth_tx cookie is missing', async () => {
    const auth = createFakeAuthService();
    const app = createAuthRoutes(cfg(), auth);
    const res = await app.request('/api/auth/callback?code=abc&state=state-123');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('401 when unauthenticated', async () => {
    const app = createAuthRoutes(cfg(), createFakeAuthService());
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns { name, role } for a valid session', async () => {
    const app = createAuthRoutes(cfg(), createFakeAuthService());
    const token = await signSession({ sub: 'u1', name: 'Alice', role: 'admin' }, secret);
    const res = await app.request('/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Alice', role: 'admin' });
  });

  it('reflects the dev-bypass user when bypass is on', async () => {
    const app = createAuthRoutes(cfg({ AUTH_DEV_BYPASS: true, DEV_USER_ROLE: 'updater', DEV_USER_NAME: 'Dev' }), createFakeAuthService());
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Dev', role: 'updater' });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie and returns 200', async () => {
    const app = createAuthRoutes(cfg(), createFakeAuthService());
    const token = await signSession({ sub: 'u1', name: 'Alice', role: 'admin' }, secret);
    const res = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    // cookie cleared: Max-Age=0 (or Expires in the past)
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
