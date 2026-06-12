import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice, getDeviceById, deleteDevice } from '../src/repos/deviceRepo';

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
});
