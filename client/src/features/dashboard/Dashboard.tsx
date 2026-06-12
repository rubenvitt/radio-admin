import { Card, Col, List, Row, Space, Statistic, Typography } from 'antd';
import { FiAlertTriangle, FiCheckCircle, FiHelpCircle, FiRadio } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import type { UpdateStatus } from '@ra/shared';
import { UpdateStatusBadge } from '../../components/UpdateStatusBadge';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useDevices } from '../../hooks/useDevices';

interface StatCard {
  key: string;
  title: string;
  value: number;
  color?: string;
  icon: React.ReactNode;
  filter?: UpdateStatus;
}

export function Dashboard() {
  const navigate = useNavigate();
  const stats = useDashboardStats();
  const outdated = useDevices({ page: 1, pageSize: 5, updateStatus: 'veraltet' });

  const goToDevices = (updateStatus?: UpdateStatus) => {
    navigate(updateStatus ? `/devices?updateStatus=${updateStatus}` : '/devices');
  };

  const cards: StatCard[] = [
    { key: 'total', title: 'Geräte gesamt', value: stats.total, icon: <FiRadio /> },
    {
      key: 'aktuell',
      title: 'Aktuell',
      value: stats.aktuell,
      color: '#3f8600',
      icon: <FiCheckCircle />,
      filter: 'aktuell',
    },
    {
      key: 'veraltet',
      title: 'Veraltet',
      value: stats.veraltet,
      color: '#cf1322',
      icon: <FiAlertTriangle />,
      filter: 'veraltet',
    },
    {
      key: 'unbekannt',
      title: 'Unbekannt',
      value: stats.unbekannt,
      color: '#8c8c8c',
      icon: <FiHelpCircle />,
      filter: 'unbekannt',
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        {cards.map((card) => (
          <Col xs={12} md={6} key={card.key}>
            <Card
              hoverable={card.filter !== undefined}
              onClick={card.filter ? () => goToDevices(card.filter) : undefined}
            >
              <Statistic
                title={card.title}
                value={card.value}
                loading={stats.isLoading}
                valueStyle={card.color ? { color: card.color } : undefined}
                prefix={card.icon}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title="Veraltete Geräte"
        extra={
          <Typography.Link onClick={() => goToDevices('veraltet')}>
            Alle veralteten anzeigen
          </Typography.Link>
        }
      >
        <List
          loading={outdated.isLoading}
          dataSource={outdated.data?.rows ?? []}
          locale={{ emptyText: 'Keine veralteten Geräte' }}
          renderItem={(device) => (
            <List.Item
              onClick={() => navigate(`/devices/${device.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <List.Item.Meta
                title={device.rufname || device.opta || device.issi}
                description={`ISSI: ${device.issi}`}
              />
              <UpdateStatusBadge status={device.updateStatus} />
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}
