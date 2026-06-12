import { Hono } from 'hono';
import type { Db } from '../repos/deviceRepo';
import { listSoftwareVersions } from '../repos/softwareVersionRepo';

export function softwareVersionRoutes(db: Db) {
  const r = new Hono();
  r.get('/software-versions', (c) => c.json(listSoftwareVersions(db)));
  return r;
}
