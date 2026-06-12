import { Descriptions, Drawer, Result, Space, Spin, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { UpdateStatusBadge } from '../../components/UpdateStatusBadge';
import { useDevice } from '../../hooks/useDevice';
import { DeviceEditForm } from './DeviceEditForm';

export interface DeviceDetailDrawerProps {
  deviceId: string;
}

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('de-DE');
}

/** hiorgId read view: a link when it looks like a URL, plain text otherwise. */
function HiorgValue({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  // A configurable Hiorg base-URL could be prefixed here later for bare IDs.
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return (
      <a href={value} target="_blank" rel="noreferrer">
        {value}
      </a>
    );
  }
  return <>{value}</>;
}

export function DeviceDetailDrawer({ deviceId }: DeviceDetailDrawerProps) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data: device, isLoading, error } = useDevice(deviceId);

  const close = () => navigate('/devices');

  const title = device ? `${device.rufname || device.opta || device.issi} (${device.issi})` : 'Gerät';

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  } else if (error instanceof ApiError && error.status === 404) {
    body = <Result status="404" title="Gerät nicht gefunden" />;
  } else if (error) {
    body = <Result status="error" title="Gerät konnte nicht geladen werden" />;
  } else if (device) {
    body = (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="Update-Stand">
            <UpdateStatusBadge status={device.updateStatus} />
          </Descriptions.Item>
          <Descriptions.Item label="Hiorg-ID">
            <HiorgValue value={device.hiorgId} />
          </Descriptions.Item>
          <Descriptions.Item label="Zuletzt aktualisiert">
            {formatTimestamp(device.lastUpdatedAt)}
          </Descriptions.Item>
          <Descriptions.Item label="Geändert">
            {formatTimestamp(device.updatedAt)}
            {device.updatedBy ? ` · ${device.updatedBy}` : ''}
          </Descriptions.Item>
        </Descriptions>

        <Typography.Title level={5} style={{ margin: 0 }}>
          Bearbeiten
        </Typography.Title>
        {role && <DeviceEditForm device={device} role={role} onClose={close} />}
      </Space>
    );
  }

  return (
    <Drawer title={title} open onClose={close} width={520} destroyOnClose>
      {body}
    </Drawer>
  );
}
