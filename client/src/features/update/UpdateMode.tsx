import { useEffect, useState } from 'react';
import { Alert, Empty, Input, Progress, Space, Spin, Typography } from 'antd';
import { Combobox } from '../../components/Combobox';
import { useSoftwareVersions } from '../../hooks/useSoftwareVersions';
import { useDevices } from '../../hooks/useDevices';
import { UpdateDeviceCard } from './UpdateDeviceCard';

const SEARCH_FIELDS = ['issi', 'rufname', 'opta'];

export function UpdateMode() {
  const versions = useSoftwareVersions();
  const [target, setTarget] = useState<string>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState<string | undefined>(undefined);

  // Preselect the current reference version once it loads.
  useEffect(() => {
    if (!target) {
      const ref = versions.data?.find((v) => v.isTarget)?.value;
      if (ref) setTarget(ref);
    }
  }, [versions.data, target]);

  useEffect(() => {
    const h = setTimeout(() => setQ(search.trim() || undefined), 300);
    return () => clearTimeout(h);
  }, [search]);

  const results = useDevices({ q, searchFields: SEARCH_FIELDS, page: 1, pageSize: 25 });
  const totalAll = useDevices({ page: 1, pageSize: 1 });
  const onTarget = useDevices({ updateStatus: 'aktuell', page: 1, pageSize: 1 });
  const total = totalAll.data?.total ?? 0;
  const done = onTarget.data?.total ?? 0;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 720 }}>
      <Typography.Title level={3} style={{ marginBottom: 0 }}>Update-Modus</Typography.Title>
      <Alert
        type="info" showIcon
        message="Gerät suchen, mit einem Tap auf die Zielversion setzen. Nur die Geräte, die du wirklich aktualisiert hast."
      />
      <div>
        <Typography.Text strong>Zielversion</Typography.Text>
        <Combobox
          allowCreate={false}
          options={(versions.data ?? []).map((v) => v.value)}
          loading={versions.isLoading}
          value={target}
          onChange={(v) => setTarget(v ?? '')}
          placeholder="Zielversion wählen"
        />
      </div>
      {total > 0 && (
        <div>
          <Typography.Text type="secondary">{done} von {total} auf Zielversion</Typography.Text>
          <Progress percent={Math.round((done / total) * 100)} />
        </div>
      )}
      <Input.Search
        allowClear
        placeholder="ISSI / Rufname / OPTA suchen…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {results.isFetching ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : !q ? (
        <Empty description="Gerät suchen, um es zu aktualisieren" />
      ) : results.data && results.data.rows.length > 0 ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {results.data.rows.map((d) => (
            <UpdateDeviceCard key={d.id} device={d} targetVersion={target} />
          ))}
        </Space>
      ) : (
        <Empty description="Kein Gerät gefunden" />
      )}
    </Space>
  );
}
