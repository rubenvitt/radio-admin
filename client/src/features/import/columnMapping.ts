import { autoMapHeaders, IMPORTABLE_FIELDS, type ImportableField } from '@ra/shared';

/** UI mapping: device field -> chosen CSV header string (or undefined = not mapped). */
export type ColumnMapping = Partial<Record<ImportableField, string>>;

export { IMPORTABLE_FIELDS };
export type { ImportableField };

/**
 * Auto-map CSV headers to device fields by reusing the shared `autoMapHeaders`
 * matcher (single source of truth for the synonym table). `autoMapHeaders`
 * returns header->field; we invert it to field->header for the wizard UI.
 * First header wins per field.
 */
export function autoMapColumns(columns: string[]): ColumnMapping {
  const headerToField = autoMapHeaders(columns);
  const result: ColumnMapping = {};
  for (const header of columns) {
    const field = headerToField[header];
    if (field && result[field] === undefined) {
      result[field] = header;
    }
  }
  return result;
}

/**
 * Convert the UI mapping (field -> header string) into the
 * `importCommitSchema` shape (field -> 0-based column index). Headers that are
 * not found in `columns` are dropped. `issi` is required by the schema; callers
 * must ensure it is mapped before commit.
 */
export function mappingToIndexMap(
  mapping: ColumnMapping,
  columns: string[],
): Partial<Record<ImportableField, number>> {
  const out: Partial<Record<ImportableField, number>> = {};
  for (const [field, header] of Object.entries(mapping) as [ImportableField, string][]) {
    const idx = columns.indexOf(header);
    if (idx >= 0) out[field] = idx;
  }
  return out;
}
