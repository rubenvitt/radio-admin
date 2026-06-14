import { describe, it, expect } from 'vitest';
import { diffDevice } from './diff-device';
import type { DeviceRecord } from './schemas';

function makeDevice(overrides: Partial<DeviceRecord> = {}): DeviceRecord {
  return {
    id: 'dev-1',
    rufname: null,
    issi: '1000',
    serialNumber: null,
    deviceType: null,
    status: null,
    location: null,
    assignedTo: null,
    softwareVersion: null,
    lastUpdatedAt: null,
    notes: null,
    hiorgId: null,
    opta: null,
    funktion: null,
    hersteller: null,
    bedieneinheit: null,
    deviceModes: null,
    alamosIntegrated: null,
    loanable: null,
    updateNote: null,
    createdAt: 1,
    updatedAt: 1,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

describe('diffDevice', () => {
  it('emits a diff for a changed string field (string -> string)', () => {
    const existing = makeDevice({ status: 'einsatzbereit' });
    const diffs = diffDevice(existing, { status: 'in Reparatur' });
    expect(diffs).toEqual([
      { field: 'status', oldValue: 'einsatzbereit', newValue: 'in Reparatur' },
    ]);
  });

  it('emits a diff with null old value when the field was null (null -> string)', () => {
    const existing = makeDevice({ status: null });
    const diffs = diffDevice(existing, { status: 'in Reparatur' });
    expect(diffs).toEqual([{ field: 'status', oldValue: null, newValue: 'in Reparatur' }]);
  });

  it('omits unchanged fields (same value -> no diff)', () => {
    const existing = makeDevice({ status: 'einsatzbereit', rufname: 'Alpha' });
    const diffs = diffDevice(existing, { status: 'einsatzbereit' });
    expect(diffs).toEqual([]);
  });

  it('ignores fields absent from the patch', () => {
    const existing = makeDevice({ status: 'einsatzbereit', rufname: 'Alpha' });
    const diffs = diffDevice(existing, {});
    expect(diffs).toEqual([]);
  });

  it('stringifies a changed number field (lastUpdatedAt)', () => {
    const existing = makeDevice({ lastUpdatedAt: 1000 });
    const diffs = diffDevice(existing, { lastUpdatedAt: 2000 });
    expect(diffs).toEqual([{ field: 'lastUpdatedAt', oldValue: '1000', newValue: '2000' }]);
  });

  it('emits multiple diffs and only for changed fields', () => {
    const existing = makeDevice({ rufname: 'Alpha', status: 'einsatzbereit' });
    const diffs = diffDevice(existing, { rufname: 'Alpha-2', status: 'einsatzbereit' });
    expect(diffs).toEqual([{ field: 'rufname', oldValue: 'Alpha', newValue: 'Alpha-2' }]);
  });
});
