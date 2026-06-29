import { and, asc, count, desc, eq, inArray, isNotNull, like, ne, or, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { DbHandle } from '../db/index';
import { newId } from '../db/id';
import { devices, deviceEvents } from '../db/schema';
import { getTargetVersion } from './softwareVersionRepo';
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
    hiorgId: input.hiorgId ?? null,
    opta: input.opta ?? null,
    funktion: input.funktion ?? null,
    hersteller: input.hersteller ?? null,
    bedieneinheit: input.bedieneinheit ?? null,
    deviceModes: input.deviceModes ?? null,
    alamosIntegrated: input.alamosIntegrated ?? null,
    loanable: input.loanable ?? null,
    updateNote: input.updateNote ?? null,
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

/**
 * All devices flagged loanable (`loanable = true`), newest-first. Backs the
 * public loan API; callers project to a PUBLIC field subset before returning.
 */
export function listLoanableDevices(db: Db): DeviceRecord[] {
  return db
    .select()
    .from(devices)
    .where(eq(devices.loanable, true))
    .orderBy(desc(devices.createdAt))
    .all();
}

/** All devices, newest-first. Backs the full CSV export. */
export function listAllDevices(db: Db): DeviceRecord[] {
  return db.select().from(devices).orderBy(desc(devices.createdAt)).all();
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
  searchFields?: string;
  status?: string;
  location?: string;
  deviceType?: string; // CSV -> IN
  funktion?: string; // CSV -> IN
  hersteller?: string; // CSV -> IN
  deviceModes?: string; // CSV tokens -> AND of LIKE
  loanable?: boolean;
  alamosIntegrated?: boolean;
  hasUpdateNote?: boolean;
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
  softwareVersion: devices.softwareVersion,
  lastUpdatedAt: devices.lastUpdatedAt,
  createdAt: devices.createdAt,
};

/** Columns the free-text search may target. Field names map to columns here —
 *  NEVER interpolate a client-supplied name into SQL. */
const SEARCHABLE_FIELDS: Record<string, SQLiteColumn> = {
  rufname: devices.rufname,
  issi: devices.issi,
  serialNumber: devices.serialNumber,
  assignedTo: devices.assignedTo,
  opta: devices.opta,
  funktion: devices.funktion,
  deviceType: devices.deviceType,
  location: devices.location,
  hersteller: devices.hersteller,
  bedieneinheit: devices.bedieneinheit,
  hiorgId: devices.hiorgId,
};
const DEFAULT_SEARCH_FIELDS = ['rufname', 'issi', 'serialNumber', 'assignedTo', 'opta', 'funktion'];

/** Split a comma-separated query param into trimmed, non-empty tokens. */
function csv(v?: string): string[] {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export function listDevices(db: Db, params: ListParams): ListResult {
  const target = getTargetVersion(db); // string | null
  // SQL expression mirroring computeUpdateStatus(device, target):
  //   null swVersion -> 'unbekannt'; equals target -> 'aktuell'; else 'veraltet'.
  // When target is null the 'aktuell' branch can never match, so non-null
  // versions fall through to 'veraltet' — matching the shared fn exactly.
  const statusExpr = sql<UpdateStatus>`CASE
    WHEN ${devices.softwareVersion} IS NULL THEN 'unbekannt'
    WHEN ${target ?? null} IS NOT NULL AND ${devices.softwareVersion} = ${target ?? null} THEN 'aktuell'
    ELSE 'veraltet' END`;

  const conds: SQL[] = [];
  if (params.q) {
    const term = `%${params.q}%`;
    const requested = csv(params.searchFields);
    const fields = (requested.length ? requested : DEFAULT_SEARCH_FIELDS)
      .map((f) => SEARCHABLE_FIELDS[f])
      .filter((col): col is SQLiteColumn => col != null);
    if (fields.length) {
      const orExpr = or(...fields.map((col) => like(col, term)));
      if (orExpr) conds.push(orExpr);
    } else if (requested.length) {
      // All requested fields were non-whitelisted: return no rows (never
      // interpolate unknown names into SQL).
      conds.push(sql`0`);
    }
  }
  const inFilter = (col: SQLiteColumn, raw?: string) => {
    const values = csv(raw);
    if (values.length) conds.push(inArray(col, values));
  };
  inFilter(devices.status, params.status);
  inFilter(devices.location, params.location);
  inFilter(devices.deviceType, params.deviceType);
  inFilter(devices.funktion, params.funktion);
  inFilter(devices.hersteller, params.hersteller);
  for (const token of csv(params.deviceModes)) {
    conds.push(like(devices.deviceModes, `%${token}%`));
  }
  if (params.loanable) conds.push(eq(devices.loanable, true));
  if (params.alamosIntegrated) conds.push(eq(devices.alamosIntegrated, true));
  if (params.hasUpdateNote) conds.push(and(isNotNull(devices.updateNote), ne(devices.updateNote, '')) as SQL);
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

export type EventSource = 'manual' | 'csv-import' | 'create' | 'update-note';

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
