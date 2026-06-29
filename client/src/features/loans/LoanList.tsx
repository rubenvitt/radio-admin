import { useState } from 'react';
import { Card, Grid, List, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { LoanRecord } from '@ra/shared';
import { useLoans, type LoanListParams } from '../../hooks/useLoans';
import { formatTimestamp } from '../../utils/format';

const PAGE_SIZE = 20;

/** Active vs. returned status, derived purely from `returnedAt`. */
function StatusTag({ returnedAt }: { returnedAt: number | null }) {
  return returnedAt === null ? <Tag color="processing">Aktiv</Tag> : <Tag>Zurückgegeben</Tag>;
}

const columns: ColumnsType<LoanRecord> = [
  { title: 'Gerät', dataIndex: 'snapshotCallSign', key: 'snapshotCallSign' },
  {
    title: 'Typ',
    dataIndex: 'snapshotDeviceType',
    key: 'snapshotDeviceType',
    render: (v: string | null) => v || '—',
  },
  { title: 'Ausleihende:r', dataIndex: 'borrowerName', key: 'borrowerName' },
  {
    title: 'Ausgeliehen',
    dataIndex: 'borrowedAt',
    key: 'borrowedAt',
    render: (v: number) => formatTimestamp(v),
  },
  {
    title: 'Zurückgegeben',
    dataIndex: 'returnedAt',
    key: 'returnedAt',
    render: (v: number | null) => formatTimestamp(v),
  },
  {
    title: 'Status',
    key: 'status',
    render: (_: unknown, loan: LoanRecord) => <StatusTag returnedAt={loan.returnedAt} />,
  },
  {
    title: 'Notiz',
    dataIndex: 'returnNote',
    key: 'returnNote',
    render: (v: string | null) => v || '—',
  },
];

/**
 * Read-only Ausleihen overview. radio-admin is the loan system of record; this
 * lists active + returned loans (newest-borrowed first) sourced from /api/loans.
 */
export function LoanList() {
  const screens = Grid.useBreakpoint();
  const isDesktop = screens.md;
  const [params, setParams] = useState<LoanListParams>({ page: 1, pageSize: PAGE_SIZE });

  const { data, isFetching } = useLoans(params);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const pagination: TablePaginationConfig = {
    current: params.page,
    pageSize: params.pageSize,
    total,
    showSizeChanger: false,
  };

  const handleTableChange = (p: TablePaginationConfig) => {
    setParams((prev) => ({ ...prev, page: p.current ?? 1, pageSize: p.pageSize ?? prev.pageSize }));
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {isDesktop ? (
        <Table<LoanRecord>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={isFetching}
          pagination={pagination}
          onChange={handleTableChange}
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
          renderItem={(loan) => (
            <List.Item>
              <Card style={{ width: '100%' }}>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Typography.Text strong>{loan.snapshotCallSign}</Typography.Text>
                    <StatusTag returnedAt={loan.returnedAt} />
                  </Space>
                  <Typography.Text type="secondary">{loan.borrowerName}</Typography.Text>
                  <Typography.Text type="secondary">
                    Ausgeliehen: {formatTimestamp(loan.borrowedAt)}
                  </Typography.Text>
                  {loan.returnedAt !== null && (
                    <Typography.Text type="secondary">
                      Zurückgegeben: {formatTimestamp(loan.returnedAt)}
                    </Typography.Text>
                  )}
                  {loan.returnNote && (
                    <Typography.Text type="secondary">{loan.returnNote}</Typography.Text>
                  )}
                </Space>
              </Card>
            </List.Item>
          )}
        />
      )}
    </Space>
  );
}
