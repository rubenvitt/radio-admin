import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../src/db/test-utils';
import { users } from '../src/db/schema';
import { createAuthRoutes } from '../src/auth/routes';
import { createFakeAuthService } from '../src/auth/fake-auth-service';
import { signOauthTx, OAUTH_TX_COOKIE } from '../src/auth/oauth-tx';
import type { AppConfig } from '../src/config';
import type { Db } from '../src/repos/deviceRepo';

const secret = 'super-secret-value-at-least-32-chars';

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

/** Wrap the auth router with the same db-injecting middleware buildApp uses. */
function appWithDb(c: AppConfig, db: Db, auth = createFakeAuthService()) {
  const app = new Hono();
  app.use('*', (ctx, next) => {
    ctx.set('db', db);
    return next();
  });
  app.route('/', createAuthRoutes(c, auth));
  return app;
}

describe('auth populates the users table', () => {
  it('upserts the authenticated user on a successful login callback', async () => {
    const { db } = makeTestDb();
    const tx = { state: 'state-123', nonce: 'nonce-123', code_verifier: 'verifier-123' };
    const auth = createFakeAuthService({
      tx,
      result: { sub: 'user-1', name: 'Alice Admin', groups: ['admin'] },
    });
    const app = appWithDb(cfg(), db, auth);
    const txCookie = await signOauthTx(tx, secret);

    const res = await app.request('/api/auth/callback?code=abc&state=state-123', {
      headers: { cookie: `${OAUTH_TX_COOKIE}=${txCookie}` },
    });
    expect(res.status).toBe(302);

    const row = db.select().from(users).where(eq(users.sub, 'user-1')).get();
    expect(row?.name).toBe('Alice Admin');
  });

  it('upserts the dev-bypass user when bypass is on', async () => {
    const { db } = makeTestDb();
    const app = appWithDb(cfg({ AUTH_DEV_BYPASS: true, DEV_USER_NAME: 'Dev', DEV_USER_ROLE: 'admin' }), db);

    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(200);

    const row = db.select().from(users).where(eq(users.sub, 'dev-user')).get();
    expect(row?.name).toBe('Dev');
  });
});
