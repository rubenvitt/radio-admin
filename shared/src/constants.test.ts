import { describe, it, expect } from 'vitest';
import { DEVICE_MODES, STATUS_OPTIONS } from './constants';

describe('DEVICE_MODES', () => {
  it('is the fixed canonical token set in order', () => {
    expect([...DEVICE_MODES]).toEqual(['TMO', 'DMO', 'REP', 'GAT']);
  });
});

describe('STATUS_OPTIONS', () => {
  it('is the fixed status select set', () => {
    expect([...STATUS_OPTIONS]).toEqual([
      'Einsatzbereit',
      'Defekt',
      'Ausgeliehen',
      'Wartung',
      'Sonstiges',
    ]);
  });
});
