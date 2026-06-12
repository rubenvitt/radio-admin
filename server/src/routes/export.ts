import { Hono } from 'hono';
import { stringify } from 'csv-stringify/sync';
import type { DeviceRecord } from '@ra/shared';
import { requireRole } from '../auth/middleware';
import type { Db } from '../repos/deviceRepo';
import { listAllDevices } from '../repos/deviceRepo';

/** UTF-8 BOM so Excel opens the `;`-delimited file with correct encoding. */
const BOM = '﻿';

/**
 * Export columns in fixed order: each German header MUST normalize (via
 * autoMapHeaders) back to its device field, so the exported file re-imports
 * cleanly through the wizard. Verified by exportRoundTrip test.
 */
export const EXPORT_COLUMNS: { field: keyof DeviceRecord; header: string }[] = [
  { field: 'issi', header: 'ISSI' },
  { field: 'rufname', header: 'Rufname' },
  { field: 'serialNumber', header: 'Seriennummer' },
  { field: 'deviceType', header: 'Typ' },
  { field: 'status', header: 'Status' },
  { field: 'location', header: 'Standort' },
  { field: 'assignedTo', header: 'Zuordnung' },
  { field: 'softwareVersion', header: 'Softwareversion' },
  { field: 'lastUpdatedAt', header: 'Zuletzt aktualisiert' },
  { field: 'notes', header: 'Notizen' },
  { field: 'hiorgId', header: 'Hiorg-ID' },
  { field: 'opta', header: 'OPTA' },
  { field: 'funktion', header: 'Funktion' },
  { field: 'hersteller', header: 'Hersteller' },
  { field: 'bedieneinheit', header: 'Bedieneinheit' },
  { field: 'deviceModes', header: 'Gerätefunktionen' },
  { field: 'alamosIntegrated', header: 'Alamos' },
  { field: 'loanable', header: 'Ausleihbar' },
];

/**
 * Format one device field into its CSV cell:
 * - booleans (alamosIntegrated, loanable): true -> 'x', false/null -> '' (only
 *   true and null round-trip; the importer reads '' as null)
 * - lastUpdatedAt: UTC `YYYY-MM-DD`, '' if null
 * - deviceModes / text: the value as-is, '' if null
 */
export function formatCell(field: keyof DeviceRecord, value: unknown): string {
  if (field === 'alamosIntegrated' || field === 'loanable') {
    return value === true ? 'x' : '';
  }
  if (field === 'lastUpdatedAt') {
    if (value == null) return '';
    return new Date(value as number).toISOString().slice(0, 10);
  }
  return value == null ? '' : String(value);
}

/** Build the full `;`-delimited CSV text (with leading BOM) for the given devices. */
export function buildExportCsv(devices: DeviceRecord[]): string {
  const header = EXPORT_COLUMNS.map((c) => c.header);
  const rows = devices.map((d) => EXPORT_COLUMNS.map((c) => formatCell(c.field, d[c.field])));
  const body = stringify([header, ...rows], { delimiter: ';' });
  return BOM + body;
}

/**
 * Admin-only full CSV export. Session-guarded (mounted AFTER requireAuth) plus
 * requireRole('admin'). Emits a `;`-delimited UTF-8 CSV (BOM) that re-imports
 * through the existing wizard as a true round-trip.
 */
export function exportRoutes(db: Db) {
  const r = new Hono();
  r.get('/devices/export', requireRole('admin'), (c) => {
    const csv = buildExportCsv(listAllDevices(db));
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="funkgeraete-export.csv"');
    return c.body(csv);
  });
  return r;
}
