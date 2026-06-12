import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../src/db/test-utils';
import { buildTestApp, authCookie, adminUser, updaterUser } from './helpers';
import { createDevice } from '../src/repos/deviceRepo';
import { EXPORT_COLUMNS } from '../src/routes/export';
import { parseCsvText } from '../src/import/parse-csv';
import { autoMapHeaders, IMPORTABLE_FIELDS } from '@ra/shared';
import { classifyRows, type ColumnMapping } from '../src/import/commit-service';
import { loadDevicesByIssi } from '../src/import/device-lookup';

const BOM = '﻿';
const PATH = '/api/devices/export';

/** Seed devices that only use round-trippable values (true/null booleans, UTC-midnight dates). */
function seed(db: ReturnType<typeof makeTestDb>['db']) {
  createDevice(
    db,
    {
      issi: '1001',
      rufname: 'Florian Funk',
      serialNumber: 'SN-1',
      deviceType: 'MTP850',
      status: 'Einsatzbereit',
      location: 'Lager 3',
      assignedTo: 'Zugführer',
      softwareVersion: 'FW 12.2',
      lastUpdatedAt: Date.UTC(2024, 0, 15), // UTC midnight -> survives YYYY-MM-DD
      notes: 'Hat ; Semikolon und "Quote"', // forces CSV quoting
      hiorgId: 'H-42',
      opta: 'DRK BW 01/83/01',
      funktion: 'GRTW',
      hersteller: 'Motorola',
      bedieneinheit: 'TPH900',
      deviceModes: 'TMO,DMO',
      alamosIntegrated: true,
      loanable: true,
    },
    'seed',
  );
  createDevice(
    db,
    { issi: '2002', rufname: 'Leer', alamosIntegrated: null, loanable: null, lastUpdatedAt: null },
    'seed',
  );
}

describe('GET /api/devices/export', () => {
  it('emits a BOM-prefixed ;-delimited CSV download with the German header row', async () => {
    const { db } = makeTestDb();
    seed(db);
    const res = await buildTestApp(db).request(PATH, {
      headers: { Cookie: await authCookie(adminUser) },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="funkgeraete-export.csv"',
    );
    // Read raw bytes: the response carries a UTF-8 BOM (EF BB BF). (res.text()'s
    // decoder silently strips a leading BOM, so assert on the bytes directly.)
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    // ignoreBOM: true keeps the U+FEFF in the decoded string so startsWith holds.
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    expect(text.startsWith(BOM)).toBe(true);

    const lines = text.slice(BOM.length).split(/\r?\n/).filter((l) => l !== '');
    expect(lines[0]).toBe(EXPORT_COLUMNS.map((c) => c.header).join(';'));
    expect(lines[0]).toContain('Ausleihbar'); // loanable column present
    expect(lines[0]).toContain('Alamos');

    // The 1001 row: booleans -> 'x', ISO date, quoted notes cell.
    const row1001 = lines.find((l) => l.startsWith('1001;'));
    expect(row1001).toBeDefined();
    expect(row1001).toContain(';2024-01-15;'); // lastUpdatedAt as YYYY-MM-DD
    expect(row1001).toContain(';TMO,DMO;'); // deviceModes as-is
    expect(row1001).toContain('"Hat ; Semikolon und ""Quote"""'); // proper CSV quoting
    expect(row1001?.endsWith(';x;x')).toBe(true); // Alamos=x, Ausleihbar=x (last two cols)
  });

  it('round-trips: every header maps, and a re-import classifies all rows as unchanged', async () => {
    const { db } = makeTestDb();
    seed(db);
    const text = await (
      await buildTestApp(db).request(PATH, { headers: { Cookie: await authCookie(adminUser) } })
    ).text();

    // Parse the exported file exactly as the import wizard would.
    const { columns, rows } = parseCsvText(text);

    // Mapping coverage: autoMapHeaders must recognize EVERY exported header, and
    // every importable field must be present — otherwise an unmapped column would
    // be silently dropped and rows would falsely classify as unchanged.
    const headerToField = autoMapHeaders(columns);
    expect(Object.keys(headerToField)).toHaveLength(columns.length);
    const mapping = {} as Record<string, number>;
    columns.forEach((h, i) => {
      const field = headerToField[h];
      if (field) mapping[field] = i;
    });
    for (const field of IMPORTABLE_FIELDS) {
      expect(mapping).toHaveProperty(field);
    }

    // Re-classify as ADMIN against the live DB; everything must be unchanged.
    const issiIdx = mapping.issi ?? 0;
    const issis = rows.map((r) => r[issiIdx]).filter((v): v is string => !!v);
    const existing = loadDevicesByIssi(db, issis);
    const { summary, rows: classified } = classifyRows({
      rows,
      mapping: mapping as ColumnMapping,
      existingByIssi: existing,
      role: 'admin',
    });
    expect(summary.unchanged).toBe(rows.length);
    expect(summary.updated).toBe(0);
    expect(summary.created).toBe(0);
    expect(summary.error).toBe(0);
    // Spot-check: no row carries any field change.
    for (const c of classified) expect(c.changes).toHaveLength(0);
  });

  it('is admin-only (403 updater, 401 anonymous)', async () => {
    const { db } = makeTestDb();
    const app = buildTestApp(db);
    expect((await app.request(PATH, { headers: { Cookie: await authCookie(updaterUser) } })).status).toBe(403);
    expect((await app.request(PATH)).status).toBe(401);
  });
});
