import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Grid,
  Input,
  List,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import { FiCheck, FiPlus } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import type { UpdateStatus } from '@ra/shared';
import { useAuth } from '../../auth/useAuth';
import { UpdateStatusBadge } from '../../components/UpdateStatusBadge';
import { useDevices, type DeviceListItem, type DeviceListParams } from '../../hooks/useDevices';
import { DeviceFormModal } from './DeviceFormModal';

const UPDATE_STATUS_OPTIONS: { value: UpdateStatus; label: string }[] = [
  { value: 'aktuell', label: 'Aktuell' },
  { value: 'veraltet', label: 'Veraltet' },
  { value: 'unbekannt', label: 'Unbekannt' },
];

const PAGE_SIZE = 20;

export interface DeviceListProps {
  /** Optional initial query params (e.g. a pre-filtered view linked from the dashboard). */
  initialParams?: Partial<DeviceListParams>;
}

export function DeviceList({ initialParams }: DeviceListProps = {}) {
  const screens = Grid.useBreakpoint();
  const isDesktop = screens.md;
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const [params, setParams] = useState<DeviceListParams>({
    page: 1,
    pageSize: PAGE_SIZE,
    ...initialParams,
  });
  const [search, setSearch] = useState(initialParams?.q ?? '');

  // Debounce the free-text search into the query param (resets to page 1).
  useEffect(() => {
    const handle = setTimeout(() => {
      setParams((prev) => {
        const next = search.trim() || undefined;
        if (prev.q === next) return prev;
        return { ...prev, q: next, page: 1 };
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const { data, isFetching } = useDevices(params);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const openDetail = (id: string) => navigate(`/devices/${id}`);

  const columns = useMemo<ColumnsType<DeviceListItem>>(
    () => [
      {
        title: 'OPTA / Rufname',
        key: 'rufname',
        sorter: true,
        render: (_, d) => d.opta || d.rufname || '—',
      },
      { title: 'ISSI', dataIndex: 'issi', key: 'issi', sorter: true },
      {
        title: 'Update-Stand',
        key: 'updateStatus',
        sorter: true,
        render: (_, d) => <UpdateStatusBadge status={d.updateStatus} />,
      },
      { title: 'Status', dataIndex: 'status', key: 'status', sorter: true },
      { title: 'Lagerort', dataIndex: 'location', key: 'location', sorter: true },
      { title: 'Hersteller', dataIndex: 'hersteller', key: 'hersteller' },
      { title: 'Gerät', dataIndex: 'deviceType', key: 'deviceType' },
      {
        title: 'Alamos',
        key: 'alamosIntegrated',
        align: 'center',
        render: (_, d) =>
          d.alamosIntegrated ? <FiCheck aria-label="Alamos integriert" /> : null,
      },
      {
        title: 'Letztes Update',
        dataIndex: 'softwareVersion',
        key: 'lastUpdatedAt',
        sorter: true,
        render: (value: string | null) => value || '—',
      },
    ],
    [],
  );

  // Map antd Table change events into server-side query params.
  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<DeviceListItem> | SorterResult<DeviceListItem>[],
  ) => {
    const single = Array.isArray(sorter) ? sorter[0] : sorter;
    let sort: string | undefined;
    if (single?.order && single.columnKey) {
      sort = `${String(single.columnKey)}:${single.order === 'descend' ? 'desc' : 'asc'}`;
    }
    setParams((prev) => ({
      ...prev,
      page: pagination.current ?? 1,
      pageSize: pagination.pageSize ?? prev.pageSize,
      sort,
    }));
  };

  const toolbar = (
    <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
      <Space wrap>
        <Input.Search
          allowClear
          placeholder="Suche (Rufname, ISSI, Seriennummer, Zuordnung)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 320, maxWidth: '100%' }}
        />
        <Select<UpdateStatus>
          allowClear
          placeholder="Update-Stand"
          value={params.updateStatus}
          options={UPDATE_STATUS_OPTIONS}
          onChange={(value) =>
            setParams((prev) => ({ ...prev, updateStatus: value ?? undefined, page: 1 }))
          }
          style={{ width: 180 }}
        />
      </Space>
      {isAdmin && (
        <Button type="primary" icon={<FiPlus />} onClick={() => setCreateOpen(true)}>
          Gerät anlegen
        </Button>
      )}
    </Space>
  );

  const pagination: TablePaginationConfig = {
    current: params.page,
    pageSize: params.pageSize,
    total,
    showSizeChanger: false,
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {toolbar}
      {isDesktop ? (
        <Table<DeviceListItem>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={isFetching}
          pagination={pagination}
          onChange={handleTableChange}
          onRow={(record) => ({
            onClick: () => openDetail(record.id),
            style: { cursor: 'pointer' },
          })}
          scroll={{ x: true }}
        />
      ) : (
        <List
          loading={isFetching}
          dataSource={rows}
          pagination={{
            current: params.page,
            pageSize: params.pageSize,
            total,
            onChange: (page) => setParams((prev) => ({ ...prev, page })),
          }}
          renderItem={(device) => (
            <List.Item>
              <Card
                hoverable
                style={{ width: '100%' }}
                onClick={() => openDetail(device.id)}
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Typography.Text strong>
                      {device.rufname || device.opta || device.issi}
                    </Typography.Text>
                    <UpdateStatusBadge status={device.updateStatus} />
                  </Space>
                  <Typography.Text type="secondary">ISSI: {device.issi}</Typography.Text>
                  {device.location && <Tag>{device.location}</Tag>}
                </Space>
              </Card>
            </List.Item>
          )}
        />
      )}
      {isAdmin && <DeviceFormModal open={createOpen} onClose={() => setCreateOpen(false)} />}
    </Space>
  );
}
