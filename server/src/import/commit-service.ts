import { classifyImportRow, DEVICE_MODES } from '@ra/shared';
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

// Trimmed/lowercased cell values that mark a boolean checkbox (Alamos /
// Ausleihbar) as true. Shared by both boolean fields so the truthy rule is identical.
const BOOL_TRUTHY = new Set<string>(['x', 'ja', 'yes', 'y', '1', 'true', 'wahr', '✓']);

/**
 * Normalizes a boolean checkbox cell: empty/whitespace -> null; a recognized
 * truthy token (case-insensitive) -> true; anything else (e.g. "nein", "0") -> false.
 */
function normalizeBoolean(cell: string): boolean | null {
  const v = cell.trim().toLowerCase();
  if (v === '') return null;
  return BOOL_TRUTHY.has(v);
}

/**
 * Normalizes a `lastUpdatedAt` cell to unix-ms (UTC) or null — never NaN:
 * - a numeric ms string (e.g. "1700000000000") -> Number
 * - ISO `YYYY-MM-DD` -> UTC-midnight ms
 * - German `DD.MM.YYYY` -> UTC-midnight ms
 * - empty / anything else -> null
 * ISO and the numeric branch are UTC; this mirrors the export's
 * `toISOString().slice(0,10)` so an exported date re-imports to the same ms.
 */
function normalizeLastUpdatedAt(cell: string): number | null {
  const v = cell.trim();
  if (v === '') return null;
  // Pure numeric ms string.
  if (/^-?\d+$/.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  // ISO YYYY-MM-DD (Date.parse of a date-only string is UTC).
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return isoToUtcMs(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  // German DD.MM.YYYY.
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (de) return isoToUtcMs(Number(de[3]), Number(de[2]), Number(de[1]));
  return null;
}

/** Build a UTC-midnight unix-ms from y/m/d, or null if the calendar date is invalid. */
function isoToUtcMs(year: number, month: number, day: number): number | null {
  const ms = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(ms)) return null;
  // Reject overflow (e.g. month 13, day 32 rolling over) so garbage -> null.
  const d = new Date(ms);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return ms;
}

/**
 * Normalizes a Gerätefunktionen cell into a canonical comma-joined subset of
 * DEVICE_MODES: split on `/ , ;` + whitespace, uppercase, keep only known modes,
 * emit in fixed DEVICE_MODES order (deduped). Empty/no-known-tokens -> null.
 */
function normalizeDeviceModes(cell: string): string | null {
  const tokens = new Set(
    cell
      .split(/[/,;\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t !== ''),
  );
  const ordered = DEVICE_MODES.filter((m) => tokens.has(m));
  return ordered.length === 0 ? null : ordered.join(',');
}

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
    } else if (field === 'deviceModes') {
      out.deviceModes = normalizeDeviceModes(typeof raw === 'string' ? raw : '');
    } else if (field === 'alamosIntegrated' || field === 'loanable') {
      out[field] = normalizeBoolean(typeof raw === 'string' ? raw : '');
    } else if (field === 'lastUpdatedAt') {
      // Accept ms / ISO YYYY-MM-DD / German DD.MM.YYYY; anything else -> null
      // (never NaN). The ISO form is what the CSV export emits (round-trip).
      out.lastUpdatedAt = normalizeLastUpdatedAt(value);
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
