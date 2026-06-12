import { Typography } from 'antd';
import { useParams, useSearchParams } from 'react-router-dom';
import type { UpdateStatus } from '@ra/shared';
import { DeviceList } from '../features/devices/DeviceList';
import { DeviceDetailDrawer } from '../features/devices/DeviceDetailDrawer';

const UPDATE_STATUSES: UpdateStatus[] = ['aktuell', 'veraltet', 'unbekannt'];

export function DevicesPage() {
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();

  // Seed the list filters from the URL so dashboard quick-links land pre-filtered.
  const rawStatus = searchParams.get('updateStatus');
  const updateStatus =
    rawStatus && UPDATE_STATUSES.includes(rawStatus as UpdateStatus)
      ? (rawStatus as UpdateStatus)
      : undefined;
  const q = searchParams.get('q') ?? undefined;

  return (
    <>
      <Typography.Title level={3}>Geräte</Typography.Title>
      <DeviceList initialParams={{ updateStatus, q }} />
      {id && <DeviceDetailDrawer deviceId={id} />}
    </>
  );
}
