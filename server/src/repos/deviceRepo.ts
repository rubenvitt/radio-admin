import { eq } from 'drizzle-orm';
import type { DbHandle } from '../db/index';
import { newId } from '../db/id';
import { devices } from '../db/schema';
import type { DeviceRecord, DeviceCreate } from '@ra/shared';

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
