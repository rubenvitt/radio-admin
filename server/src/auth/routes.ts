import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { mapGroupsToRole } from '@ra/shared';
import type { AppConfig } from '../config';
import type { AuthService } from './types';
import { signSession } from './session';
import { signOauthTx, verifyOauthTx, OAUTH_TX_COOKIE, SESSION_COOKIE } from './oauth-tx';
import { requireAuth } from './middleware';

export function createAuthRoutes(cfg: AppConfig, auth: AuthService) {
  const app = new Hono();
  const isProd = process.env.NODE_ENV === 'production';

  // GET /api/auth/login — start OIDC flow.
  app.get('/api/auth/login', async (c) => {
    const { authorizationUrl, tx } = await auth.startLogin();
    const txToken = await signOauthTx(tx, cfg.SESSION_SECRET);
    setCookie(c, OAUTH_TX_COOKIE, txToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'Lax',
      path: '/',
      maxAge: 600,
    });
    return c.redirect(authorizationUrl, 302);
  });

  // GET /api/auth/callback — finish OIDC flow, set session.
  app.get('/api/auth/callback', async (c) => {
    const txToken = getCookie(c, OAUTH_TX_COOKIE);
    if (!txToken) return c.json({ error: 'missing oauth transaction' }, 400);
    let tx;
    try {
      tx = await verifyOauthTx(txToken, cfg.SESSION_SECRET);
    } catch {
      return c.json({ error: 'invalid oauth transaction' }, 400);
    }
    deleteCookie(c, OAUTH_TX_COOKIE, { path: '/' });

    const currentUrl = new URL(c.req.url);
    let result;
    try {
      result = await auth.completeLogin(currentUrl, tx);
    } catch {
      return c.json({ error: 'authentication failed' }, 400);
    }

    const role = mapGroupsToRole(result.groups, {
      adminGroup: cfg.OIDC_ADMIN_GROUP,
      updaterGroup: cfg.OIDC_UPDATER_GROUP,
    });
    if (role === null) return c.redirect('/403', 302);

    const session = await signSession(
      { sub: result.sub, name: result.name, role },
      cfg.SESSION_SECRET,
    );
    setCookie(c, SESSION_COOKIE, session, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'Lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    return c.redirect('/', 302);
  });

  // POST /api/auth/logout — clear session.
  app.post('/api/auth/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // GET /api/auth/me — current user (requireAuth → 401 if missing).
  app.get('/api/auth/me', requireAuth(cfg), (c) => {
    const user = c.get('user');
    return c.json({ name: user.name, role: user.role });
  });

  return app;
}
