import { describe, it, expect } from 'vitest';
import * as shared from './index';

describe('shared public API barrel', () => {
  it('re-exports the core functions', () => {
    expect(typeof shared.mapGroupsToRole).toBe('function');
    expect(typeof shared.computeUpdateStatus).toBe('function');
    expect(typeof shared.filterEditableFields).toBe('function');
    expect(typeof shared.diffDevice).toBe('function');
  });
  it('re-exports the allowlist constant', () => {
    expect([...shared.UPDATER_EDITABLE_FIELDS]).toEqual([
      'softwareVersion',
      'lastUpdatedAt',
      'status',
    ]);
  });
  it('re-exports the zod schemas', () => {
    expect(shared.deviceCreateSchema.safeParse({ issi: '1' }).success).toBe(true);
    expect(shared.devicePatchSchema.safeParse({}).success).toBe(true);
    expect(shared.importCommitSchema.safeParse({ mapping: { issi: 0 }, rows: [] }).success).toBe(true);
    expect(shared.suggestionFieldEnum.safeParse('location').success).toBe(true);
  });
});
