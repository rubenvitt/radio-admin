import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser, updaterUser } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';
import { insertSoftwareVersionIfNew, listSoftwareVersions } from '../src/repos/softwareVersionRepo';
import type { Db } from '../src/repos/deviceRepo';

interface VersionRow {
  id: string;
  value: string;
  createdAt: number;
  sortOrder: number;
  isTarget: boolean;
  deviceCount: number;
}

function idOf(db: Db, value: string): string {
  const row = listSoftwareVersions(db).find((v) => v.value === value);
  if (!row) throw new Error(`version ${value} not found`);
  return row.id;
}

describe('GET /api/software-versions', () => {
  it('lists newest-first with device usage; reference reflects the explicit target only', async () => {
    const { db } = makeTestDb();
    insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
    insertSoftwareVersionIfNew(db, 'FW 2.0', null, 2000);
    insertSoftwareVersionIfNew(db, 'FW 9.9', null, 9000); // newest-created
    createDevice(db, { issi: '1', softwareVersion: 'FW 2.0' }, null);
    const cookie = await authCookie(adminUser);
    const app = buildTestApp(db);

    // No target set yet → nothing is the reference, even the assigned newest.
    let list = (await (await app.request('/api/software-versions', { headers: { Cookie: cookie } })).json()) as VersionRow[];
    expect(list.map((v) => v.value)).toEqual(['FW 9.9', 'FW 2.0', 'FW 1.0']); // newest-first
    expect(list.filter((v) => v.isTarget)).toHaveLength(0);
    expect(list.find((v) => v.value === 'FW 2.0')?.deviceCount).toBe(1);

    // Admin explicitly targets FW 2.0.
    const setRes = await app.request(`/api/software-versions/${idOf(db, 'FW 2.0')}/target`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(setRes.status).toBe(204);

    list = (await (await app.request('/api/software-versions', { headers: { Cookie: cookie } })).json()) as VersionRow[];
    const ref = list.filter((v) => v.isTarget);
    expect(ref).toHaveLength(1);
    expect(ref[0]?.value).toBe('FW 2.0');
  });
});

describe('software-version mutations', () => {
  it('creates a version (admin) but never as the target; 409 on duplicate', async () => {
    const { db } = makeTestDb();
    const cookie = await authCookie(adminUser);
    const app = buildTestApp(db);

    const res = await app.request('/api/software-versions', {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'FW 3.0' }),
    });
    expect(res.status).toBe(201);
    expect(listSoftwareVersions(db).find((v) => v.value === 'FW 3.0')?.isTarget).toBe(false);

    const dup = await app.request('/api/software-versions', {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'FW 3.0' }),
    });
    expect(dup.status).toBe(409);
  });

  it('blocks deleting a version assigned to devices (409) but deletes phantoms (204)', async () => {
    const { db } = makeTestDb();
    insertSoftwareVersionIfNew(db, 'FW used', null, 1000);
    insertSoftwareVersionIfNew(db, 'FW phantom', null, 2000);
    createDevice(db, { issi: '1', softwareVersion: 'FW used' }, null);
    const cookie = await authCookie(adminUser);
    const app = buildTestApp(db);

    const blocked = await app.request(`/api/software-versions/${idOf(db, 'FW used')}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { deviceCount: number }).deviceCount).toBe(1);

    const ok = await app.request(`/api/software-versions/${idOf(db, 'FW phantom')}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(ok.status).toBe(204);
    expect(listSoftwareVersions(db).find((v) => v.value === 'FW phantom')).toBeUndefined();
  });

  it('reorders versions (admin)', async () => {
    const { db } = makeTestDb();
    insertSoftwareVersionIfNew(db, 'A', null, 1000);
    insertSoftwareVersionIfNew(db, 'B', null, 2000);
    insertSoftwareVersionIfNew(db, 'C', null, 3000);
    const cookie = await authCookie(adminUser);
    const app = buildTestApp(db);

    const ids = ['A', 'B', 'C'].map((v) => idOf(db, v));
    const res = await app.request('/api/software-versions/order', {
      method: 'PATCH',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    expect(res.status).toBe(204);
    expect(listSoftwareVersions(db).map((v) => v.value)).toEqual(['A', 'B', 'C']);
  });

  it('forbids non-admins from mutating (403)', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const cookie = await authCookie(updaterUser);
    const res = await app.request('/api/software-versions', {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'FW X' }),
    });
    expect(res.status).toBe(403);
  });
});
