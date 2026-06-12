import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice, getDeviceById, deleteDevice, updateDevice } from '../src/repos/deviceRepo';

describe('deviceRepo basic CRUD', () => {
  it('creates, reads and deletes a device', () => {
    const { db } = makeTestDb();
    const created = createDevice(db, { issi: '1001', rufname: 'Florian 1' }, 'u-admin');
    expect(created.id).toBeTruthy();
    expect(created.issi).toBe('1001');
    expect(created.createdBy).toBe('u-admin');
    expect(typeof created.createdAt).toBe('number');

    const fetched = getDeviceById(db, created.id);
    expect(fetched?.rufname).toBe('Florian 1');

    const ok = deleteDevice(db, created.id);
    expect(ok).toBe(true);
    expect(getDeviceById(db, created.id)).toBeUndefined();
  });

  it('round-trips the new master-data fields (incl. deviceModes + alamosIntegrated)', () => {
    const { db } = makeTestDb();
    const created = createDevice(
      db,
      {
        issi: '2002',
        hiorgId: 'H-7',
        opta: 'DRK BW 01/83/01',
        hersteller: 'Motorola',
        deviceModes: 'TMO,DMO',
        alamosIntegrated: true,
      },
      'u-admin',
    );
    expect(created.hiorgId).toBe('H-7');
    expect(created.opta).toBe('DRK BW 01/83/01');
    expect(created.hersteller).toBe('Motorola');
    expect(created.deviceModes).toBe('TMO,DMO');
    expect(created.alamosIntegrated).toBe(true);

    const fetched = getDeviceById(db, created.id);
    expect(fetched?.hiorgId).toBe('H-7');
    expect(fetched?.deviceModes).toBe('TMO,DMO');
    expect(fetched?.alamosIntegrated).toBe(true);
  });

  it('persists alamosIntegrated false (not coerced to null) and can update it to true', () => {
    const { db } = makeTestDb();
    const created = createDevice(db, { issi: '2003', alamosIntegrated: false }, null);
    expect(created.alamosIntegrated).toBe(false);
    const fetched = getDeviceById(db, created.id);
    expect(fetched?.alamosIntegrated).toBe(false);

    const updated = updateDevice(db, created.id, { alamosIntegrated: true }, null);
    expect(updated?.alamosIntegrated).toBe(true);
  });
});
