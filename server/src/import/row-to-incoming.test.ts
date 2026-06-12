import { describe, it, expect } from 'vitest';
import { rowToIncoming, type ColumnMapping } from './commit-service';

// Column layout matching the customer's real export header order:
// Hiorg-ID; OPTA; ISSI; Funktion; Lagerort; Hersteller; Gerät; Bedieneinheit;
// Gerätefunktionen; Status; Bemerkung; Alamos
const REAL_MAPPING: ColumnMapping = {
  hiorgId: 0,
  opta: 1,
  issi: 2,
  funktion: 3,
  location: 4,
  hersteller: 5,
  deviceType: 6,
  bedieneinheit: 7,
  deviceModes: 8,
  status: 9,
  notes: 10,
  alamosIntegrated: 11,
};

describe('rowToIncoming: new field normalization', () => {
  it('normalizes a full real-export row', () => {
    const row = [
      'H-42',
      'DRK BW 01/83/01',
      '1001',
      'GRTW',
      'Lager 3',
      'Motorola',
      'MTP850',
      'TPH900',
      'TMO/DMO',
      'Einsatzbereit',
      'Akku schwach',
      'x',
    ];
    const out = rowToIncoming(row, REAL_MAPPING);
    expect(out.issi).toBe('1001');
    expect(out.hiorgId).toBe('H-42');
    expect(out.opta).toBe('DRK BW 01/83/01');
    expect(out.funktion).toBe('GRTW');
    expect(out.location).toBe('Lager 3');
    expect(out.hersteller).toBe('Motorola');
    expect(out.deviceType).toBe('MTP850');
    expect(out.bedieneinheit).toBe('TPH900');
    expect(out.deviceModes).toBe('TMO,DMO');
    expect(out.status).toBe('Einsatzbereit');
    expect(out.notes).toBe('Akku schwach');
    expect(out.alamosIntegrated).toBe(true);
  });

  it('deviceModes: splits on / , ; and whitespace, uppercases, keeps only known modes in canonical order', () => {
    const make = (cell: string) =>
      rowToIncoming(['', '', '1', '', '', '', '', '', cell, '', '', ''], REAL_MAPPING).deviceModes;
    expect(make('gat,tmo')).toBe('TMO,GAT'); // canonical order, not input order
    expect(make('rep / dmo ; tmo')).toBe('TMO,DMO,REP');
    expect(make('TMO TMO DMO')).toBe('TMO,DMO'); // dedup
    expect(make('xyz')).toBeNull(); // unknown token -> empty -> null
    expect(make('')).toBeNull();
  });

  it('alamosIntegrated: truthy tokens -> true, blank -> null, anything else -> false', () => {
    const make = (cell: string) =>
      rowToIncoming(['', '', '1', '', '', '', '', '', '', '', '', cell], REAL_MAPPING)
        .alamosIntegrated;
    for (const t of ['x', 'X', 'ja', 'JA', 'yes', 'y', '1', 'true', 'wahr', '✓', '  x  ']) {
      expect(make(t)).toBe(true);
    }
    expect(make('')).toBeNull();
    expect(make('   ')).toBeNull();
    expect(make('nein')).toBe(false);
    expect(make('0')).toBe(false);
  });

  it('lastUpdatedAt: numeric cell parses, blank/non-numeric -> null (not NaN)', () => {
    const mapping: ColumnMapping = { issi: 0, lastUpdatedAt: 1 };
    expect(rowToIncoming(['1', '1700000000000'], mapping).lastUpdatedAt).toBe(1_700_000_000_000);
    expect(rowToIncoming(['1', ''], mapping).lastUpdatedAt).toBeNull();
    // A human date like "15.01.2024" is not a finite number -> null, never NaN.
    expect(rowToIncoming(['1', '15.01.2024'], mapping).lastUpdatedAt).toBeNull();
    expect(rowToIncoming(['1', 'n/a'], mapping).lastUpdatedAt).toBeNull();
  });

  it('other new text fields pass through trimmed, empty -> null', () => {
    const out = rowToIncoming(
      ['  H-1  ', '', '1', '', '', '   ', '', '', '', '', '', ''],
      REAL_MAPPING,
    );
    expect(out.hiorgId).toBe('H-1');
    expect(out.hersteller).toBeNull();
  });
});
