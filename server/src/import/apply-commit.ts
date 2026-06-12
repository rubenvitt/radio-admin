import { filterEditableFields } from '@ra/shared';
import type { DeviceCreate, DeviceRecord, Role } from '@ra/shared';
import type { Db } from '../repos/deviceRepo';
import { createDevice, updateDevice, writeEvents } from '../repos/deviceRepo';
import { insertSoftwareVersionIfNew } from '../repos/softwareVersionRepo';
import type { ClassifiedRow, ImportSummary } from './commit-service';

interface ApplyArgs {
  db: Db;
  classified: ClassifiedRow[];
  /** Raw mapped patch per row index (issi + typed fields) from rowToIncoming. */
  incomingByIndex: Map<number, Record<string, unknown>>;
  existingByIssi: Map<string, DeviceRecord>;
  role: Role;
  actor: string;
}

/**
 * Applies created/updated rows in ONE better-sqlite3 transaction (synchronous;
 * a thrown error rolls back the whole batch). Reuses the device/software-version
 * repos rather than hand-rolling SQL:
 *  - created (admin only; updater rows are already 'skipped-no-permission'):
 *    createDevice + a 'create' event per changed field.
 *  - updated: re-apply the role allowlist server-side, updateDevice with only the
 *    changed allowlisted fields, + a 'csv-import' event per changed field.
 *  - missing software_versions are registered for any non-null softwareVersion.
 * error / unchanged / skipped rows produce no writes.
 */
export function applyCommit(args: ApplyArgs): { summary: ImportSummary; rows: ClassifiedRow[] } {
  const { db, classified, incomingByIndex, existingByIssi, role, actor } = args;

  db.transaction(() => {
    for (const row of classified) {
      const incoming = incomingByIndex.get(row.rowIndex) ?? {};

      if (row.class === 'created') {
        const swVersion = incoming.softwareVersion;
        if (typeof swVersion === 'string' && swVersion !== '') {
          insertSoftwareVersionIfNew(db, swVersion, actor);
        }
        // row.changes already reflects the admin (passthrough) allowlist; build the
        // create payload from the mapped incoming patch (issi carried separately).
        const { issi: _issi, ...rest } = incoming;
        const created = createDevice(db, { ...rest, issi: row.issi } as DeviceCreate, actor);
        writeEvents(db, created.id, row.changes, actor, 'create');
      } else if (row.class === 'updated') {
        const existing = existingByIssi.get(row.issi);
        if (!existing) continue;
        // Re-apply the role allowlist server-side (source of truth), then persist
        // only the fields that actually changed.
        const { issi: _issi, ...rest } = incoming;
        const patch = filterEditableFields(role, rest as Record<string, unknown>) as Record<string, unknown>;
        const setFields: Record<string, unknown> = {};
        for (const ch of row.changes) {
          setFields[ch.field] = patch[ch.field] ?? null;
        }
        const swVersion = patch.softwareVersion;
        if (typeof swVersion === 'string' && swVersion !== '') {
          insertSoftwareVersionIfNew(db, swVersion, actor);
        }
        updateDevice(db, existing.id, setFields as Partial<DeviceRecord>, actor);
        writeEvents(db, existing.id, row.changes, actor, 'csv-import');
      }
      // 'unchanged' | 'error' | 'skipped-no-permission' -> no writes
    }
  });

  const summary = recount(classified);
  return { summary, rows: classified };
}

function recount(rows: ClassifiedRow[]): ImportSummary {
  const s: ImportSummary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    error: 0,
    'skipped-no-permission': 0,
  };
  for (const r of rows) s[r.class] += 1;
  return s;
}
