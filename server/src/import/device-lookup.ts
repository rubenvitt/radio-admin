import { inArray } from 'drizzle-orm';
import { devices } from '../db/schema';
import type { DeviceRecord } from '@ra/shared';
import type { Db } from '../repos/deviceRepo';

/** Loads all devices whose ISSI is in `issis`, keyed by ISSI. */
export function loadDevicesByIssi(db: Db, issis: string[]): Map<string, DeviceRecord> {
  const map = new Map<string, DeviceRecord>();
  if (issis.length === 0) return map;
  const unique = [...new Set(issis)];
  const found = db.select().from(devices).where(inArray(devices.issi, unique)).all() as DeviceRecord[];
  for (const d of found) map.set(d.issi, d);
  return map;
}
