import { Hono } from 'hono';
import { isNotNull } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { suggestionFieldEnum, type SuggestionField } from '@ra/shared';
import type { Db } from '../repos/deviceRepo';
import { devices } from '../db/schema';

const COLUMN: Record<SuggestionField, SQLiteColumn> = {
  rufname: devices.rufname,
  deviceType: devices.deviceType,
  status: devices.status,
  location: devices.location,
  assignedTo: devices.assignedTo,
  opta: devices.opta,
  funktion: devices.funktion,
  hersteller: devices.hersteller,
  bedieneinheit: devices.bedieneinheit,
};

export function suggestionRoutes(db: Db) {
  const r = new Hono();
  r.get('/suggestions', (c) => {
    const parsed = suggestionFieldEnum.safeParse(c.req.query('field'));
    if (!parsed.success) return c.json({ error: 'invalid_field' }, 400);
    const col = COLUMN[parsed.data];
    const rows = db
      .selectDistinct({ v: col })
      .from(devices)
      .where(isNotNull(col))
      .orderBy(col)
      .all();
    return c.json({ values: rows.map((row) => row.v as string) });
  });
  return r;
}
