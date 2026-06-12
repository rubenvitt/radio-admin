import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';
import { insertSoftwareVersionIfNew } from '../src/repos/softwareVersionRepo';

interface VersionRow {
  value: string;
  createdAt: number;
  reference: boolean;
}

describe('GET /api/software-versions', () => {
  it('lists newest-first and marks only the assigned newest as reference', async () => {
    const { db } = makeTestDb();
    insertSoftwareVersionIfNew(db, 'FW 1.0', null, 1000);
    insertSoftwareVersionIfNew(db, 'FW 2.0', null, 2000); // assigned -> reference
    insertSoftwareVersionIfNew(db, 'FW 9.9', null, 9000); // phantom, never assigned
    createDevice(db, { issi: '1', softwareVersion: 'FW 2.0' }, null);
    const app = buildTestApp(db);
    const res = await app.request('/api/software-versions', {
      headers: { Cookie: await authCookie(adminUser) },
    });
    expect(res.status).toBe(200);
    const list = (await res.json()) as VersionRow[];
    expect(list.map((v) => v.value)).toEqual(['FW 9.9', 'FW 2.0', 'FW 1.0']); // newest-first
    const ref = list.filter((v) => v.reference);
    expect(ref.length).toBe(1);
    expect(ref[0]?.value).toBe('FW 2.0'); // phantom FW 9.9 NOT marked
  });
});
