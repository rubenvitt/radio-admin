import { Typography } from 'antd';
import { DeviceList } from '../features/devices/DeviceList';

export function DevicesPage() {
  // The `:id` route param drives the DeviceDetailDrawer, mounted in Task 5.12.
  return (
    <>
      <Typography.Title level={3}>Geräte</Typography.Title>
      <DeviceList />
    </>
  );
}
