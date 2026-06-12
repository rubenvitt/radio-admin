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
