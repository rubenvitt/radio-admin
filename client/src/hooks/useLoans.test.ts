import { describe, it, expect } from 'vitest';
import { toLoanQueryString } from './useLoans';

describe('toLoanQueryString', () => {
  it('serialises page and pageSize', () => {
    expect(toLoanQueryString({ page: 2, pageSize: 50 })).toBe('page=2&pageSize=50');
  });
});
