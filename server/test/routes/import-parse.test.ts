import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import { makeTestDb } from '../../src/db/test-utils';
import { buildTestApp, authCookie, updaterUser } from '../helpers';

function multipart(buf: Buffer, filename = 'geraete.csv'): FormData {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'text/csv' }), filename);
  return fd;
}

describe('POST /api/import/parse', () => {
  it('returns 401 when unauthenticated', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request('/api/import/parse', {
      method: 'POST',
      body: multipart(Buffer.from('a;b\n1;2\n')),
    });
    expect(res.status).toBe(401);
  });

  it('parses a cp1252 semicolon CSV and reports detected delimiter + encoding', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const csv = 'ISSI;Rufname;Standort\n1001;Gerät 1;Köln\n1002;Gerät 2;Düsseldorf\n';
    const buf = iconv.encode(csv, 'win1252');
    const res = await app.request('/api/import/parse', {
      method: 'POST',
      headers: { Cookie: await authCookie(updaterUser) },
      body: multipart(buf),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      columns: string[];
      rows: string[][];
      detected: { delimiter: string; encoding: string };
    };
    expect(body.columns).toEqual(['ISSI', 'Rufname', 'Standort']);
    expect(body.rows).toEqual([
      ['1001', 'Gerät 1', 'Köln'],
      ['1002', 'Gerät 2', 'Düsseldorf'],
    ]);
    expect(body.detected.delimiter).toBe(';');
    expect(String(body.detected.encoding).toLowerCase()).toMatch(/1252|8859|latin/);
  });

  it('returns 400 when no file part is present', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const fd = new FormData();
    const res = await app.request('/api/import/parse', {
      method: 'POST',
      headers: { Cookie: await authCookie(updaterUser) },
      body: fd,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an empty file', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    const res = await app.request('/api/import/parse', {
      method: 'POST',
      headers: { Cookie: await authCookie(updaterUser) },
      body: multipart(Buffer.alloc(0)),
    });
    expect(res.status).toBe(400);
  });
});
