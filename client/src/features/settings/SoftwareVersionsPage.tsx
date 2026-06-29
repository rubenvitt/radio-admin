import { useState } from 'react';
import { Alert, Button, Input, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FiArrowDown, FiArrowUp, FiCheck, FiPlus, FiTarget, FiTrash2 } from 'react-icons/fi';
import { ApiError } from '../../api/client';
import {
  useCreateSoftwareVersion,
  useDeleteSoftwareVersion,
  useReorderSoftwareVersions,
  useSetTargetVersion,
  useSoftwareVersions,
  type SoftwareVersionItem,
} from '../../hooks/useSoftwareVersions';
import { formatTimestamp } from '../../utils/format';

export function SoftwareVersionsPage() {
  const { data: versions, isFetching } = useSoftwareVersions();
  const createVersion = useCreateSoftwareVersion();
  const setTarget = useSetTargetVersion();
  const deleteVersion = useDeleteSoftwareVersion();
  const reorder = useReorderSoftwareVersions();

  const [newValue, setNewValue] = useState('');

  const rows = versions ?? [];

  const handleCreate = async () => {
    const value = newValue.trim();
    if (!value) return;
    try {
      await createVersion.mutateAsync({ value });
      setNewValue('');
      message.success('Version angelegt');
    } catch (err) {
      message.error(
        err instanceof ApiError && err.status === 409
          ? 'Diese Version existiert bereits'
          : 'Version konnte nicht angelegt werden',
      );
    }
  };

  const handleSetTarget = async (id: string) => {
    try {
      await setTarget.mutateAsync(id);
      message.success('Zielversion gesetzt');
    } catch {
      message.error('Zielversion konnte nicht gesetzt werden');
    }
  };

  const handleDelete = async (item: SoftwareVersionItem) => {
    try {
      await deleteVersion.mutateAsync(item.id);
      message.success('Version gelöscht');
    } catch (err) {
      const count = err instanceof ApiError ? (err.body as { deviceCount?: number })?.deviceCount : undefined;
      message.error(
        count != null
          ? `Version wird noch von ${count} Gerät(en) genutzt`
          : 'Version konnte nicht gelöscht werden',
      );
    }
  };

  // Move a row one position up/down by swapping it with its neighbour and
  // persisting the full displayed order.
  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const ids = rows.map((v) => v.id);
    const a = ids[index];
    const b = ids[target];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[target] = a;
    try {
      await reorder.mutateAsync(ids);
    } catch {
      message.error('Reihenfolge konnte nicht gespeichert werden');
    }
  };

  const columns: ColumnsType<SoftwareVersionItem> = [
    {
      title: 'Version',
      dataIndex: 'value',
      key: 'value',
      render: (value: string, item) => (
        <Space>
          <Typography.Text strong={item.isTarget}>{value}</Typography.Text>
          {item.isTarget && (
            <Tag color="green" icon={<FiTarget aria-hidden />}>
              Ziel
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Geräte',
      dataIndex: 'deviceCount',
      key: 'deviceCount',
      align: 'right',
    },
    {
      title: 'Angelegt',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: number) => formatTimestamp(value),
    },
    {
      title: 'Reihenfolge',
      key: 'order',
      align: 'center',
      render: (_, _item, index) => (
        <Space.Compact>
          <Button
            size="small"
            icon={<FiArrowUp />}
            aria-label="Nach oben"
            disabled={index === 0 || reorder.isPending}
            onClick={() => handleMove(index, -1)}
          />
          <Button
            size="small"
            icon={<FiArrowDown />}
            aria-label="Nach unten"
            disabled={index === rows.length - 1 || reorder.isPending}
            onClick={() => handleMove(index, 1)}
          />
        </Space.Compact>
      ),
    },
    {
      title: 'Aktionen',
      key: 'actions',
      align: 'right',
      render: (_, item) => (
        <Space>
          {item.isTarget ? (
            <Tag color="green">aktuelles Ziel</Tag>
          ) : (
            <Button
              size="small"
              icon={<FiCheck />}
              loading={setTarget.isPending}
              onClick={() => handleSetTarget(item.id)}
            >
              Als Ziel
            </Button>
          )}
          {item.deviceCount > 0 ? (
            <Tooltip title={`Wird von ${item.deviceCount} Gerät(en) genutzt — erst umstellen`}>
              <Button danger size="small" icon={<FiTrash2 />} disabled>
                Löschen
              </Button>
            </Tooltip>
          ) : (
            <Popconfirm
              title="Version wirklich löschen?"
              okText="Löschen"
              okButtonProps={{ danger: true }}
              cancelText="Abbrechen"
              onConfirm={() => handleDelete(item)}
            >
              <Button danger size="small" icon={<FiTrash2 />} loading={deleteVersion.isPending}>
                Löschen
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        Softwareversionen
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        message="Die als „Ziel“ markierte Version bestimmt, welche Geräte als „aktuell“ gelten. Neu angelegte Versionen werden nicht automatisch zum Ziel — die Reihenfolge dient nur der Anzeige."
      />

      <Space.Compact style={{ width: '100%', maxWidth: 420 }}>
        <Input
          placeholder="Neue Version, z. B. FW 12.3"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onPressEnter={handleCreate}
          aria-label="Neue Version"
        />
        <Button type="primary" icon={<FiPlus />} loading={createVersion.isPending} onClick={handleCreate}>
          Anlegen
        </Button>
      </Space.Compact>

      <Table<SoftwareVersionItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={isFetching}
        pagination={false}
        scroll={{ x: true }}
      />
    </Space>
  );
}
