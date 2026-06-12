import { describe, it, expect } from 'vitest';
import { computeUpdateStatus } from './update-status';

describe('computeUpdateStatus', () => {
  it('returns unbekannt when device has no software version', () => {
    expect(computeUpdateStatus({ softwareVersion: null }, 'FW 12.3')).toBe('unbekannt');
  });

  it('returns unbekannt when device version is null even if reference is null', () => {
    expect(computeUpdateStatus({ softwareVersion: null }, null)).toBe('unbekannt');
  });

  it('returns aktuell when device version equals reference', () => {
    expect(computeUpdateStatus({ softwareVersion: 'FW 12.3' }, 'FW 12.3')).toBe('aktuell');
  });

  it('returns veraltet when device version differs from reference', () => {
    expect(computeUpdateStatus({ softwareVersion: 'FW 11.0' }, 'FW 12.3')).toBe('veraltet');
  });

  it('returns veraltet when reference is null but device has a version (phantom/unassigned ref)', () => {
    // Reference is null because the only assigned versions were unassigned;
    // a device that still carries a version is therefore not "aktuell".
    expect(computeUpdateStatus({ softwareVersion: 'FW 12.3' }, null)).toBe('veraltet');
  });

  it('is exact-string match (no normalization)', () => {
    expect(computeUpdateStatus({ softwareVersion: 'fw 12.3' }, 'FW 12.3')).toBe('veraltet');
    expect(computeUpdateStatus({ softwareVersion: 'FW 12.3 ' }, 'FW 12.3')).toBe('veraltet');
  });
});
