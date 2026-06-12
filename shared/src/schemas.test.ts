import { describe, it, expect } from 'vitest';
import {
  deviceCreateSchema,
  devicePatchSchema,
  importCommitSchema,
  suggestionFieldEnum,
} from './schemas';

describe('suggestionFieldEnum', () => {
  it('accepts the original five suggestable fields', () => {
    for (const f of ['rufname', 'deviceType', 'status', 'location', 'assignedTo']) {
      expect(suggestionFieldEnum.parse(f)).toBe(f);
    }
  });
  it('accepts the four new suggestable text fields', () => {
    for (const f of ['opta', 'funktion', 'hersteller', 'bedieneinheit']) {
      expect(suggestionFieldEnum.parse(f)).toBe(f);
    }
  });
  it('rejects non-suggestable fields like issi/softwareVersion/hiorgId', () => {
    expect(suggestionFieldEnum.safeParse('issi').success).toBe(false);
    expect(suggestionFieldEnum.safeParse('softwareVersion').success).toBe(false);
    expect(suggestionFieldEnum.safeParse('hiorgId').success).toBe(false);
  });
});

describe('deviceCreateSchema', () => {
  it('requires a non-empty issi', () => {
    expect(deviceCreateSchema.safeParse({}).success).toBe(false);
    expect(deviceCreateSchema.safeParse({ issi: '' }).success).toBe(false);
    const ok = deviceCreateSchema.safeParse({ issi: '12345' });
    expect(ok.success).toBe(true);
  });

  it('accepts full optional payload and coerces lastUpdatedAt to number', () => {
    const parsed = deviceCreateSchema.parse({
      issi: '12345',
      rufname: 'Florian 1/2',
      serialNumber: 'SN-1',
      deviceType: 'TPH900',
      status: 'einsatzbereit',
      location: 'Wache 1',
      assignedTo: 'Team A',
      softwareVersion: 'FW 12.3',
      lastUpdatedAt: 1718200000000,
      notes: 'foo',
    });
    expect(parsed.issi).toBe('12345');
    expect(parsed.lastUpdatedAt).toBe(1718200000000);
  });

  it('accepts the new master-data fields', () => {
    const parsed = deviceCreateSchema.parse({
      issi: '12345',
      hiorgId: 'H-42',
      opta: 'DRK BW 01/83/01',
      funktion: 'GRTW',
      hersteller: 'Motorola',
      bedieneinheit: 'TPH900',
      deviceModes: 'TMO,DMO',
      alamosIntegrated: true,
    });
    expect(parsed.hiorgId).toBe('H-42');
    expect(parsed.opta).toBe('DRK BW 01/83/01');
    expect(parsed.funktion).toBe('GRTW');
    expect(parsed.hersteller).toBe('Motorola');
    expect(parsed.bedieneinheit).toBe('TPH900');
    expect(parsed.deviceModes).toBe('TMO,DMO');
    expect(parsed.alamosIntegrated).toBe(true);
  });

  it('allows the new fields to be null and rejects a non-boolean alamosIntegrated', () => {
    const parsed = deviceCreateSchema.parse({
      issi: '1',
      hiorgId: null,
      deviceModes: null,
      alamosIntegrated: null,
    });
    expect(parsed.hiorgId).toBeNull();
    expect(parsed.deviceModes).toBeNull();
    expect(parsed.alamosIntegrated).toBeNull();
    expect(deviceCreateSchema.safeParse({ issi: '1', alamosIntegrated: 'x' }).success).toBe(false);
  });

  it('strips unknown keys (e.g. createdAt is server-owned)', () => {
    const parsed = deviceCreateSchema.parse({
      issi: '1',
      createdAt: 999,
      id: 'x',
    } as Record<string, unknown>);
    expect('createdAt' in parsed).toBe(false);
    expect('id' in parsed).toBe(false);
  });

  it('allows nullable optional fields to be null', () => {
    const parsed = deviceCreateSchema.parse({ issi: '1', softwareVersion: null, lastUpdatedAt: null });
    expect(parsed.softwareVersion).toBeNull();
    expect(parsed.lastUpdatedAt).toBeNull();
  });
});

describe('devicePatchSchema', () => {
  it('all fields optional incl. issi (issi non-empty when present)', () => {
    expect(devicePatchSchema.safeParse({}).success).toBe(true);
    expect(devicePatchSchema.safeParse({ status: 'in Reparatur' }).success).toBe(true);
    expect(devicePatchSchema.safeParse({ issi: '' }).success).toBe(false);
    expect(devicePatchSchema.safeParse({ issi: '777' }).success).toBe(true);
  });

  it('accepts the new master-data fields (nullable + optional)', () => {
    const parsed = devicePatchSchema.parse({
      opta: 'OPTA-1',
      deviceModes: 'TMO',
      alamosIntegrated: false,
      hiorgId: null,
    });
    expect(parsed.opta).toBe('OPTA-1');
    expect(parsed.deviceModes).toBe('TMO');
    expect(parsed.alamosIntegrated).toBe(false);
    expect(parsed.hiorgId).toBeNull();
  });
});

describe('importCommitSchema', () => {
  it('requires mapping with issi target and rows; dryRun defaults to false', () => {
    const parsed = importCommitSchema.parse({
      mapping: { issi: 0, softwareVersion: 2 },
      rows: [['111', 'x', 'FW 12.3']],
    });
    expect(parsed.dryRun).toBe(false);
    expect(parsed.mapping.issi).toBe(0);
    expect(parsed.rows).toHaveLength(1);
  });

  it('rejects mapping without issi', () => {
    expect(
      importCommitSchema.safeParse({ mapping: { softwareVersion: 2 }, rows: [] }).success,
    ).toBe(false);
  });

  it('respects explicit dryRun true', () => {
    const parsed = importCommitSchema.parse({ mapping: { issi: 0 }, rows: [], dryRun: true });
    expect(parsed.dryRun).toBe(true);
  });

  it('accepts optional index entries for the new mapped fields', () => {
    const parsed = importCommitSchema.parse({
      mapping: {
        issi: 0,
        hiorgId: 1,
        opta: 2,
        funktion: 3,
        hersteller: 4,
        bedieneinheit: 5,
        deviceModes: 6,
        alamosIntegrated: 7,
      },
      rows: [],
    });
    expect(parsed.mapping.hiorgId).toBe(1);
    expect(parsed.mapping.deviceModes).toBe(6);
    expect(parsed.mapping.alamosIntegrated).toBe(7);
  });
});
