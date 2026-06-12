import { Tag } from 'antd';
import type { UpdateStatus } from '@ra/shared';

const CONFIG: Record<UpdateStatus, { color: string; label: string }> = {
  aktuell: { color: 'green', label: 'Aktuell' },
  veraltet: { color: 'red', label: 'Veraltet' },
  unbekannt: { color: 'default', label: 'Unbekannt' },
};

export function UpdateStatusBadge({ status }: { status: UpdateStatus }) {
  const { color, label } = CONFIG[status];
  return <Tag color={color}>{label}</Tag>;
}
