import { describe, it, expect } from 'vitest';
import { classifyImportRow } from './classify-import-row';
import type { DeviceRecord } from '../schemas';

const existing: DeviceRecord = {
  id: 'dev_1',
  rufname: 'Florian 1',
  issi: '1001',
  serialNumber: 'SN-1',
  deviceType: 'MTP850',
  status: 'einsatzbereit',
  location: 'Wache',
  assignedTo: 'Zugführer',
  softwareVersion: 'FW 12.2',
  lastUpdatedAt: 1700000000000,
  notes: null,
  hiorgId: null,
  opta: null,
  funktion: null,
  hersteller: null,
  bedieneinheit: null,
  deviceModes: null,
  alamosIntegrated: null,
  createdAt: 1690000000000,
  updatedAt: 1690000000000,
  createdBy: 'seed',
  updatedBy: 'seed',
};

describe('classifyImportRow', () => {
  it('errors on empty ISSI (admin)', () => {
    const r = classifyImportRow({ incoming: { issi: '' }, existing: null, role: 'admin' });
    expect(r.class).toBe('error');
    expect(r.error).toMatch(/issi/i);
    expect(r.changes).toEqual([]);
  });

  it('errors on whitespace-only ISSI', () => {
    const r = classifyImportRow({ incoming: { issi: '   ' }, existing: null, role: 'admin' });
    expect(r.class).toBe('error');
  });

  it('classifies unknown ISSI as created for admin, with all incoming fields as changes from null', () => {
    const r = classifyImportRow({
      incoming: { issi: '2002', rufname: 'Florian 2', softwareVersion: 'FW 12.3' },
      existing: null,
      role: 'admin',
    });
    expect(r.class).toBe('created');
    expect(r.error).toBeUndefined();
    expect(r.changes).toEqual(
      expect.arrayContaining([
        { field: 'rufname', oldValue: null, newValue: 'Florian 2' },
        { field: 'softwareVersion', oldValue: null, newValue: 'FW 12.3' },
      ]),
    );
  });

  it('classifies unknown ISSI as skipped-no-permission for updater (no creation)', () => {
    const r = classifyImportRow({
      incoming: { issi: '2002', rufname: 'Florian 2', softwareVersion: 'FW 12.3' },
      existing: null,
      role: 'updater',
    });
    expect(r.class).toBe('skipped-no-permission');
    expect(r.changes).toEqual([]);
  });

  it('classifies a matched row with changed allowed field as updated (admin)', () => {
    const r = classifyImportRow({
      incoming: { issi: '1001', softwareVersion: 'FW 12.3' },
      existing,
      role: 'admin',
    });
    expect(r.class).toBe('updated');
    expect(r.changes).toEqual([
      { field: 'softwareVersion', oldValue: 'FW 12.2', newValue: 'FW 12.3' },
    ]);
  });

  it('classifies a matched row with no effective change as unchanged', () => {
    const r = classifyImportRow({
      incoming: { issi: '1001', softwareVersion: 'FW 12.2' },
      existing,
      role: 'admin',
    });
    expect(r.class).toBe('unchanged');
    expect(r.changes).toEqual([]);
  });

  it('for updater on a matched row, only allowlisted fields are considered (status/swVersion/lastUpdatedAt)', () => {
    const r = classifyImportRow({
      incoming: { issi: '1001', softwareVersion: 'FW 12.3', location: 'Werkstatt', rufname: 'X' },
      existing,
      role: 'updater',
    });
    expect(r.class).toBe('updated');
    expect(r.changes).toEqual([
      { field: 'softwareVersion', oldValue: 'FW 12.2', newValue: 'FW 12.3' },
    ]);
  });

  it('for updater on a matched row where only locked fields differ, result is unchanged', () => {
    const r = classifyImportRow({
      incoming: { issi: '1001', location: 'Werkstatt', rufname: 'X' },
      existing,
      role: 'updater',
    });
    expect(r.class).toBe('unchanged');
    expect(r.changes).toEqual([]);
  });

  it('does not include issi itself as a change even when existing differs (issi is the match key)', () => {
    const r = classifyImportRow({
      incoming: { issi: '1001' },
      existing,
      role: 'admin',
    });
    expect(r.class).toBe('unchanged');
    expect(r.changes.find((c) => c.field === 'issi')).toBeUndefined();
  });
});
