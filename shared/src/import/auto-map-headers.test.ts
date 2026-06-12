import { describe, it, expect } from 'vitest';
import { autoMapHeaders, IMPORTABLE_FIELDS } from './auto-map-headers';

describe('autoMapHeaders', () => {
  it('maps exact German/English header names to device fields', () => {
    const m = autoMapHeaders(['ISSI', 'Rufname', 'Softwareversion', 'Standort']);
    expect(m).toEqual({
      ISSI: 'issi',
      Rufname: 'rufname',
      Softwareversion: 'softwareVersion',
      Standort: 'location',
    });
  });

  it('is case-insensitive and ignores surrounding whitespace and punctuation', () => {
    const m = autoMapHeaders(['  issi ', 'Ruf-Name', 'SW Version', 'zuletzt aktualisiert']);
    expect(m['  issi ']).toBe('issi');
    expect(m['Ruf-Name']).toBe('rufname');
    expect(m['SW Version']).toBe('softwareVersion');
    expect(m['zuletzt aktualisiert']).toBe('lastUpdatedAt');
  });

  it('maps common ISSI synonyms', () => {
    for (const h of ['ISSI', 'Funkrufname-ISSI', 'TEI', 'Kennung']) {
      expect(autoMapHeaders([h])[h]).toBe('issi');
    }
  });

  it('maps serial-number and device-type synonyms', () => {
    const m = autoMapHeaders(['Seriennummer', 'Geraetetyp', 'Typ', 'Zuordnung', 'Status', 'Notizen']);
    expect(m['Seriennummer']).toBe('serialNumber');
    expect(m['Geraetetyp']).toBe('deviceType');
    expect(m['Typ']).toBe('deviceType');
    expect(m['Zuordnung']).toBe('assignedTo');
    expect(m['Status']).toBe('status');
    expect(m['Notizen']).toBe('notes');
  });

  it('returns no entry for unrecognized headers (left for manual mapping)', () => {
    const m = autoMapHeaders(['Bemerkung XY', 'Spalte 7', '']);
    expect(m['Spalte 7']).toBeUndefined();
    expect(m['']).toBeUndefined();
  });

  it('does not map two headers to the same field (first match wins)', () => {
    const m = autoMapHeaders(['Typ', 'Gerätetyp']);
    expect(m['Typ']).toBe('deviceType');
    expect(m['Gerätetyp']).toBeUndefined();
  });

  it('exposes the set of importable target fields', () => {
    expect(IMPORTABLE_FIELDS).toContain('issi');
    expect(IMPORTABLE_FIELDS).toContain('softwareVersion');
    expect(IMPORTABLE_FIELDS).not.toContain('id');
  });

  it("auto-maps the customer's real German export header row", () => {
    const headers = [
      'Hiorg-ID',
      'OPTA',
      'ISSI',
      'Funktion',
      'Lagerort',
      'Hersteller',
      'Gerät',
      'Bedieneinheit',
      'Gerätefunktionen-TMO/DMO/REP/GAT',
      'Status',
      'Bemerkung',
      'Alamos',
    ];
    expect(autoMapHeaders(headers)).toEqual({
      'Hiorg-ID': 'hiorgId',
      OPTA: 'opta',
      ISSI: 'issi',
      Funktion: 'funktion',
      Lagerort: 'location',
      Hersteller: 'hersteller',
      'Gerät': 'deviceType',
      Bedieneinheit: 'bedieneinheit',
      'Gerätefunktionen-TMO/DMO/REP/GAT': 'deviceModes',
      Status: 'status',
      Bemerkung: 'notes',
      Alamos: 'alamosIntegrated',
    });
  });

  it('maps Alamos / "Alamos integriert" and Geraet (no umlaut) variants', () => {
    expect(autoMapHeaders(['Alamos integriert'])['Alamos integriert']).toBe('alamosIntegrated');
    expect(autoMapHeaders(['Geraet'])['Geraet']).toBe('deviceType');
  });
});
