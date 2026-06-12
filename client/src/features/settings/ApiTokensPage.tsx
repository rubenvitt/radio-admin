import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FiCopy, FiKey, FiPlus, FiTrash2 } from 'react-icons/fi';
import {
  useApiTokens,
  useCreateApiToken,
  useRevokeApiToken,
  type ApiToken,
  type CreatedApiToken,
} from '../../hooks/useApiTokens';

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('de-DE');
}

/** Best-effort clipboard copy with a user-visible confirmation. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    message.success('In die Zwischenablage kopiert');
  } catch {
    message.error('Kopieren fehlgeschlagen');
  }
}

export function ApiTokensPage() {
  const { data: tokens, isFetching } = useApiTokens();
  const createToken = useCreateApiToken();
  const revokeToken = useRevokeApiToken();

  const [createForm] = Form.useForm<{ name: string }>();
  const [createOpen, setCreateOpen] = useState(false);
  // The one-time plaintext token, held only until the admin dismisses the modal.
  const [created, setCreated] = useState<CreatedApiToken | null>(null);

  const loanEndpoint = `${window.location.origin}/api/v1/loan-devices`;
  const curlExample = `curl -H "Authorization: Bearer <token>" ${loanEndpoint}`;

  const handleCreate = async () => {
    let values: { name: string };
    try {
      values = await createForm.validateFields();
    } catch {
      return;
    }
    try {
      const result = await createToken.mutateAsync({ name: values.name.trim() });
      createForm.resetFields();
      setCreateOpen(false);
      setCreated(result);
    } catch {
      message.error('Token konnte nicht erstellt werden');
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeToken.mutateAsync(id);
      message.success('Token widerrufen');
    } catch {
      message.error('Widerrufen fehlgeschlagen');
    }
  };

  const columns: ColumnsType<ApiToken> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Präfix',
      dataIndex: 'prefix',
      key: 'prefix',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: 'Erstellt',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: number) => formatTimestamp(value),
    },
    {
      title: 'Zuletzt genutzt',
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      render: (value: number | null) => formatTimestamp(value),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, token) =>
        token.revokedAt ? (
          <Tag color="default">Widerrufen</Tag>
        ) : (
          <Tag color="green">Aktiv</Tag>
        ),
    },
    {
      title: 'Aktionen',
      key: 'actions',
      align: 'right',
      render: (_, token) =>
        token.revokedAt ? null : (
          <Popconfirm
            title="Token wirklich widerrufen?"
            description="Anwendungen, die diesen Token nutzen, verlieren sofort den Zugriff."
            okText="Widerrufen"
            okButtonProps={{ danger: true }}
            cancelText="Abbrechen"
            onConfirm={() => handleRevoke(token.id)}
          >
            <Button danger size="small" icon={<FiTrash2 />} loading={revokeToken.isPending}>
              Widerrufen
            </Button>
          </Popconfirm>
        ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          <Space>
            <FiKey aria-hidden />
            API-Zugriff
          </Space>
        </Typography.Title>
        <Button type="primary" icon={<FiPlus />} onClick={() => setCreateOpen(true)}>
          Token erstellen
        </Button>
      </Space>

      <Table<ApiToken>
        rowKey="id"
        columns={columns}
        dataSource={tokens ?? []}
        loading={isFetching}
        pagination={false}
        scroll={{ x: true }}
      />

      <Card title="Ausleih-Schnittstelle" size="small">
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            Der externe Ausleih-Dienst ruft die Schnittstelle mit einem der oben erstellten Tokens
            ab. Sie liefert alle als „Ausleihbar“ markierten Geräte zurück.
          </Typography.Paragraph>
          <Typography.Text>
            Endpunkt: <Typography.Text code>GET {loanEndpoint}</Typography.Text>
          </Typography.Text>
          <Typography.Text>
            Header: <Typography.Text code>Authorization: Bearer &lt;token&gt;</Typography.Text>
          </Typography.Text>
          <Space.Compact style={{ width: '100%' }}>
            <Input readOnly value={curlExample} />
            <Button
              icon={<FiCopy />}
              onClick={() => {
                void copyToClipboard(curlExample);
              }}
            >
              Kopieren
            </Button>
          </Space.Compact>
        </Space>
      </Card>

      <Modal
        title="Token erstellen"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        confirmLoading={createToken.isPending}
        okText="Erstellen"
        cancelText="Abbrechen"
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Name ist erforderlich' }]}
          >
            <Input placeholder="z. B. Ausleih-Dienst" autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Token erstellt"
        open={created !== null}
        onCancel={() => setCreated(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setCreated(null)}>
            Fertig
          </Button>,
        ]}
        destroyOnHidden
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="Dieser Token wird nur einmal angezeigt"
            description="Kopieren Sie ihn jetzt und bewahren Sie ihn sicher auf. Er kann später nicht erneut eingesehen werden."
          />
          {created && (
            <Space.Compact style={{ width: '100%' }}>
              <Input readOnly value={created.token} />
              <Button
                icon={<FiCopy />}
                onClick={() => {
                  void copyToClipboard(created.token);
                }}
              >
                Kopieren
              </Button>
            </Space.Compact>
          )}
        </Space>
      </Modal>
    </Space>
  );
}
