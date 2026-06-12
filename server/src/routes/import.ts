import { Hono } from 'hono';
import { importCommitSchema } from '@ra/shared';
import type { DeviceRecord } from '@ra/shared';
import type { Db } from '../repos/deviceRepo';
import { decodeCsv } from '../import/decode-csv';
import { parseCsvText } from '../import/parse-csv';
import { classifyRows, rowToIncoming, type ColumnMapping } from '../import/commit-service';
import { loadDevicesByIssi } from '../import/device-lookup';
import { applyCommit } from '../import/apply-commit';

export function importRoutes(_db: Db) {
  const r = new Hono();

  // POST /import/parse — raw multipart upload -> detected columns/rows/encoding.
  // Auth is already enforced by the global `/api/*` requireAuth guard in buildApp;
  // any authenticated role may parse a file.
  r.post('/import/parse', async (c) => {
    const form = await c.req.parseBody();
    const file = form['file'];
    if (!(file instanceof File)) {
      return c.json({ error: 'Keine Datei hochgeladen' }, 400);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    let decoded;
    try {
      decoded = decodeCsv(buffer);
    } catch {
      return c.json({ error: 'Leere oder ungültige Datei' }, 400);
    }
    const { columns, rows, delimiter } = parseCsvText(decoded.text);
    return c.json({
      columns,
      rows,
      detected: { delimiter, encoding: decoded.encoding },
    });
  });

  // POST /import/commit — mapping + rows -> dryRun classification summary, or
  // (Task 4.9) a transactional upsert when dryRun is false.
  r.post('/import/commit', async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = importCommitSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'Ungültige Eingabe', issues: parsed.error.issues }, 400);
    }
    const { dryRun, mapping, rows } = parsed.data;
    const db = c.get('db');
    const user = c.get('user');
    const role = user.role;

    const issis = collectIssis(rows, mapping);
    const existingByIssi: Map<string, DeviceRecord> = loadDevicesByIssi(db, issis);

    const { rows: classified, summary } = classifyRows({ rows, mapping, existingByIssi, role });

    if (dryRun) {
      return c.json({ dryRun: true, summary, rows: classified });
    }

    const incomingByIndex = new Map<number, Record<string, unknown>>();
    rows.forEach((row, i) => incomingByIndex.set(i, rowToIncoming(row, mapping)));
    const actor = user.name ?? user.sub;
    const result = applyCommit({ db, classified, incomingByIndex, existingByIssi, role, actor });
    return c.json({ dryRun: false, summary: result.summary, rows: result.rows });
  });

  return r;
}

/** Collects the trimmed, non-empty ISSI values from the mapped issi column. */
function collectIssis(rows: string[][], mapping: ColumnMapping): string[] {
  const idx = mapping.issi;
  return rows.map((row) => (row[idx] ?? '').trim()).filter((v) => v !== '');
}
