import { describe, it, expect } from 'vitest';
import { newId } from './id';

describe('newId', () => {
  it('returns a non-empty string', () => {
    expect(newId()).toBeTypeOf('string');
    expect(newId().length).toBeGreaterThan(0);
  });

  it('returns unique values across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });

  it('matches the cuid2 shape (24 lowercase alphanumeric chars)', () => {
    expect(newId()).toMatch(/^[a-z0-9]{24}$/);
  });
});
