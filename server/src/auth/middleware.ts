import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Role } from '@ra/shared';
import type { AppConfig } from '../config';
import type { SessionClaims } from './types';
import { verifySession } from './session';
import { SESSION_COOKIE } from './oauth-tx';
import { upsertUser } from '../repos/userRepo';

// Augment Hono context variable map with the authenticated user.
declare module 'hono' {
  interface ContextVariableMap {
    user: SessionClaims;
  }
}

export function requireAuth(cfg: AppConfig): MiddlewareHandler {
  return async (c, next) => {
    if (cfg.AUTH_DEV_BYPASS) {
      c.set('user', {
        sub: 'dev-user',
        name: cfg.DEV_USER_NAME,
        role: cfg.DEV_USER_ROLE,
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      // Record the bypass user so audit columns resolve to a display name. A
      // per-request upsert is acceptable — it's a cheap conflict-update. The db
      // is injected by buildApp's `app.use('*')`; guard for callers that mount
      // requireAuth without that middleware (e.g. unit tests).
      const db = c.get('db');
      if (db) upsertUser(db, 'dev-user', cfg.DEV_USER_NAME);
      return next();
    }
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return c.json({ error: 'unauthenticated' }, 401);
    try {
      const claims = await verifySession(token, cfg.SESSION_SECRET);
      c.set('user', claims);
    } catch {
      return c.json({ error: 'unauthenticated' }, 401);
    }
    return next();
  };
}

export function requireRole(role: Role): MiddlewareHandler {
  return async (c: Context, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'unauthenticated' }, 401);
    if (user.role !== role) return c.json({ error: 'forbidden' }, 403);
    return next();
  };
}

/** Loud, unmissable startup warning while the auth bypass is active. */
export function warnIfDevBypass(cfg: AppConfig): void {
  if (!cfg.AUTH_DEV_BYPASS) return;
  const line = '!'.repeat(72);
  console.warn(line);
  console.warn(
    `!! AUTH_DEV_BYPASS=true — authentication is DISABLED. Every request runs as ` +
      `fake user "${cfg.DEV_USER_NAME}" with role "${cfg.DEV_USER_ROLE}". DO NOT use in production.`,
  );
  console.warn(line);
}
