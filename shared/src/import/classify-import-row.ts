import type { DeviceRecord, DevicePatch, FieldDiff, ImportRowClass } from '../schemas';
import type { Role } from '../role';
import { filterEditableFields } from '../editable-fields';
import { diffDevice } from '../diff-device';

export interface ClassifyResult {
  class: ImportRowClass;
  changes: FieldDiff[];
  error?: string;
}

type Incoming = DevicePatch & { issi: string };

/**
 * Classifies one mapped CSV row against the matching existing device (if any).
 *
 * - Empty/whitespace ISSI -> `error` (ISSI is the mandatory match key).
 * - Unknown ISSI -> `created` for admin (all incoming fields diffed from null),
 *   `skipped-no-permission` for updater (no creation right).
 * - Matched ISSI -> `updated` / `unchanged`, diffing only the role-allowlisted
 *   fields (admin: all; updater: softwareVersion/lastUpdatedAt/status).
 *
 * `issi` is carried purely as the match key and is never itself a diffable field.
 */
export function classifyImportRow(args: {
  incoming: Incoming;
  existing: DeviceRecord | null;
  role: Role;
}): ClassifyResult {
  const { incoming, existing, role } = args;

  // 1) ISSI is the mandatory match key.
  if (typeof incoming.issi !== 'string' || incoming.issi.trim() === '') {
    return { class: 'error', changes: [], error: 'Leere ISSI' };
  }

  // 2) Apply the role allowlist to the incoming patch (updater -> editable only).
  //    issi is dropped here: it is the match key, never a diffed/persisted field.
  const { issi: _issi, ...rest } = incoming;
  const allowed = filterEditableFields(role, rest as Record<string, unknown>) as Partial<DeviceRecord>;

  // 3) Unknown ISSI -> create (admin) or skip (updater lacks create permission).
  if (existing === null) {
    if (role !== 'admin') {
      return { class: 'skipped-no-permission', changes: [] };
    }
    const changes = diffDevice(emptyDevice(incoming.issi), allowed);
    return { class: 'created', changes };
  }

  // 4) Matched ISSI -> diff allowlisted fields against the existing record.
  const changes = diffDevice(existing, allowed);
  return { class: changes.length === 0 ? 'unchanged' : 'updated', changes };
}

// A synthetic all-null device so created-row diffs report oldValue: null.
function emptyDevice(issi: string): DeviceRecord {
  return {
    id: '',
    rufname: null,
    issi,
    serialNumber: null,
    deviceType: null,
    status: null,
    location: null,
    assignedTo: null,
    softwareVersion: null,
    lastUpdatedAt: null,
    notes: null,
    hiorgId: null,
    opta: null,
    funktion: null,
    hersteller: null,
    bedieneinheit: null,
    deviceModes: null,
    alamosIntegrated: null,
    loanable: null,
    createdAt: 0,
    updatedAt: 0,
    createdBy: null,
    updatedBy: null,
  };
}
