import type { Role } from './role';

export const UPDATER_EDITABLE_FIELDS = ['softwareVersion', 'lastUpdatedAt', 'status'] as const;

export function filterEditableFields<T extends Record<string, unknown>>(
  role: Role,
  patch: T,
): Partial<T> {
  if (role === 'admin') return { ...patch };
  const allow = new Set<string>(UPDATER_EDITABLE_FIELDS);
  const out: Partial<T> = {};
  for (const key of Object.keys(patch)) {
    if (allow.has(key)) {
      (out as Record<string, unknown>)[key] = patch[key];
    }
  }
  return out;
}
