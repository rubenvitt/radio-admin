import { Hono } from 'hono';
import { requireRole } from '../auth/middleware';
import type { Db } from '../repos/deviceRepo';
import { listLoans, findActiveLoans } from '../repos/loanRepo';
import { loanHistoryParamsSchema } from '@ra/shared';
import { runPurge } from '../services/retentionService';

/**
 * Session-guarded loan overview for the radio-admin SPA. Mounted under `/api`
 * AFTER requireAuth, so every route already has an authenticated user. The read
 * views are open to any role (read-only overview); the manual retention purge is
 * admin-only.
 */
export function loansRoutes(db: Db) {
  const r = new Hono();

  // GET /api/loans — paginated overview (active + returned), newest-borrowed first.
  r.get('/loans', (c) => {
    const parsed = loanHistoryParamsSchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_query' }, 400);
    return c.json(listLoans(db, parsed.data));
  });

  // GET /api/loans/active — current active loans only.
  r.get('/loans/active', (c) => c.json(findActiveLoans(db)));

  // POST /api/loans/purge — manual retention purge (admin only); returns the count.
  r.post('/loans/purge', requireRole('admin'), (c) => {
    return c.json({ deleted: runPurge(db) });
  });

  return r;
}
