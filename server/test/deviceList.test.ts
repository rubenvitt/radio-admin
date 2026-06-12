import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice, listDevices } from '../src/repos/deviceRepo';
import { insertSoftwareVersionIfNew } from '../src/repos/softwareVersionRepo';
import type { Db } from '../src/repos/deviceRepo';

function seed(db: Db) {
  insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
  insertSoftwareVersionIfNew(db, 'FW 2.0', null, 2000);
  createDevice(
    db,
    {
      issi: '100',
      rufname: 'Alpha',
      status: 'einsatzbereit',
      location: 'Wache',
      softwareVersion: 'FW 2.0',
    },
    null,
  );
  createDevice(
    db,
    {
      issi: '200',
      rufname: 'Bravo',
      status: 'in Reparatur',
      location: 'Werkstatt',
      softwareVersion: 'FW 1.0',
    },
    null,
  );
  createDevice(db, { issi: '300', rufname: 'Charlie', status: 'einsatzbereit', location: 'Wache' }, null); // no swVersion
}

describe('listDevices', () => {
  it('attaches computed updateStatus (aktuell/veraltet/unbekannt)', () => {
    const { db } = makeTestDb();
    seed(db);
    const { rows } = listDevices(db, {});
    const byIssi = Object.fromEntries(rows.map((r) => [r.issi, r.updateStatus]));
    expect(byIssi['100']).toBe('aktuell'); // FW 2.0 == reference
    expect(byIssi['200']).toBe('veraltet'); // FW 1.0
    expect(byIssi['300']).toBe('unbekannt'); // null
  });

  it('filters by q across rufname/issi', () => {
    const { db } = makeTestDb();
    seed(db);
    expect(listDevices(db, { q: 'Brav' }).rows.map((r) => r.issi)).toEqual(['200']);
    expect(listDevices(db, { q: '300' }).rows.map((r) => r.issi)).toEqual(['300']);
  });

  it('filters by status, location and updateStatus', () => {
    const { db } = makeTestDb();
    seed(db);
    expect(listDevices(db, { status: 'einsatzbereit' }).total).toBe(2);
    expect(listDevices(db, { location: 'Werkstatt' }).rows.map((r) => r.issi)).toEqual(['200']);
    expect(listDevices(db, { updateStatus: 'veraltet' }).rows.map((r) => r.issi)).toEqual(['200']);
    expect(listDevices(db, { updateStatus: 'unbekannt' }).rows.map((r) => r.issi)).toEqual(['300']);
  });

  it('sorts and paginates with a correct total', () => {
    const { db } = makeTestDb();
    seed(db);
    const page = listDevices(db, { sort: 'rufname:desc', page: 1, pageSize: 2 });
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => r.rufname)).toEqual(['Charlie', 'Bravo']);
    const page2 = listDevices(db, { sort: 'rufname:desc', page: 2, pageSize: 2 });
    expect(page2.rows.map((r) => r.rufname)).toEqual(['Alpha']);
  });

  it('sorts by softwareVersion (the "Letztes Update" column)', () => {
    const { db } = makeTestDb();
    seed(db);
    // desc: FW 2.0 (Alpha) > FW 1.0 (Bravo) > NULL (Charlie) last.
    const rows = listDevices(db, { sort: 'softwareVersion:desc' }).rows;
    expect(rows.map((r) => r.rufname)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });
});
