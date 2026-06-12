import { parse } from 'csv-parse/sync';

const CANDIDATES = [';', ',', '\t'] as const;
export type Delimiter = (typeof CANDIDATES)[number];

/**
 * Picks a delimiter by counting occurrences on the first non-empty line.
 * `;` wins / is preferred whenever it appears (German-Excel default), then tab
 * vs comma by frequency.
 */
export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const counts: Record<Delimiter, number> = { ';': 0, ',': 0, '\t': 0 };
  for (const d of CANDIDATES) {
    counts[d] = firstLine.split(d).length - 1;
  }
  if (counts[';'] > 0) return ';';
  if (counts['\t'] > counts[',']) return '\t';
  if (counts[','] > 0) return ',';
  if (counts['\t'] > 0) return '\t';
  return ';';
}

export interface ParsedCsv {
  columns: string[];
  rows: string[][];
  delimiter: Delimiter;
}

/**
 * Parses CSV text into a header row (`columns`) and the remaining data `rows`.
 * Auto-detects the delimiter unless `forced` is supplied. Fields are trimmed,
 * fully-empty lines skipped, and ragged rows tolerated.
 */
export function parseCsvText(text: string, forced?: Delimiter): ParsedCsv {
  const delimiter = forced ?? detectDelimiter(text);
  const records = parse(text, {
    delimiter,
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];

  const [columns = [], ...rows] = records;
  return { columns, rows, delimiter };
}
