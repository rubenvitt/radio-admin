import { and, asc, count, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { DbHandle } from '../db/index';
import { newId } from '../db/id';
import { devices, deviceEvents } from '../db/schema';
import { getReferenceVersion } from './softwareVersionRepo';
import type { DeviceRecord, DeviceCreate, UpdateStatus, FieldDiff } from '@ra/shared';

/** The drizzle database type shared by production (`getDb().db`) and tests (`makeTestDb().db`). */
export type Db = DbHandle['db'];

export function createDevice(db: Db, input: DeviceCreate, userId: string | null): DeviceRecord {
  const now = Date.now();
  const row = {
    id: newId(),
    rufname: input.rufname ?? null,
    issi: input.issi,
    serialNumber: input.serialNumber ?? null,
    deviceType: input.deviceType ?? null,
    status: input.status ?? null,
    location: input.location ?? null,
    assignedTo: input.assignedTo ?? null,
    softwareVersion: input.softwareVersion ?? null,
    lastUpdatedAt: input.lastUpdatedAt ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
  };
  db.insert(devices).values(row).run();
  return row;
}

export function getDeviceById(db: Db, id: string): DeviceRecord | undefined {
  return db.select().from(devices).where(eq(devices.id, id)).get();
}

export function deleteDevice(db: Db, id: string): boolean {
  const res = db.delete(devices).where(eq(devices.id, id)).run();
  return res.changes > 0;
}

export function updateDevice(
  db: Db,
  id: string,
  patch: Partial<DeviceRecord>,
  userId: string | null,
): DeviceRecord | undefined {
  const now = Date.now();
  db.update(devices)
    .set({ ...patch, updatedAt: now, updatedBy: userId })
    .where(eq(devices.id, id))
    .run();
  return getDeviceById(db, id);
}

export interface ListParams {
  q?: string;
  status?: string;
  location?: string;
  updateStatus?: UpdateStatus;
  sort?: string; // "field:asc" | "field:desc"
  page?: number; // 1-based
  pageSize?: number;
}
export interface DeviceListItem extends DeviceRecord {
  updateStatus: UpdateStatus;
}
export interface ListResult {
  rows: DeviceListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const SORTABLE: Record<string, SQLiteColumn> = {
  rufname: devices.rufname,
  issi: devices.issi,
  status: devices.status,
  location: devices.location,
  lastUpdatedAt: devices.lastUpdatedAt,
  createdAt: devices.createdAt,
};

export function listDevices(db: Db, params: ListParams): ListResult {
  const ref = getReferenceVersion(db); // string | null
  // SQL expression mirroring computeUpdateStatus(device, ref):
  //   null swVersion -> 'unbekannt'; equals ref -> 'aktuell'; else 'veraltet'.
  // When ref is null the 'aktuell' branch can never match, so non-null versions
  // fall through to 'veraltet' — matching the shared fn exactly.
  const statusExpr = sql<UpdateStatus>`CASE
    WHEN ${devices.softwareVersion} IS NULL THEN 'unbekannt'
    WHEN ${ref ?? null} IS NOT NULL AND ${devices.softwareVersion} = ${ref ?? null} THEN 'aktuell'
    ELSE 'veraltet' END`;

  const conds: SQL[] = [];
  if (params.q) {
    const term = `%${params.q}%`;
    const orExpr = or(
      like(devices.rufname, term),
      like(devices.issi, term),
      like(devices.serialNumber, term),
      like(devices.assignedTo, term),
    );
    if (orExpr) conds.push(orExpr);
  }
  if (params.status) conds.push(eq(devices.status, params.status));
  if (params.location) conds.push(eq(devices.location, params.location));
  if (params.updateStatus) conds.push(eq(statusExpr, params.updateStatus));
  const where = conds.length ? and(...conds) : undefined;

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25));

  let orderBy: SQL = desc(devices.createdAt);
  if (params.sort) {
    const [f, dir] = params.sort.split(':');
    const col: SQLiteColumn | SQL<UpdateStatus> | undefined =
      f === 'updateStatus' ? statusExpr : f ? SORTABLE[f] : undefined;
    if (col) orderBy = dir === 'desc' ? desc(col) : asc(col);
  }

  const totalRow = db.select({ c: count() }).from(devices).where(where).get();
  const total = totalRow?.c ?? 0;

  const rows = db
    .select({ d: devices, updateStatus: statusExpr })
    .from(devices)
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()
    .map((r) => ({ ...r.d, updateStatus: r.updateStatus }));

  return { rows, total, page, pageSize };
}

export type EventSource = 'manual' | 'csv-import' | 'create';

/** Append one device_events row per diff. No-op for an empty diff list. */
export function writeEvents(
  db: Db,
  deviceId: string,
  diffs: FieldDiff[],
  changedBy: string | null,
  source: EventSource,
): void {
  if (diffs.length === 0) return;
  const changedAt = Date.now();
  db.insert(deviceEvents)
    .values(
      diffs.map((d) => ({
        id: newId(),
        deviceId,
        field: d.field,
        oldValue: d.oldValue,
        newValue: d.newValue,
        changedBy,
        changedAt,
        source,
      })),
    )
    .run();
}

/** Change history for a device, newest-first. */
export function getDeviceEvents(db: Db, deviceId: string) {
  return db
    .select()
    .from(deviceEvents)
    .where(eq(deviceEvents.deviceId, deviceId))
    .orderBy(desc(deviceEvents.changedAt))
    .all();
}
