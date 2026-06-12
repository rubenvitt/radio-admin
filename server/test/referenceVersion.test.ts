import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice } from '../src/repos/deviceRepo';
import {
  insertSoftwareVersionIfNew,
  getReferenceVersion,
} from '../src/repos/softwareVersionRepo';

describe('getReferenceVersion', () => {
  it('returns null when no versions assigned', () => {
    const { db } = makeTestDb();
    insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
    expect(getReferenceVersion(db)).toBeNull();
  });

  it('returns newest version that is assigned to at least one device, ignoring unassigned phantom versions', () => {
    const { db } = makeTestDb();
    // older version, assigned
    insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
    createDevice(db, { issi: '1', softwareVersion: 'FW 1.0' }, null);
    // newer version, NEVER assigned (phantom: typo/unassign) -> must be ignored
    insertSoftwareVersionIfNew(db, 'FW 9.9', null, 5000);
    expect(getReferenceVersion(db)).toBe('FW 1.0');

    // assign an even newer-but-after-phantom version -> it becomes reference
    insertSoftwareVersionIfNew(db, 'FW 2.0', null, 3000);
    createDevice(db, { issi: '2', softwareVersion: 'FW 2.0' }, null);
    expect(getReferenceVersion(db)).toBe('FW 2.0');
  });
});
