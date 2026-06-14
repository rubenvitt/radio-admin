import { Hono } from 'hono';
import {
  computeUpdateStatus,
  deviceCreateSchema,
  devicePatchSchema,
  filterEditableFields,
  diffDevice,
  appendUpdateNote,
  updateNoteSchema,
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
  deleteDevice,
  writeEvents,
  getDeviceEvents,
} from '../repos/deviceRepo';
import {
  getReferenceVersion,
  insertSoftwareVersionIfNew,
} from '../repos/softwareVersionRepo';
import { resolveUserNames } from '../repos/userRepo';

/** Parse a query param to a positive integer, or undefined (-> caller default). */
function safePositiveInt(raw: string | undefined): number | undefined {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function deviceRoutes(db: Db) {
  const r = new Hono();

  r.get('/devices', (c) => {
    const qp = c.req.query();
    // Guard against NaN/garbage query params: parse defensively and only forward a
    // positive finite integer; listDevices clamps the upper bound (pageSize <= 200).
    const page = safePositiveInt(qp.page);
    const pageSize = safePositiveInt(qp.pageSize);
    const result = listDevices(db, {
      q: qp.q,
      status: qp.status,
      location: qp.location,
      updateStatus: qp.updateStatus as UpdateStatus | undefined,
      sort: qp.sort,
      page,
      pageSize,
    });
    return c.json(result);
  });

  r.get('/devices/:id/events', (c) => {
    const id = c.req.param('id');
    if (!getDeviceById(db, id)) return c.json({ error: 'not_found' }, 404);
    const events = getDeviceEvents(db, id);
    // Additively resolve `changedBy` (a stored `sub`) to a display name; fall
    // back to the raw sub so the field is never blank.
    const subs = events.map((e) => e.changedBy).filter((s): s is string => s != null);
    const names = resolveUserNames(db, subs);
    return c.json(
      events.map((e) => ({
        ...e,
        changedByName: e.changedBy != null ? (names.get(e.changedBy) ?? e.changedBy) : null,
      })),
    );
  });

  r.get('/devices/:id', (c) => {
    const device = getDeviceById(db, c.req.param('id'));
    if (!device) return c.json({ error: 'not_found' }, 404);
    const ref = getReferenceVersion(db);
    const updateStatus = computeUpdateStatus(device, ref);
    // Additively resolve the audit subs to display names; keep the raw
    // createdBy/updatedBy and fall back to the raw sub when unknown.
    const subs = [device.createdBy, device.updatedBy].filter((s): s is string => s != null);
    const names = resolveUserNames(db, subs);
    return c.json({
      ...device,
      updateStatus,
      createdByName: device.createdBy != null ? (names.get(device.createdBy) ?? device.createdBy) : null,
      updatedByName: device.updatedBy != null ? (names.get(device.updatedBy) ?? device.updatedBy) : null,
    });
  });

  r.post('/devices', requireRole('admin'), async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = deviceCreateSchema.safeParse(json);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const user = c.get('user');

    // One 'create' event per non-null submitted field (oldValue null).
    const diffs: FieldDiff[] = Object.entries(parsed.data)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([field, v]) => ({ field, oldValue: null, newValue: String(v) }));

    // Atomic: software-version registration + device insert + events succeed or
    // roll back together (e.g. a duplicate-ISSI throw rolls back the whole write).
    const device = db.transaction(() => {
      if (parsed.data.softwareVersion) {
        insertSoftwareVersionIfNew(db, parsed.data.softwareVersion, user.sub);
      }
      const created = createDevice(db, parsed.data, user.sub);
      writeEvents(db, created.id, diffs, user.sub, 'create');
      return created;
    });

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

    // Atomic: software-version registration + device update + events succeed or
    // roll back together (e.g. changing issi to an existing one rolls back).
    const updated = db.transaction(() => {
      if (allowed.softwareVersion) {
        insertSoftwareVersionIfNew(db, allowed.softwareVersion, user.sub);
      }
      const u = updateDevice(db, id, allowed, user.sub)!;
      writeEvents(db, id, diffs, user.sub, 'manual');
      return u;
    });

    const ref = getReferenceVersion(db);
    return c.json({ ...updated, updateStatus: computeUpdateStatus(updated, ref) });
  });

  // Append-only Update-Anmerkung. Open to any authenticated role (admin &
  // updater); append semantics are enforced server-side, never overwriting
  // `notes` or existing updateNote lines.
  r.post('/devices/:id/update-note', async (c) => {
    const id = c.req.param('id');
    const existing = getDeviceById(db, id);
    if (!existing) return c.json({ error: 'not_found' }, 404);

    const json = await c.req.json().catch(() => null);
    const parsed = updateNoteSchema.safeParse(json);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);

    const user = c.get('user');
    const line = appendUpdateNote('', parsed.data.text, user.name, new Date());
    const nextNote = appendUpdateNote(existing.updateNote, parsed.data.text, user.name, new Date());

    const updated = db.transaction(() => {
      const u = updateDevice(db, id, { updateNote: nextNote }, user.sub)!;
      writeEvents(db, id, [{ field: 'updateNote', oldValue: existing.updateNote, newValue: line }], user.sub, 'update-note');
      return u;
    });

    const ref = getReferenceVersion(db);
    return c.json({ ...updated, updateStatus: computeUpdateStatus(updated, ref) });
  });

  r.delete('/devices/:id', requireRole('admin'), (c) => {
    const ok = deleteDevice(db, c.req.param('id'));
    if (!ok) return c.json({ error: 'not_found' }, 404);
    return c.body(null, 204);
  });

  return r;
}
