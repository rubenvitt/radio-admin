import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice, listDevices, updateDevice } from '../src/repos/deviceRepo';

function seed(db: ReturnType<typeof makeTestDb>['db']) {
  createDevice(db, { issi: '1', deviceType: 'MRT', hersteller: 'Motorola', funktion: 'Zugführer', status: 'Einsatzbereit', deviceModes: 'TMO,DMO', loanable: true, alamosIntegrated: true }, null);
  createDevice(db, { issi: '2', deviceType: 'HRT', hersteller: 'Sepura', funktion: 'Sanitäter', status: 'Wartung', deviceModes: 'TMO', loanable: false, alamosIntegrated: false }, null);
  const d3 = createDevice(db, { issi: '3', deviceType: 'MRT', hersteller: 'Motorola', status: 'Defekt' }, null);
  updateDevice(db, d3.id, { updateNote: '[2026-06-14 · A] Abweichung' }, null);
}

describe('listDevices filters', () => {
  it('filters by multi-value deviceType (IN) via CSV', () => {
    const { db } = makeTestDb(); seed(db);
    expect(listDevices(db, { deviceType: 'MRT' }).total).toBe(2);
    expect(listDevices(db, { deviceType: 'MRT,HRT' }).total).toBe(3);
  });
  it('filters by funktion, hersteller, status (multi)', () => {
    const { db } = makeTestDb(); seed(db);
    expect(listDevices(db, { funktion: 'Zugführer' }).rows.map((r) => r.issi)).toEqual(['1']);
    expect(listDevices(db, { hersteller: 'Motorola' }).total).toBe(2);
    expect(listDevices(db, { status: 'Wartung,Defekt' }).total).toBe(2);
  });
  it('filters by deviceModes token (AND across tokens)', () => {
    const { db } = makeTestDb(); seed(db);
    expect(listDevices(db, { deviceModes: 'DMO' }).rows.map((r) => r.issi)).toEqual(['1']);
    expect(listDevices(db, { deviceModes: 'TMO' }).total).toBe(2);
    expect(listDevices(db, { deviceModes: 'TMO,DMO' }).rows.map((r) => r.issi)).toEqual(['1']);
  });
  it('filters by loanable / alamosIntegrated / hasUpdateNote booleans', () => {
    const { db } = makeTestDb(); seed(db);
    expect(listDevices(db, { loanable: true }).rows.map((r) => r.issi)).toEqual(['1']);
    expect(listDevices(db, { alamosIntegrated: true }).rows.map((r) => r.issi)).toEqual(['1']);
    expect(listDevices(db, { hasUpdateNote: true }).rows.map((r) => r.issi)).toEqual(['3']);
  });
});
