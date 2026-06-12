import { Hono } from 'hono';
import type { AppConfig } from './config';
import { requireAuth } from './auth/middleware';
import { createAuthRoutes } from './auth/routes';
import { createAuthService } from './auth/auth-service';
import { createFakeAuthService } from './auth/fake-auth-service';
import type { Db } from './repos/deviceRepo';
import { deviceRoutes } from './routes/devices';
import { suggestionRoutes } from './routes/suggestions';
import { softwareVersionRoutes } from './routes/softwareVersions';
import { importRoutes } from './routes/import';
import { tokenRoutes } from './routes/tokens';
import { loanApiRoutes } from './routes/loanApi';
import { mountStatic } from './static';

// Augment Hono context with the request-scoped database handle, so later phases
// (e.g. the CSV import routes) can read `c.get('db')` instead of closing over it.
declare module 'hono' {
  interface ContextVariableMap {
    db: Db;
  }
}

/**
 * Assemble the application: inject `db` into the Hono context, guard `/api/*`
 * with `requireAuth(cfg)`, and mount the device routers. Both production
 * (`getDb().db`) and tests (`makeTestDb().db`) call this with their own db.
 */
export function buildApp(cfg: AppConfig, db: Db): Hono {
  const app = new Hono();

  // Make the db available on every request context (used by routes + Phase 4).
  app.use('*', (c, next) => {
    c.set('db', db);
    return next();
  });

  // Auth router FIRST, before the global /api/* guard: login/callback/logout must
  // be PUBLIC (otherwise OIDC login is unreachable — the guard would 401 before
  // login runs). /api/auth/me carries its own inline requireAuth. Under dev bypass
  // the OIDC service is never used, so a fake service is wired (createAuthService
  // requires OIDC config and is only constructed for the real flow).
  const auth = cfg.AUTH_DEV_BYPASS ? createFakeAuthService() : createAuthService(cfg);
  app.route('/', createAuthRoutes(cfg, auth));

  // Public, API-token-authed loan endpoint. Registered BEFORE the session guard
  // so service callers (no browser session) can reach it; it enforces its own
  // Bearer/X-API-Key token check via verifyApiToken.
  app.route('/api', loanApiRoutes(db));

  // All remaining /api routes require an authenticated session.
  app.use('/api/*', requireAuth(cfg));

  app.route('/api', deviceRoutes(db));
  app.route('/api', suggestionRoutes(db));
  app.route('/api', softwareVersionRoutes(db));
  app.route('/api', importRoutes(db));
  // Admin-only API-token management (each route also requires the admin role).
  app.route('/api', tokenRoutes(db));

  // Serve the built SPA + static assets AFTER all /api routes are registered, so
  // the catch-all fallback can never shadow an API endpoint. Disabled when
  // SERVE_CLIENT=false (the test harness sets this so unit tests stay API-only).
  if (process.env.SERVE_CLIENT !== 'false') {
    const staticDir = process.env.STATIC_DIR ?? './client/dist';
    mountStatic(app, staticDir);
  }

  // Global error handler: map a better-sqlite3 UNIQUE-constraint violation (only
  // reachable via the unique `devices.issi` column — software_versions inserts use
  // onConflictDoNothing) to a structured 409; everything else is an opaque 500.
  app.onError((err, c) => {
    const code = (err as { code?: string }).code;
    if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'issi_conflict' }, 409);
    }
    return c.json({ error: 'internal' }, 500);
  });

  return app;
}
