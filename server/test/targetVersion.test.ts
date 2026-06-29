import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice } from '../src/repos/deviceRepo';
import {
  insertSoftwareVersionIfNew,
  getTargetVersion,
  setTargetVersion,
  listSoftwareVersions,
} from '../src/repos/softwareVersionRepo';
import type { Db } from '../src/repos/deviceRepo';

function idOf(db: Db, value: string): string {
  const row = listSoftwareVersions(db).find((v) => v.value === value);
  if (!row) throw new Error(`version ${value} not found`);
  return row.id;
}

describe('getTargetVersion', () => {
  it('returns null when no version is flagged as target, even if versions are assigned', () => {
    const { db } = makeTestDb();
    insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
    createDevice(db, { issi: '1', softwareVersion: 'FW 1.0' }, null);
    // Auto-registered versions are never the target — the admin must set it.
    expect(getTargetVersion(db)).toBeNull();
  });

  it('returns the explicitly flagged target, independent of creation time or assignment', () => {
    const { db } = makeTestDb();
    insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
    insertSoftwareVersionIfNew(db, 'FW 9.9', null, 5000); // newest-created, never assigned
    createDevice(db, { issi: '1', softwareVersion: 'FW 1.0' }, null);

    // The admin can target the OLDER version — newest-created no longer wins.
    setTargetVersion(db, idOf(db, 'FW 1.0'));
    expect(getTargetVersion(db)).toBe('FW 1.0');

    // Re-pointing to the (unassigned) newer version is allowed too.
    setTargetVersion(db, idOf(db, 'FW 9.9'));
    expect(getTargetVersion(db)).toBe('FW 9.9');
  });
});
