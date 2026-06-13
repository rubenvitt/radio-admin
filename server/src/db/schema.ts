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
    source: text('source', { enum: ['manual', 'csv-import', 'create'] }).notNull(),
  },
  (table) => [index('device_events_device_id_idx').on(table.deviceId)],
);
