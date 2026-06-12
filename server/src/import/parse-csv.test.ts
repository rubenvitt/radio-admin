import { describe, it, expect } from 'vitest';
import { detectDelimiter, parseCsvText } from './parse-csv';

describe('detectDelimiter', () => {
  it('defaults to semicolon for German-Excel CSV', () => {
    expect(detectDelimiter('issi;rufname;status\n1001;Florian 1;ok\n')).toBe(';');
  });
  it('detects comma when comma is the dominant separator', () => {
    expect(detectDelimiter('issi,rufname,status\n1001,Florian 1,ok\n')).toBe(',');
  });
  it('detects tab when tabs dominate', () => {
    expect(detectDelimiter('issi\trufname\tstatus\n1001\tFlorian 1\tok\n')).toBe('\t');
  });
  it('prefers semicolon when ambiguous (semicolon present at all)', () => {
    expect(detectDelimiter('a;b,c\n1;2,3\n')).toBe(';');
  });
});

describe('parseCsvText', () => {
  it('parses a semicolon CSV into columns + rows', () => {
    const { columns, rows, delimiter } = parseCsvText('ISSI;Rufname\n1001;Florian 1\n1002;Florian 2\n');
    expect(delimiter).toBe(';');
    expect(columns).toEqual(['ISSI', 'Rufname']);
    expect(rows).toEqual([
      ['1001', 'Florian 1'],
      ['1002', 'Florian 2'],
    ]);
  });

  it('trims surrounding whitespace inside fields and skips fully empty lines', () => {
    const { rows } = parseCsvText('ISSI;Rufname\n 1001 ; Florian 1 \n\n1002;Florian 2\n');
    expect(rows).toEqual([
      ['1001', 'Florian 1'],
      ['1002', 'Florian 2'],
    ]);
  });

  it('handles quoted fields containing the delimiter', () => {
    const { rows } = parseCsvText('ISSI;Notiz\n1001;"a; b; c"\n');
    expect(rows).toEqual([['1001', 'a; b; c']]);
  });

  it('returns empty rows for a header-only file', () => {
    const { columns, rows } = parseCsvText('ISSI;Rufname\n');
    expect(columns).toEqual(['ISSI', 'Rufname']);
    expect(rows).toEqual([]);
  });
});
