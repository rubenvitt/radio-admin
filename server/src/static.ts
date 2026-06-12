import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/**
 * Mount the built single-page-app:
 *
 * - static files (JS/CSS/img/index.html) are served from `clientDistDir`;
 * - any remaining non-`/api` GET falls back to `index.html` so client-side
 *   routing (e.g. `/devices/:id`) works on a hard reload;
 * - `/api/*` never falls back — an unmatched API route returns a JSON 404.
 *
 * Call this LAST in `buildApp`, after every `/api` router is registered, so the
 * catch-all cannot shadow real endpoints.
 *
 * `@hono/node-server`'s `serveStatic` joins `root` with the request path, so an
 * absolute `clientDistDir` is resolved independently of `process.cwd()`.
 */
export function mountStatic(app: Hono, clientDistDir: string): void {
  app.use('/*', serveStatic({ root: clientDistDir }));

  // SPA fallback: non-/api GET that did not match a static file -> index.html.
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api')) {
      return c.json({ error: 'not_found' }, 404);
    }
    const indexPath = isAbsolute(clientDistDir)
      ? join(clientDistDir, 'index.html')
      : join(process.cwd(), clientDistDir, 'index.html');
    const html = readFileSync(indexPath, 'utf8');
    return c.html(html);
  });
}
