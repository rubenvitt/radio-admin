import { describe, it, expect } from 'vitest';
import {
  deviceCreateSchema,
  devicePatchSchema,
  importCommitSchema,
  suggestionFieldEnum,
} from './schemas';

describe('suggestionFieldEnum', () => {
  it('accepts the five suggestable fields', () => {
    for (const f of ['rufname', 'deviceType', 'status', 'location', 'assignedTo']) {
      expect(suggestionFieldEnum.parse(f)).toBe(f);
    }
  });
  it('rejects non-suggestable fields like issi/softwareVersion', () => {
    expect(suggestionFieldEnum.safeParse('issi').success).toBe(false);
    expect(suggestionFieldEnum.safeParse('softwareVersion').success).toBe(false);
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
});
