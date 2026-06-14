import type { ColumnsType } from 'antd/es/table';
import { FiAlertTriangle, FiCheck } from 'react-icons/fi';
import { Tooltip } from 'antd';
import { UpdateStatusBadge } from '../../components/UpdateStatusBadge';
import type { DeviceListItem } from '../../hooks/useDevices';

export interface ColumnDef {
  key: string;
  label: string; // shown in the column picker
  column: ColumnsType<DeviceListItem>[number];
}

/** All available list columns, keyed. The picker shows `label`; the table uses
 *  `column`. `key`/`dataIndex` must match the server sort whitelist for sortable
 *  columns (rufname/issi/status/location/softwareVersion/updateStatus). */
export const COLUMN_DEFS: ColumnDef[] = [
  { key: 'rufname', label: 'OPTA / Rufname', column: { title: 'OPTA / Rufname', key: 'rufname', sorter: true, render: (_, d) => d.opta || d.rufname || '—' } },
  { key: 'issi', label: 'ISSI', column: { title: 'ISSI', dataIndex: 'issi', key: 'issi', sorter: true } },
  { key: 'funktion', label: 'Funktion', column: { title: 'Funktion', dataIndex: 'funktion', key: 'funktion', render: (v: string | null) => v || '—' } },
  { key: 'deviceType', label: 'Gerät', column: { title: 'Gerät', dataIndex: 'deviceType', key: 'deviceType', render: (v: string | null) => v || '—' } },
  { key: 'updateStatus', label: 'Update-Stand', column: { title: 'Update-Stand', key: 'updateStatus', sorter: true, render: (_, d) => <UpdateStatusBadge status={d.updateStatus} /> } },
  { key: 'status', label: 'Status', column: { title: 'Status', dataIndex: 'status', key: 'status', sorter: true } },
  { key: 'location', label: 'Lagerort', column: { title: 'Lagerort', dataIndex: 'location', key: 'location', sorter: true } },
  { key: 'hasUpdateNote', label: '⚠ Abweichung', column: { title: <FiAlertTriangle aria-label="Abweichung gemeldet" />, key: 'hasUpdateNote', align: 'center', render: (_, d) => (d.updateNote ? <Tooltip title="Abweichung gemeldet"><span><FiAlertTriangle aria-label="Abweichung gemeldet" color="#d48806" /></span></Tooltip> : null) } },
  { key: 'hersteller', label: 'Hersteller', column: { title: 'Hersteller', dataIndex: 'hersteller', key: 'hersteller', render: (v: string | null) => v || '—' } },
  { key: 'bedieneinheit', label: 'Bedieneinheit', column: { title: 'Bedieneinheit', dataIndex: 'bedieneinheit', key: 'bedieneinheit', render: (v: string | null) => v || '—' } },
  { key: 'deviceModes', label: 'Gerätefunktionen', column: { title: 'Gerätefunktionen', dataIndex: 'deviceModes', key: 'deviceModes', render: (v: string | null) => v || '—' } },
  { key: 'assignedTo', label: 'Zuordnung', column: { title: 'Zuordnung', dataIndex: 'assignedTo', key: 'assignedTo', render: (v: string | null) => v || '—' } },
  { key: 'opta', label: 'OPTA', column: { title: 'OPTA', dataIndex: 'opta', key: 'opta', render: (v: string | null) => v || '—' } },
  { key: 'serialNumber', label: 'Seriennummer', column: { title: 'Seriennummer', dataIndex: 'serialNumber', key: 'serialNumber', render: (v: string | null) => v || '—' } },
  { key: 'loanable', label: 'Ausleihbar', column: { title: 'Ausleihbar', key: 'loanable', align: 'center', render: (_, d) => (d.loanable ? <FiCheck aria-label="Ausleihbar" /> : null) } },
  { key: 'alamosIntegrated', label: 'Alamos', column: { title: 'Alamos', key: 'alamosIntegrated', align: 'center', render: (_, d) => (d.alamosIntegrated ? <FiCheck aria-label="Alamos integriert" /> : null) } },
  { key: 'softwareVersion', label: 'Letztes Update', column: { title: 'Letztes Update', dataIndex: 'softwareVersion', key: 'softwareVersion', sorter: true, render: (v: string | null) => v || '—' } },
];

export const DEFAULT_VISIBLE_COLUMNS = [
  'rufname', 'issi', 'funktion', 'deviceType', 'updateStatus', 'status', 'location', 'hasUpdateNote',
];

/** Build the antd columns array from the persisted visible-key list, preserving
 *  COLUMN_DEFS order. Unknown stored keys are ignored. */
export function buildColumns(visibleKeys: string[]): ColumnsType<DeviceListItem> {
  const visible = new Set(visibleKeys);
  return COLUMN_DEFS.filter((d) => visible.has(d.key)).map((d) => d.column);
}
