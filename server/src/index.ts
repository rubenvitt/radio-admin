// @ra/server entry. Assembles the production Hono app from the live config + db.
import { loadConfig } from './config';
import { getDb } from './db/index';
import { buildApp } from './app';

export { buildApp } from './app';

/**
 * Build the production app: real config from the environment and the lazily
 * opened application database. Call this from the HTTP server bootstrap; merely
 * importing this module stays side-effect-free (no db opened, no config read).
 */
export function createProductionApp() {
  const cfg = loadConfig();
  const { db } = getDb();
  return buildApp(cfg, db);
}
