import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { createDevice, getDeviceById, updateDevice } from '../src/repos/deviceRepo';

describe('updateNote column', () => {
  it('persists updateNote on create and update', () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '900', updateNote: '[2026-06-14 · A] erste Zeile' }, null);
    expect(getDeviceById(db, d.id)?.updateNote).toBe('[2026-06-14 · A] erste Zeile');

    updateDevice(db, d.id, { updateNote: '[2026-06-14 · A] erste Zeile\n[2026-06-14 · B] zweite' }, null);
    expect(getDeviceById(db, d.id)?.updateNote).toContain('zweite');
  });

  it('defaults updateNote to null when not provided', () => {
    const { db } = makeTestDb();
    const d = createDevice(db, { issi: '901' }, null);
    expect(getDeviceById(db, d.id)?.updateNote).toBeNull();
  });
});
