import { Hono } from 'hono';
import type { AppConfig } from './config';
import { requireAuth } from './auth/middleware';
import type { Db } from './repos/deviceRepo';
import { deviceRoutes } from './routes/devices';
import { suggestionRoutes } from './routes/suggestions';
import { softwareVersionRoutes } from './routes/softwareVersions';

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

  // All /api routes require an authenticated session.
  app.use('/api/*', requireAuth(cfg));

  app.route('/api', deviceRoutes(db));
  app.route('/api', suggestionRoutes(db));
  app.route('/api', softwareVersionRoutes(db));

  return app;
}
