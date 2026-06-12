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

  it('lastUpdatedAt: numeric ms cell parses, blank/garbage -> null (not NaN)', () => {
    const mapping: ColumnMapping = { issi: 0, lastUpdatedAt: 1 };
    expect(rowToIncoming(['1', '1700000000000'], mapping).lastUpdatedAt).toBe(1_700_000_000_000);
    expect(rowToIncoming(['1', ''], mapping).lastUpdatedAt).toBeNull();
    expect(rowToIncoming(['1', '   '], mapping).lastUpdatedAt).toBeNull();
    expect(rowToIncoming(['1', 'n/a'], mapping).lastUpdatedAt).toBeNull();
    // Never NaN: a value out of every accepted shape is null.
    expect(rowToIncoming(['1', '15/01/2024'], mapping).lastUpdatedAt).toBeNull();
  });

  it('lastUpdatedAt: ISO YYYY-MM-DD -> UTC-midnight ms', () => {
    const mapping: ColumnMapping = { issi: 0, lastUpdatedAt: 1 };
    expect(rowToIncoming(['1', '2024-01-15'], mapping).lastUpdatedAt).toBe(Date.UTC(2024, 0, 15));
    expect(rowToIncoming(['1', '2020-12-31'], mapping).lastUpdatedAt).toBe(Date.UTC(2020, 11, 31));
    // Invalid calendar date -> null, not a rolled-over ms.
    expect(rowToIncoming(['1', '2024-13-40'], mapping).lastUpdatedAt).toBeNull();
  });

  it('lastUpdatedAt: German DD.MM.YYYY -> UTC-midnight ms', () => {
    const mapping: ColumnMapping = { issi: 0, lastUpdatedAt: 1 };
    expect(rowToIncoming(['1', '15.01.2024'], mapping).lastUpdatedAt).toBe(Date.UTC(2024, 0, 15));
    expect(rowToIncoming(['1', '1.2.2020'], mapping).lastUpdatedAt).toBe(Date.UTC(2020, 1, 1));
    expect(rowToIncoming(['1', '31.12.2020'], mapping).lastUpdatedAt).toBe(Date.UTC(2020, 11, 31));
    // ISO and German forms of the same day produce the SAME ms (round-trip safe).
    expect(rowToIncoming(['1', '15.01.2024'], mapping).lastUpdatedAt).toBe(
      rowToIncoming(['1', '2024-01-15'], mapping).lastUpdatedAt,
    );
    expect(rowToIncoming(['1', '32.13.2024'], mapping).lastUpdatedAt).toBeNull();
  });

  it('loanable: truthy tokens -> true, blank -> null, anything else -> false', () => {
    const mapping: ColumnMapping = { issi: 0, loanable: 1 };
    for (const t of ['x', 'X', 'ja', 'yes', 'true', '✓', '  x  ']) {
      expect(rowToIncoming(['1', t], mapping).loanable).toBe(true);
    }
    expect(rowToIncoming(['1', ''], mapping).loanable).toBeNull();
    expect(rowToIncoming(['1', '   '], mapping).loanable).toBeNull();
    expect(rowToIncoming(['1', 'nein'], mapping).loanable).toBe(false);
    expect(rowToIncoming(['1', '0'], mapping).loanable).toBe(false);
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
