import { expect, test } from 'vitest';
import { autoMapColumns, mappingToIndexMap } from './columnMapping';

test('maps obvious headers to device fields (header-keyed)', () => {
  const result = autoMapColumns(['ISSI', 'Rufname', 'Softwareversion', 'Standort']);
  expect(result.issi).toBe('ISSI');
  expect(result.rufname).toBe('Rufname');
  expect(result.softwareVersion).toBe('Softwareversion');
  expect(result.location).toBe('Standort');
});

test('is case-insensitive and ignores unknown columns', () => {
  const result = autoMapColumns(['issi', 'foo', 'TYP']);
  expect(result.issi).toBe('issi');
  expect(result.deviceType).toBe('TYP');
  expect(Object.values(result)).not.toContain('foo');
});

test('leaves issi undefined when no matching header', () => {
  const result = autoMapColumns(['col1', 'col2']);
  expect(result.issi).toBeUndefined();
});

test('mappingToIndexMap converts header strings to 0-based column indices', () => {
  const columns = ['ISSI', 'Rufname', 'Standort'];
  const mapping = { issi: 'ISSI', location: 'Standort' };
  expect(mappingToIndexMap(mapping, columns)).toEqual({ issi: 0, location: 2 });
});
