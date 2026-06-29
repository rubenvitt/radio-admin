import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { newId } from './id';

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey().$defaultFn(newId),
  rufname: text('rufname'),
  issi: text('issi').notNull().unique(),
  serialNumber: text('serial_number'),
  deviceType: text('device_type'),
  status: text('status'),
  location: text('location'),
  assignedTo: text('assigned_to'),
  softwareVersion: text('software_version'),
  lastUpdatedAt: integer('last_updated_at'),
  notes: text('notes'),
  // Customer master-data fields (all nullable). deviceModes is a plain canonical
  // comma-joined subset of DEVICE_MODES (e.g. "TMO,DMO"); alamosIntegrated is a
  // 0/1 integer surfaced as a boolean via drizzle's { mode: 'boolean' }.
  hiorgId: text('hiorg_id'),
  opta: text('opta'),
  funktion: text('funktion'),
  hersteller: text('hersteller'),
  bedieneinheit: text('bedieneinheit'),
  deviceModes: text('device_modes'),
  alamosIntegrated: integer('alamos_integrated', { mode: 'boolean' }),
  // Whether the device is available for loan; surfaced as a boolean via
  // { mode: 'boolean' }. MASTER DATA — never in UPDATER_EDITABLE_FIELDS.
  loanable: integer('loanable', { mode: 'boolean' }),
  // Append-only Update-Anmerkung (ISSI-Abweichungen etc.). Separate from the
  // admin master field `notes` — appended via POST /devices/:id/update-note,
  // never overwritten by the update flow. Admin may edit/clear it (resolve).
  updateNote: text('update_note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
});

export const softwareVersions = sqliteTable('software_versions', {
  id: text('id').primaryKey().$defaultFn(newId),
  value: text('value').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  createdBy: text('created_by'),
  // Manual display order (admin-sortable). Higher = shown further up. The
  // "current" target version is NOT derived from this — it is the explicit
  // isTarget flag below — so a newly-seen version landing on top never
  // auto-becomes the update target.
  sortOrder: integer('sort_order').notNull().default(0),
  // Exactly one version is the update target (the value that makes a device
  // 'aktuell'). Replaces the former "newest-createdAt-assigned-to-a-device"
  // heuristic; the admin sets it explicitly.
  isTarget: integer('is_target', { mode: 'boolean' }).notNull().default(false),
});

export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey().$defaultFn(newId),
  name: text('name').notNull(),
  // sha256 hex of the plaintext secret; the plaintext is never stored.
  tokenHash: text('token_hash').notNull(),
  // First ~11 chars of the secret, kept for display in the admin list.
  prefix: text('prefix').notNull(),
  createdAt: integer('created_at').notNull(),
  createdBy: text('created_by'),
  lastUsedAt: integer('last_used_at'),
  revokedAt: integer('revoked_at'),
});

/**
 * Known users keyed by their stable identity `sub` (a UUID for PocketID users).
 * Populated on authentication so audit columns (which store `sub`) can be
 * resolved to a human-readable `name` for display. `lastSeenAt` records the most
 * recent authentication so a renamed user's display name stays current.
 */
export const users = sqliteTable('users', {
  sub: text('sub').primaryKey(),
  name: text('name').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
});

export const deviceEvents = sqliteTable(
  'device_events',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedBy: text('changed_by'),
    changedAt: integer('changed_at').notNull(),
    source: text('source', { enum: ['manual', 'csv-import', 'create', 'update-note'] }).notNull(),
  },
  (table) => [index('device_events_device_id_idx').on(table.deviceId)],
);

/**
 * Ausleihen (loans). radio-admin is the system of record; the radio-inventar
 * kiosk writes through via the S2S loan API. `borrowed_at`/`returned_at` are
 * epoch-ms; `returned_at IS NULL` means the loan is active.
 *
 * `device_id` is intentionally NOT a foreign key: returned loans are retained as
 * history and must outlive a later device deletion (a cascade FK would wipe that
 * history; a restrict FK would block deleting a device that merely has old
 * returned loans). Historical accuracy is provided by the immutable display
 * snapshot copied at borrow time, not by a live join.
 *
 * The "at most one active loan per device" invariant is enforced by a PARTIAL
 * unique index `loans_device_active_uidx ON (device_id) WHERE returned_at IS
 * NULL`, hand-added in the migration because drizzle-kit cannot emit partial
 * indexes.
 */
export const loans = sqliteTable(
  'loans',
  {
    id: text('id').primaryKey().$defaultFn(newId),
    deviceId: text('device_id').notNull(),
    snapshotCallSign: text('snapshot_call_sign').notNull(),
    snapshotSerialNumber: text('snapshot_serial_number'),
    snapshotDeviceType: text('snapshot_device_type'),
    borrowerName: text('borrower_name').notNull(),
    borrowedAt: integer('borrowed_at').notNull(),
    returnedAt: integer('returned_at'),
    returnNote: text('return_note'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('loans_device_id_idx').on(table.deviceId),
    index('loans_borrowed_at_idx').on(table.borrowedAt),
    index('loans_returned_at_idx').on(table.returnedAt),
  ],
);
