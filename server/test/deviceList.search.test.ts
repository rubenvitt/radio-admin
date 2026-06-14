import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice, listDevices } from '../src/repos/deviceRepo';

function seed(db: ReturnType<typeof makeTestDb>['db']) {
  createDevice(db, { issi: '100', rufname: 'Alpha', funktion: 'Zugführer', opta: 'X-1' }, null);
  createDevice(db, { issi: '200', rufname: 'Bravo', funktion: 'Sanitäter', opta: 'Y-2' }, null);
}

describe('listDevices configurable search', () => {
  it('default search hits opta and funktion (not just the legacy 4 columns)', () => {
    const { db } = makeTestDb();
    seed(db);
    expect(listDevices(db, { q: 'Zugführer' }).rows.map((r) => r.issi)).toEqual(['100']);
    expect(listDevices(db, { q: 'Y-2' }).rows.map((r) => r.issi)).toEqual(['200']);
  });

  it('searchFields restricts the searched columns', () => {
    const { db } = makeTestDb();
    seed(db);
    // funktion excluded -> 'Zugführer' matches nothing
    expect(listDevices(db, { q: 'Zugführer', searchFields: 'rufname,issi' }).total).toBe(0);
    expect(listDevices(db, { q: 'Alpha', searchFields: 'rufname,issi' }).rows.map((r) => r.issi)).toEqual(['100']);
  });

  it('ignores unknown / non-whitelisted field names (never interpolated)', () => {
    const { db } = makeTestDb();
    seed(db);
    // bogus field is dropped; falls back to nothing-searched -> no crash, empty filter
    expect(() => listDevices(db, { q: 'Alpha', searchFields: 'evil; DROP TABLE devices' })).not.toThrow();
    expect(listDevices(db, { q: 'Alpha', searchFields: 'evil; DROP TABLE devices' }).total).toBe(0);
  });
});
