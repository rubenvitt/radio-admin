import { desc, eq, exists } from 'drizzle-orm';
import type { Db } from './deviceRepo';
import { newId } from '../db/id';
import { devices, softwareVersions } from '../db/schema';

/** Insert a software version by value; no-op if the value already exists (unique constraint). */
export function insertSoftwareVersionIfNew(
  db: Db,
  value: string,
  userId: string | null,
  createdAt: number = Date.now(),
): void {
  db.insert(softwareVersions)
    .values({ id: newId(), value, createdAt, createdBy: userId })
    .onConflictDoNothing({ target: softwareVersions.value })
    .run();
}

/**
 * Reference/target version = newest (max createdAt) software version that is
 * currently assigned to at least one device. Unassigned phantom versions are ignored.
 */
export function getReferenceVersion(db: Db): string | null {
  const row = db
    .select({ value: softwareVersions.value })
    .from(softwareVersions)
    .where(
      exists(
        db
          .select({ one: devices.id })
          .from(devices)
          .where(eq(devices.softwareVersion, softwareVersions.value)),
      ),
    )
    .orderBy(desc(softwareVersions.createdAt))
    .limit(1)
    .get();
  return row?.value ?? null;
}

/** List all versions, newest first, with a `reference` flag on the computed reference version. */
export function listSoftwareVersions(
  db: Db,
): { value: string; createdAt: number; reference: boolean }[] {
  const ref = getReferenceVersion(db);
  const rows = db
    .select({ value: softwareVersions.value, createdAt: softwareVersions.createdAt })
    .from(softwareVersions)
    .orderBy(desc(softwareVersions.createdAt))
    .all();
  return rows.map((r) => ({ ...r, reference: r.value === ref }));
}
