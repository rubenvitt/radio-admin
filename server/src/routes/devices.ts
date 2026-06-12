import { Hono } from 'hono';
import { computeUpdateStatus, type UpdateStatus } from '@ra/shared';
import type { Db } from '../repos/deviceRepo';
import { listDevices, getDeviceById } from '../repos/deviceRepo';
import { getReferenceVersion } from '../repos/softwareVersionRepo';

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

  return r;
}
