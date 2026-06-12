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
  const status = searchParams.get('status') ?? undefined;
  const location = searchParams.get('location') ?? undefined;

  return (
    <>
      <Typography.Title level={3}>Geräte</Typography.Title>
      {/*
        Remount on any query change: DeviceList seeds its filters into useState
        once, so without a key a back-navigation to /devices with different (or
        no) query would keep the stale filters from the previous mount.
      */}
      <DeviceList
        key={searchParams.toString()}
        initialParams={{ updateStatus, q, status, location }}
      />
      {id && <DeviceDetailDrawer deviceId={id} />}
    </>
  );
}
