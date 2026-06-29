import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole } from '../auth/middleware';
import type { Db } from '../repos/deviceRepo';
import {
  createSoftwareVersion,
  deleteSoftwareVersion,
  listSoftwareVersions,
  reorderSoftwareVersions,
  setTargetVersion,
} from '../repos/softwareVersionRepo';

const createSchema = z.object({ value: z.string().trim().min(1) }).strip();
const reorderSchema = z.object({ ids: z.array(z.string()) }).strip();

/**
 * Software-version registry + admin management. GET is open to any authenticated
 * session (consumed by device forms, the update mode and the admin page); every
 * mutation additionally requires the `admin` role. The "current" target version
 * is set explicitly here, never derived from creation time.
 */
export function softwareVersionRoutes(db: Db) {
  const r = new Hono();

  // GET /api/software-versions — all versions, newest-first, with target +
  // device-usage info.
  r.get('/software-versions', (c) => c.json(listSoftwareVersions(db)));

  // POST /api/software-versions — explicitly register a version (never target).
  r.post('/software-versions', requireRole('admin'), async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const created = createSoftwareVersion(db, parsed.data.value, c.get('user').sub);
    if (!created) return c.json({ error: 'exists' }, 409);
    return c.json(created, 201);
  });

  // PATCH /api/software-versions/order — apply a manual display order. Static
  // path; registered before the `:id` routes so it is never shadowed.
  r.patch('/software-versions/order', requireRole('admin'), async (c) => {
    const parsed = reorderSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    reorderSoftwareVersions(db, parsed.data.ids);
    return c.body(null, 204);
  });

  // POST /api/software-versions/:id/target — make this version the single target.
  r.post('/software-versions/:id/target', requireRole('admin'), (c) => {
    const ok = setTargetVersion(db, c.req.param('id'));
    if (!ok) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });

  // DELETE /api/software-versions/:id — delete a version. 409 while it is still
  // assigned to devices (the admin must reassign first).
  r.delete('/software-versions/:id', requireRole('admin'), (c) => {
    const res = deleteSoftwareVersion(db, c.req.param('id'));
    if (res.ok) return c.body(null, 204);
    if (res.reason === 'not_found') return c.json({ error: 'not_found' }, 404);
    return c.json({ error: 'in_use', deviceCount: res.deviceCount }, 409);
  });

  return r;
}
