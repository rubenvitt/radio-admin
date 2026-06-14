import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Grid,
  Input,
  List,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import { FiAlertTriangle, FiDownload, FiFilter, FiPlus } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { UpdateStatusBadge } from '../../components/UpdateStatusBadge';
import { useDevices, type DeviceListItem, type DeviceListParams } from '../../hooks/useDevices';
import { usePersistentState } from '../../hooks/usePersistentState';
import { ColumnPicker } from './ColumnPicker';
import { buildColumns, DEFAULT_VISIBLE_COLUMNS } from './deviceColumns';
import { DeviceFormModal } from './DeviceFormModal';
import { SearchFieldPicker, DEFAULT_SEARCH_FIELDS } from './SearchFieldPicker';
import { DeviceFilterDrawer, countActiveFilters, type DeviceFilters } from './DeviceFilterDrawer';

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

  const [visibleColumns, setVisibleColumns] = usePersistentState<string[]>(
    'ra-device-columns', DEFAULT_VISIBLE_COLUMNS,
  );
  const [searchFields, setSearchFields] = usePersistentState<string[]>(
    'ra-device-search-fields', DEFAULT_SEARCH_FIELDS,
  );
  const columns = useMemo(() => buildColumns(visibleColumns), [visibleColumns]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<DeviceFilters>(() => ({
    updateStatus: initialParams?.updateStatus,
    status: initialParams?.status,
    location: initialParams?.location,
    deviceType: initialParams?.deviceType,
  }));

  // Debounce the free-text search into the query param (resets to page 1).
  useEffect(() => {
    const handle = setTimeout(() => {
      setParams((prev) => {
        const next = search.trim() || undefined;
        if (prev.q === next && prev.searchFields === searchFields) return prev;
        return { ...prev, q: next, searchFields, page: 1 };
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [search, searchFields]);

  // Push filters into params whenever they change. Map every filter key explicitly
  // (not a spread) so that clearing a filter actually removes it from params.
  useEffect(() => {
    setParams((prev) => ({
      ...prev,
      updateStatus: filters.updateStatus,
      status: filters.status,
      location: filters.location,
      deviceType: filters.deviceType,
      funktion: filters.funktion,
      hersteller: filters.hersteller,
      deviceModes: filters.deviceModes,
      loanable: filters.loanable,
      alamosIntegrated: filters.alamosIntegrated,
      hasUpdateNote: filters.hasUpdateNote,
      page: 1,
    }));
  }, [filters]);

  const { data, isFetching } = useDevices(params);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const openDetail = (id: string) => navigate(`/devices/${id}`);

  // Trigger a CSV download. A programmatic same-origin GET anchor carries the
  // session cookie; `download` hints the browser to save rather than navigate.
  const handleExport = () => {
    const anchor = document.createElement('a');
    anchor.href = '/api/devices/export';
    anchor.download = '';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

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
        <Space.Compact style={{ width: 360, maxWidth: '100%' }}>
          <Input.Search
            allowClear
            placeholder="Suche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchFieldPicker value={searchFields} onChange={setSearchFields} />
        </Space.Compact>
        <Badge count={countActiveFilters(filters)} size="small">
          <Button icon={<FiFilter />} onClick={() => setFilterOpen(true)}>Filter</Button>
        </Badge>
      </Space>
      <Space wrap>
        <ColumnPicker value={visibleColumns} onChange={setVisibleColumns} />
        {isAdmin && (
          <>
            <Button icon={<FiDownload />} onClick={handleExport}>
              Exportieren
            </Button>
            <Button type="primary" icon={<FiPlus />} onClick={() => setCreateOpen(true)}>
              Gerät anlegen
            </Button>
          </>
        )}
      </Space>
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
                  {(device.funktion || device.deviceType) && (
                    <Typography.Text type="secondary">
                      {[device.funktion, device.deviceType].filter(Boolean).join(' · ')}
                    </Typography.Text>
                  )}
                  <Space size={4} wrap>
                    {device.location && <Tag>{device.location}</Tag>}
                    {device.updateNote && (
                      <Tag color="warning" icon={<FiAlertTriangle aria-label="Abweichung gemeldet" />}>
                        Abweichung
                      </Tag>
                    )}
                  </Space>
                </Space>
              </Card>
            </List.Item>
          )}
        />
      )}
      {isAdmin && <DeviceFormModal open={createOpen} onClose={() => setCreateOpen(false)} />}
      <DeviceFilterDrawer
        open={filterOpen}
        value={filters}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => { setFilters(next); setFilterOpen(false); }}
      />
    </Space>
  );
}
