import { describe, it, expect } from 'vitest';
import { mapGroupsToRole } from './role';

const cfg = { adminGroup: 'admin', updaterGroup: 'personal' };

describe('mapGroupsToRole', () => {
  it('returns admin when admin group present', () => {
    expect(mapGroupsToRole(['admin'], cfg)).toBe('admin');
  });

  it('returns updater when only updater group present', () => {
    expect(mapGroupsToRole(['personal'], cfg)).toBe('updater');
  });

  it('admin wins when both groups present', () => {
    expect(mapGroupsToRole(['personal', 'admin'], cfg)).toBe('admin');
    expect(mapGroupsToRole(['admin', 'personal'], cfg)).toBe('admin');
  });

  it('returns null when no group matches', () => {
    expect(mapGroupsToRole(['other', 'random'], cfg)).toBeNull();
  });

  it('returns null for empty groups array', () => {
    expect(mapGroupsToRole([], cfg)).toBeNull();
  });

  it('respects env-overridden group names', () => {
    const custom = { adminGroup: 'leitung', updaterGroup: 'helfer' };
    expect(mapGroupsToRole(['leitung'], custom)).toBe('admin');
    expect(mapGroupsToRole(['helfer'], custom)).toBe('updater');
    expect(mapGroupsToRole(['admin'], custom)).toBeNull();
  });
});
