import { desc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from './deviceRepo';
import { newId } from '../db/id';
import { devices, softwareVersions } from '../db/schema';

/** A registered software version row enriched with usage + target info. */
export interface SoftwareVersionListItem {
  id: string;
  value: string;
  createdAt: number;
  sortOrder: number;
  /** True for the explicit target version (the value that makes a device 'aktuell'). */
  isTarget: boolean;
  /** Number of devices currently carrying this version string. */
  deviceCount: number;
}

/** Next display order = one above the current maximum (newly seen → top of list). */
function nextSortOrder(db: Db): number {
  const row = db
    .select({ max: sql<number | null>`MAX(${softwareVersions.sortOrder})` })
    .from(softwareVersions)
    .get();
  return (row?.max ?? 0) + 1;
}

/**
 * Insert a software version by value; no-op if the value already exists (unique
 * constraint). Auto-registered versions land on top of the display order but are
 * never the target — only an explicit `setTargetVersion` makes one current.
 */
export function insertSoftwareVersionIfNew(
  db: Db,
  value: string,
  userId: string | null,
  createdAt: number = Date.now(),
): void {
  db.insert(softwareVersions)
    .values({ id: newId(), value, createdAt, createdBy: userId, sortOrder: nextSortOrder(db) })
    .onConflictDoNothing({ target: softwareVersions.value })
    .run();
}

/**
 * Explicitly create a version (admin action). Returns the new row, or null when
 * the value already exists. Like auto-registration, it is never the target.
 */
export function createSoftwareVersion(
  db: Db,
  value: string,
  userId: string | null,
): { id: string; value: string } | null {
  const row = { id: newId(), value, createdAt: Date.now(), createdBy: userId, sortOrder: nextSortOrder(db) };
  const res = db
    .insert(softwareVersions)
    .values(row)
    .onConflictDoNothing({ target: softwareVersions.value })
    .run();
  return res.changes > 0 ? { id: row.id, value: row.value } : null;
}

/** Target version = the value explicitly flagged `isTarget`, or null. Feeds `computeUpdateStatus`. */
export function getTargetVersion(db: Db): string | null {
  const row = db
    .select({ value: softwareVersions.value })
    .from(softwareVersions)
    .where(eq(softwareVersions.isTarget, true))
    .limit(1)
    .get();
  return row?.value ?? null;
}

/**
 * Make `id` the single target version (clearing it from all others). Returns
 * false if `id` is unknown.
 */
export function setTargetVersion(db: Db, id: string): boolean {
  return db.transaction(() => {
    // Set first: changes === 0 means the id is unknown, so we bail without
    // having cleared anything (no pre-flight existence SELECT needed).
    const res = db
      .update(softwareVersions)
      .set({ isTarget: true })
      .where(eq(softwareVersions.id, id))
      .run();
    if (res.changes === 0) return false;
    db.update(softwareVersions).set({ isTarget: false }).where(ne(softwareVersions.id, id)).run();
    return true;
  });
}

export type DeleteVersionResult =
  | { ok: true }
  | { ok: false; reason: 'in_use'; deviceCount: number }
  | { ok: false; reason: 'not_found' };

/**
 * Delete a version. Blocked (reason 'in_use') while any device still carries the
 * value — the admin must reassign those devices first, so deletion can never
 * orphan a device's version string.
 */
export function deleteSoftwareVersion(db: Db, id: string): DeleteVersionResult {
  const row = db
    .select({ value: softwareVersions.value })
    .from(softwareVersions)
    .where(eq(softwareVersions.id, id))
    .get();
  if (!row) return { ok: false, reason: 'not_found' };

  const used = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(devices)
    .where(eq(devices.softwareVersion, row.value))
    .get();
  const deviceCount = used?.n ?? 0;
  if (deviceCount > 0) return { ok: false, reason: 'in_use', deviceCount };

  db.delete(softwareVersions).where(eq(softwareVersions.id, id)).run();
  return { ok: true };
}

/**
 * Apply a manual display order. `ids` is the desired top-to-bottom order; the
 * first id gets the highest `sortOrder`. Unknown ids are ignored; the target
 * flag is untouched.
 */
export function reorderSoftwareVersions(db: Db, ids: string[]): void {
  db.transaction(() => {
    ids.forEach((id, index) => {
      db.update(softwareVersions)
        .set({ sortOrder: ids.length - index })
        .where(eq(softwareVersions.id, id))
        .run();
    });
  });
}

/** List all versions, newest (highest sortOrder) first, with target + usage info. */
export function listSoftwareVersions(db: Db): SoftwareVersionListItem[] {
  return db
    .select({
      id: softwareVersions.id,
      value: softwareVersions.value,
      createdAt: softwareVersions.createdAt,
      sortOrder: softwareVersions.sortOrder,
      isTarget: softwareVersions.isTarget,
      deviceCount: sql<number>`(SELECT COUNT(*) FROM ${devices} WHERE ${devices.softwareVersion} = ${softwareVersions.value})`,
    })
    .from(softwareVersions)
    .orderBy(desc(softwareVersions.sortOrder), desc(softwareVersions.createdAt))
    .all();
}
