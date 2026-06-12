import { describe, it, expect } from 'vitest';
import { filterEditableFields, UPDATER_EDITABLE_FIELDS } from './editable-fields';

describe('UPDATER_EDITABLE_FIELDS', () => {
  it('is exactly the three update fields', () => {
    expect([...UPDATER_EDITABLE_FIELDS]).toEqual(['softwareVersion', 'lastUpdatedAt', 'status']);
  });
});

describe('filterEditableFields', () => {
  it('admin passthrough: keeps every field unchanged', () => {
    const patch = { issi: '123', rufname: 'Floxx', softwareVersion: 'FW 12.3', notes: 'hi' };
    expect(filterEditableFields('admin', patch)).toEqual(patch);
  });

  it('updater: keeps only allowlisted update fields', () => {
    const patch = {
      softwareVersion: 'FW 12.3',
      lastUpdatedAt: 1718200000000,
      status: 'einsatzbereit',
    };
    expect(filterEditableFields('updater', patch)).toEqual(patch);
  });

  it('updater: drops identity/master fields incl. the ISSI match-key', () => {
    const patch = {
      issi: '999',
      rufname: 'Hacked',
      serialNumber: 'SN-1',
      location: 'Wache 2',
      assignedTo: 'Team A',
      deviceType: 'TPH900',
      notes: 'nope',
      softwareVersion: 'FW 12.3',
      status: 'in Reparatur',
    };
    expect(filterEditableFields('updater', patch)).toEqual({
      softwareVersion: 'FW 12.3',
      status: 'in Reparatur',
    });
  });

  it('updater: returns a new object, does not mutate input', () => {
    const patch = { issi: '1', softwareVersion: 'FW 12.3' };
    const out = filterEditableFields('updater', patch);
    expect(out).not.toBe(patch);
    expect(patch.issi).toBe('1');
  });

  it('updater: empty patch -> empty object', () => {
    expect(filterEditableFields('updater', {})).toEqual({});
  });
});
