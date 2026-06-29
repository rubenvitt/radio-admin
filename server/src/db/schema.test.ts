import { describe, it, expect } from 'vitest';
import { devices, softwareVersions, deviceEvents, apiTokens, users } from './schema';

function columnNames(table: object): string[] {
  // drizzle table columns are enumerable own keys mapped to Column objects
  const cols = table as Record<string, { name?: unknown } | undefined>;
  return Object.keys(cols).filter((k) => cols[k]?.name !== undefined);
}

describe('schema: devices', () => {
  it('has exactly the contracted columns', () => {
    expect(columnNames(devices).sort()).toEqual(
      [
        'id',
        'rufname',
        'issi',
        'serialNumber',
        'deviceType',
        'status',
        'location',
        'assignedTo',
        'softwareVersion',
        'lastUpdatedAt',
        'notes',
        'hiorgId',
        'opta',
        'funktion',
        'hersteller',
        'bedieneinheit',
        'deviceModes',
        'alamosIntegrated',
        'loanable',
        'updateNote',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
      ].sort(),
    );
  });
});

describe('schema: softwareVersions', () => {
  it('has exactly the contracted columns', () => {
    expect(columnNames(softwareVersions).sort()).toEqual(
      ['id', 'value', 'createdAt', 'createdBy', 'sortOrder', 'isTarget'].sort(),
    );
  });
});

describe('schema: apiTokens', () => {
  it('has exactly the contracted columns', () => {
    expect(columnNames(apiTokens).sort()).toEqual(
      [
        'id',
        'name',
        'tokenHash',
        'prefix',
        'createdAt',
        'createdBy',
        'lastUsedAt',
        'revokedAt',
      ].sort(),
    );
  });
});

describe('schema: deviceEvents', () => {
  it('has exactly the contracted columns', () => {
    expect(columnNames(deviceEvents).sort()).toEqual(
      [
        'id',
        'deviceId',
        'field',
        'oldValue',
        'newValue',
        'changedBy',
        'changedAt',
        'source',
      ].sort(),
    );
  });
});

describe('schema: users', () => {
  it('has exactly the contracted columns', () => {
    expect(columnNames(users).sort()).toEqual(['sub', 'name', 'lastSeenAt'].sort());
  });
});
