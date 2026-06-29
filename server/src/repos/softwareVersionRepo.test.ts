import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../db/test-utils';
import { devices } from '../db/schema';
import type { Db } from './deviceRepo';
import {
  insertSoftwareVersionIfNew,
  createSoftwareVersion,
  getTargetVersion,
  setTargetVersion,
  deleteSoftwareVersion,
  reorderSoftwareVersions,
  listSoftwareVersions,
} from './softwareVersionRepo';

function db() {
  return makeTestDb().db;
}

function seedDevice(d: Db, issi: string, version: string | null) {
  const now = Date.now();
  d.insert(devices).values({ issi, softwareVersion: version, createdAt: now, updatedAt: now }).run();
}

function byValue(d: Db, value: string) {
  const row = listSoftwareVersions(d).find((v) => v.value === value);
  if (!row) throw new Error(`version ${value} not found`);
  return row;
}

describe('insertSoftwareVersionIfNew', () => {
  it('registers a new version that is NOT the target and orders newest-first', () => {
    const d = db();
    insertSoftwareVersionIfNew(d, 'FW 1', null);
    insertSoftwareVersionIfNew(d, 'FW 2', null);

    const list = listSoftwareVersions(d);
    expect(list.map((v) => v.value)).toEqual(['FW 2', 'FW 1']); // later insert sorts higher
    expect(list.every((v) => v.isTarget === false)).toBe(true);
    expect(getTargetVersion(d)).toBeNull();
  });

  it('is a no-op for an existing value', () => {
    const d = db();
    insertSoftwareVersionIfNew(d, 'FW 1', null);
    insertSoftwareVersionIfNew(d, 'FW 1', 'someone');
    expect(listSoftwareVersions(d)).toHaveLength(1);
  });
});

describe('createSoftwareVersion', () => {
  it('creates an explicit version (not target) and returns it; null on duplicate', () => {
    const d = db();
    const created = createSoftwareVersion(d, 'FW 1', 'admin');
    expect(created?.value).toBe('FW 1');
    expect(byValue(d, 'FW 1').isTarget).toBe(false);
    expect(createSoftwareVersion(d, 'FW 1', 'admin')).toBeNull();
  });
});

describe('setTargetVersion / getTargetVersion', () => {
  it('marks exactly one version as the target and re-points cleanly', () => {
    const d = db();
    insertSoftwareVersionIfNew(d, 'A', null);
    insertSoftwareVersionIfNew(d, 'B', null);

    expect(setTargetVersion(d, byValue(d, 'B').id)).toBe(true);
    expect(getTargetVersion(d)).toBe('B');
    expect(listSoftwareVersions(d).filter((v) => v.isTarget)).toHaveLength(1);

    expect(setTargetVersion(d, byValue(d, 'A').id)).toBe(true);
    expect(getTargetVersion(d)).toBe('A');
    expect(listSoftwareVersions(d).filter((v) => v.isTarget)).toHaveLength(1);

    expect(setTargetVersion(d, 'does-not-exist')).toBe(false);
  });
});

describe('deleteSoftwareVersion', () => {
  it('blocks deletion of a version still assigned to devices, reporting the count', () => {
    const d = db();
    insertSoftwareVersionIfNew(d, 'A', null);
    seedDevice(d, '1', 'A');
    seedDevice(d, '2', 'A');

    expect(byValue(d, 'A').deviceCount).toBe(2);
    const res = deleteSoftwareVersion(d, byValue(d, 'A').id);
    expect(res).toEqual({ ok: false, reason: 'in_use', deviceCount: 2 });
    expect(listSoftwareVersions(d)).toHaveLength(1); // untouched
  });

  it('deletes an unassigned (phantom) version; 404 for unknown id', () => {
    const d = db();
    insertSoftwareVersionIfNew(d, 'phantom', null);
    expect(deleteSoftwareVersion(d, byValue(d, 'phantom').id)).toEqual({ ok: true });
    expect(listSoftwareVersions(d).find((v) => v.value === 'phantom')).toBeUndefined();
    expect(deleteSoftwareVersion(d, 'nope')).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('reorderSoftwareVersions', () => {
  it('puts the first id on top and leaves the target flag untouched', () => {
    const d = db();
    insertSoftwareVersionIfNew(d, 'A', null);
    insertSoftwareVersionIfNew(d, 'B', null);
    insertSoftwareVersionIfNew(d, 'C', null);
    setTargetVersion(d, byValue(d, 'B').id);

    const ids = ['A', 'B', 'C'].map((v) => byValue(d, v).id);
    reorderSoftwareVersions(d, ids);

    expect(listSoftwareVersions(d).map((v) => v.value)).toEqual(['A', 'B', 'C']);
    expect(getTargetVersion(d)).toBe('B'); // reorder must not move the target
  });
});
