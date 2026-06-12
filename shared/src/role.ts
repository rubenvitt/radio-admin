export type Role = 'admin' | 'updater';

export function mapGroupsToRole(
  groups: string[],
  cfg: { adminGroup: string; updaterGroup: string },
): Role | null {
  if (groups.includes(cfg.adminGroup)) return 'admin';
  if (groups.includes(cfg.updaterGroup)) return 'updater';
  return null;
}
