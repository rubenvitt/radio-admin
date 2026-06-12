import { Typography } from 'antd';
import { useParams } from 'react-router-dom';
import { DeviceList } from '../features/devices/DeviceList';
import { DeviceDetailDrawer } from '../features/devices/DeviceDetailDrawer';

export function DevicesPage() {
  const { id } = useParams<{ id?: string }>();
  return (
    <>
      <Typography.Title level={3}>Geräte</Typography.Title>
      <DeviceList />
      {id && <DeviceDetailDrawer deviceId={id} />}
    </>
  );
}
