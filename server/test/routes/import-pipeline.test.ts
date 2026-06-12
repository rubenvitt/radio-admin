import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import { autoMapHeaders } from '@ra/shared';
import { makeTestDb } from '../../src/db/test-utils';
import { buildTestApp, authCookie, adminUser } from '../helpers';
import { createDevice } from '../../src/repos/deviceRepo';
import type { Db } from '../../src/repos/deviceRepo';

interface ParseBody {
  columns: string[];
  rows: string[][];
  detected: { delimiter: string; encoding: string };
}

function multipart(buf: Buffer): FormData {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'text/csv' }), 'export.csv');
  return fd;
}

function seed(db: Db) {
  createDevice(db, { issi: '1001', softwareVersion: 'FW 12.2' }, 'seed');
}

describe('CSV import pipeline (parse -> autoMap -> commit dryRun)', () => {
  it('parses a real cp1252 ;-CSV, auto-maps headers, and dryRun-classifies via the API', async () => {
    const { db } = makeTestDb();
    seed(db);
    const app = buildTestApp(db);
    const csv =
      'ISSI;Rufname;Softwareversion;Standort\n' +
      '1001;Gerät 1;FW 12.3;Köln\n' +
      '2002;Gerät 2;FW 12.3;Düsseldorf\n';
    const buf = iconv.encode(csv, 'win1252');

    const parseRes = await app.request('/api/import/parse', {
      method: 'POST',
      headers: { Cookie: await authCookie(adminUser) },
      body: multipart(buf),
    });
    expect(parseRes.status).toBe(200);
    const parsed = (await parseRes.json()) as ParseBody;
    expect(parsed.detected.delimiter).toBe(';');
    expect(parsed.columns).toEqual(['ISSI', 'Rufname', 'Softwareversion', 'Standort']);

    // Build a field -> index mapping from the auto-mapped header names.
    const byName = autoMapHeaders(parsed.columns); // { ISSI:'issi', ... }
    const mapping: Record<string, number> = {};
    parsed.columns.forEach((col, i) => {
      const field = byName[col];
      if (field) mapping[field] = i;
    });
    expect(Object.keys(mapping)).toContain('issi');

    const commitRes = await app.request('/api/import/commit', {
      method: 'POST',
      headers: { Cookie: await authCookie(adminUser), 'content-type': 'application/json' },
      body: JSON.stringify({ dryRun: true, mapping, rows: parsed.rows }),
    });
    expect(commitRes.status).toBe(200);
    const summary = ((await commitRes.json()) as { summary: Record<string, number> }).summary;
    expect(summary).toEqual({
      created: 1,
      updated: 1,
      unchanged: 0,
      error: 0,
      'skipped-no-permission': 0,
    });
  });
});
