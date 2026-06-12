import { classifyImportRow } from '@ra/shared';
import type { DeviceRecord, DevicePatch, FieldDiff, ImportRowClass, Role, ImportCommit } from '@ra/shared';

export interface ClassifiedRow {
  rowIndex: number;
  issi: string;
  class: ImportRowClass;
  changes: FieldDiff[];
  error?: string;
}

export type ImportSummary = Record<ImportRowClass, number>;

// The committed importCommitSchema maps device field -> column index.
export type ColumnMapping = ImportCommit['mapping'];

// Number-typed device fields the CSV may target.
const NUMERIC_FIELDS = new Set<string>(['lastUpdatedAt']);

/** Turns one raw string row into a typed { issi, ...patch } via the column mapping. */
export function rowToIncoming(
  row: string[],
  mapping: ColumnMapping,
): DevicePatch & { issi: string } {
  const out: Record<string, unknown> = { issi: '' };
  for (const [field, colIdx] of Object.entries(mapping)) {
    if (colIdx === undefined) continue;
    const raw = row[colIdx];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (field === 'issi') {
      out.issi = value;
    } else if (NUMERIC_FIELDS.has(field)) {
      out[field] = value === '' ? null : Number(value);
    } else {
      out[field] = value === '' ? null : value;
    }
  }
  return out as DevicePatch & { issi: string };
}

/**
 * Classifies every row against the lookup of existing devices by ISSI.
 * Detects in-file duplicate ISSIs (second+ occurrence -> error).
 */
export function classifyRows(args: {
  rows: string[][];
  mapping: ColumnMapping;
  existingByIssi: Map<string, DeviceRecord>;
  role: Role;
}): { rows: ClassifiedRow[]; summary: ImportSummary } {
  const { rows, mapping, existingByIssi, role } = args;
  const summary: ImportSummary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    error: 0,
    'skipped-no-permission': 0,
  };
  const seen = new Set<string>();
  const out: ClassifiedRow[] = rows.map((row, rowIndex) => {
    const incoming = rowToIncoming(row, mapping);
    const issi = incoming.issi;

    if (issi !== '' && seen.has(issi)) {
      summary.error += 1;
      return { rowIndex, issi, class: 'error', changes: [], error: 'Duplikat in Datei' };
    }
    if (issi !== '') seen.add(issi);

    const existing = issi === '' ? null : (existingByIssi.get(issi) ?? null);
    const result = classifyImportRow({ incoming, existing, role });
    summary[result.class] += 1;
    return { rowIndex, issi, class: result.class, changes: result.changes, error: result.error };
  });
  return { rows: out, summary };
}
