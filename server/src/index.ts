// @ra/server entry. Assembles the production Hono app from the live config + db
// and — when run directly (`node dist/index.js`) — starts the HTTP listener.
import { serve } from '@hono/node-server';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config';
import { getDb } from './db/index';
import { buildApp } from './app';
import { startRetentionSchedule } from './services/retentionService';

export { buildApp } from './app';

/**
 * Build the production app: real config from the environment and the lazily
 * opened application database (migrations run on first open). Call this from the
 * HTTP server bootstrap; merely importing this module stays side-effect-free
 * (no db opened, no config read, no port bound).
 */
export function createProductionApp() {
  const cfg = loadConfig();
  const { db } = getDb();
  return buildApp(cfg, db);
}

/**
 * Start the all-in-one HTTP server: serves `/api/*` and the built SPA from one
 * origin. Returns the node-server handle so callers (and tests) can close it.
 */
export function startServer() {
  const cfg = loadConfig();
  const { db } = getDb();
  const app = buildApp(cfg, db);

  // Process-lifetime retention purge (DSGVO): immediate + daily. Kept out of
  // buildApp so unit tests that build the app stay side-effect-free.
  startRetentionSchedule(db);

  const server = serve({ fetch: app.fetch, port: cfg.PORT }, (info) => {
    console.log(`[server] radio-admin listening on http://0.0.0.0:${info.port}`);
  });

  if (cfg.AUTH_DEV_BYPASS) {
    console.warn(
      `[server] !! AUTH_DEV_BYPASS=true — authentication is DISABLED. ` +
        `Every request runs as "${cfg.DEV_USER_NAME}" (role: ${cfg.DEV_USER_ROLE}). ` +
        `Never enable this in production.`,
    );
  }

  return server;
}

// Run the listener only when this module is the program entry (`node dist/index.js`
// or `tsx src/index.ts`), so importing it elsewhere never binds a port.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
