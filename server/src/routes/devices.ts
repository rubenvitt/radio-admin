import { Hono } from 'hono';
import {
  computeUpdateStatus,
  deviceCreateSchema,
  devicePatchSchema,
  filterEditableFields,
  diffDevice,
  type UpdateStatus,
  type FieldDiff,
  type DeviceRecord,
} from '@ra/shared';
import { requireRole } from '../auth/middleware';
import type { Db } from '../repos/deviceRepo';
import {
  listDevices,
  getDeviceById,
  createDevice,
  updateDevice,
  writeEvents,
} from '../repos/deviceRepo';
import {
  getReferenceVersion,
  insertSoftwareVersionIfNew,
} from '../repos/softwareVersionRepo';

export function deviceRoutes(db: Db) {
  const r = new Hono();

  r.get('/devices', (c) => {
    const qp = c.req.query();
    const result = listDevices(db, {
      q: qp.q,
      status: qp.status,
      location: qp.location,
      updateStatus: qp.updateStatus as UpdateStatus | undefined,
      sort: qp.sort,
      page: qp.page ? Number(qp.page) : undefined,
      pageSize: qp.pageSize ? Number(qp.pageSize) : undefined,
    });
    return c.json(result);
  });

  r.get('/devices/:id', (c) => {
    const device = getDeviceById(db, c.req.param('id'));
    if (!device) return c.json({ error: 'not_found' }, 404);
    const ref = getReferenceVersion(db);
    const updateStatus = computeUpdateStatus(device, ref);
    return c.json({ ...device, updateStatus });
  });

  r.post('/devices', requireRole('admin'), async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = deviceCreateSchema.safeParse(json);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const user = c.get('user');

    if (parsed.data.softwareVersion) {
      insertSoftwareVersionIfNew(db, parsed.data.softwareVersion, user.sub);
    }
    const device = createDevice(db, parsed.data, user.sub);

    // One 'create' event per non-null submitted field (oldValue null).
    const diffs: FieldDiff[] = Object.entries(parsed.data)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([field, v]) => ({ field, oldValue: null, newValue: String(v) }));
    writeEvents(db, device.id, diffs, user.sub, 'create');

    return c.json(device, 201);
  });

  // PATCH is open to any role; the field allowlist (not a route guard) is the
  // authorization boundary — disallowed fields are silently dropped, not rejected.
  r.patch('/devices/:id', async (c) => {
    const id = c.req.param('id');
    const existing = getDeviceById(db, id);
    if (!existing) return c.json({ error: 'not_found' }, 404);

    const json = await c.req.json().catch(() => null);
    const parsed = devicePatchSchema.safeParse(json);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);

    const user = c.get('user');
    const allowed = filterEditableFields(user.role, parsed.data) as Partial<DeviceRecord>;
    const diffs = diffDevice(existing, allowed);

    if (diffs.length === 0) {
      const ref0 = getReferenceVersion(db);
      return c.json({ ...existing, updateStatus: computeUpdateStatus(existing, ref0) });
    }

    if (allowed.softwareVersion) {
      insertSoftwareVersionIfNew(db, allowed.softwareVersion, user.sub);
    }
    const updated = updateDevice(db, id, allowed, user.sub)!;
    writeEvents(db, id, diffs, user.sub, 'manual');

    const ref = getReferenceVersion(db);
    return c.json({ ...updated, updateStatus: computeUpdateStatus(updated, ref) });
  });

  return r;
}
