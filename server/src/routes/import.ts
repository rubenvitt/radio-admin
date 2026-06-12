import { Hono } from 'hono';
import type { Db } from '../repos/deviceRepo';
import { decodeCsv } from '../import/decode-csv';
import { parseCsvText } from '../import/parse-csv';

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

  return r;
}
