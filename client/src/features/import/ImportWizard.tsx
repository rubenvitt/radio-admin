import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Result,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FiUpload } from 'react-icons/fi';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { IMPORTABLE_FIELDS, type ImportableField, type ImportCommit, type ImportRowClass } from '@ra/shared';
import { useImportParse, type ImportParseResult } from '../../hooks/useImportParse';
import {
  useImportCommit,
  type ImportCommitResult,
  type ImportRowResult,
} from '../../hooks/useImportCommit';
import { autoMapColumns, mappingToIndexMap, type ColumnMapping } from './columnMapping';

type WizardStep = 'upload' | 'mapping' | 'preview' | 'done';

const STEP_ORDER: WizardStep[] = ['upload', 'mapping', 'preview', 'done'];

// Human labels for the mappable device fields (mapping-step selectors).
const FIELD_LABELS: Record<ImportableField, string> = {
  issi: 'ISSI',
  rufname: 'Rufname',
  serialNumber: 'Seriennummer',
  deviceType: 'Gerät',
  status: 'Status',
  location: 'Lagerort',
  assignedTo: 'Zuordnung',
  softwareVersion: 'Letztes Update',
  lastUpdatedAt: 'Zuletzt aktualisiert',
  notes: 'Bemerkung',
  hiorgId: 'Hiorg-ID',
  opta: 'OPTA',
  funktion: 'Funktion',
  hersteller: 'Hersteller',
  bedieneinheit: 'Bedieneinheit',
  deviceModes: 'Gerätefunktionen',
  alamosIntegrated: 'Alamos integriert',
};

const CLASS_META: Record<ImportRowClass, { color: string; label: string }> = {
  created: { color: 'green', label: 'Neu' },
  updated: { color: 'blue', label: 'Aktualisiert' },
  unchanged: { color: 'default', label: 'Unverändert' },
  error: { color: 'red', label: 'Fehler' },
  'skipped-no-permission': { color: 'orange', label: 'Übersprungen' },
};

const UNMAPPED = '__none__';

function buildCommitPayload(
  mapping: ColumnMapping,
  columns: string[],
  rows: string[][],
  dryRun: boolean,
): ImportCommit | null {
  const indexMap = mappingToIndexMap(mapping, columns);
  if (indexMap.issi === undefined) return null;
  // issi is guaranteed present above; cast satisfies the schema's required issi.
  return { mapping: indexMap as ImportCommit['mapping'], rows, dryRun };
}

export function ImportWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const parse = useImportParse();
  const commit = useImportCommit();

  const [step, setStep] = useState<WizardStep>('upload');
  const [parsed, setParsed] = useState<ImportParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportCommitResult | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  const handleFile = (file: File) => {
    parse.mutate(file, {
      onSuccess: (data) => {
        setParsed(data);
        setMapping(autoMapColumns(data.columns));
        setStep('mapping');
      },
      onError: () => message.error('Datei konnte nicht gelesen werden'),
    });
  };

  const runPreview = () => {
    if (!parsed) return;
    const payload = buildCommitPayload(mapping, parsed.columns, parsed.rows, true);
    if (!payload) {
      message.error('ISSI-Spalte muss zugeordnet sein');
      return;
    }
    commit.mutate(payload, {
      onSuccess: (data) => {
        setPreview(data);
        setStep('preview');
      },
      onError: () => message.error('Vorschau fehlgeschlagen'),
    });
  };

  const runCommit = () => {
    if (!parsed) return;
    const payload = buildCommitPayload(mapping, parsed.columns, parsed.rows, false);
    if (!payload) return;
    commit.mutate(payload, {
      onSuccess: (data) => {
        setResult(data);
        void queryClient.invalidateQueries({ queryKey: ['devices'] });
        setStep('done');
      },
      onError: () => message.error('Import fehlgeschlagen'),
    });
  };

  const issiMapped = mapping.issi !== undefined;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Steps
        current={STEP_ORDER.indexOf(step)}
        items={[
          { title: 'Datei' },
          { title: 'Zuordnung' },
          { title: 'Vorschau' },
          { title: 'Fertig' },
        ]}
      />

      {step === 'upload' && (
        <Upload.Dragger
          accept=".csv,text/csv"
          maxCount={1}
          showUploadList={false}
          beforeUpload={(file) => {
            handleFile(file as unknown as File);
            return false; // prevent antd auto-POST; we upload via useImportParse
          }}
        >
          <p style={{ fontSize: 32 }}>
            <FiUpload />
          </p>
          <p>CSV-Datei hierher ziehen oder klicken</p>
          {parse.isPending && <p>Wird verarbeitet…</p>}
        </Upload.Dragger>
      )}

      {step === 'mapping' && parsed && (
        <Card title="Spalten zuordnen">
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              type={issiMapped ? 'success' : 'warning'}
              showIcon
              message={
                issiMapped
                  ? 'ISSI ist zugeordnet.'
                  : 'Die ISSI-Spalte muss zugeordnet werden, um fortzufahren.'
              }
            />
            {IMPORTABLE_FIELDS.map((field) => (
              <Row key={field} align="middle" gutter={8}>
                <Col span={8}>
                  <Typography.Text>
                    {FIELD_LABELS[field]}
                    {field === 'issi' && <Typography.Text type="danger"> *</Typography.Text>}
                  </Typography.Text>
                </Col>
                <Col span={16}>
                  <Select<string>
                    style={{ width: '100%' }}
                    value={mapping[field] ?? UNMAPPED}
                    onChange={(value) =>
                      setMapping((prev) => {
                        const next = { ...prev };
                        if (value === UNMAPPED) delete next[field];
                        else next[field] = value;
                        return next;
                      })
                    }
                    options={[
                      { value: UNMAPPED, label: '— nicht zuordnen —' },
                      ...parsed.columns.map((col) => ({ value: col, label: col })),
                    ]}
                  />
                </Col>
              </Row>
            ))}
            <Space>
              <Button onClick={() => setStep('upload')}>Zurück</Button>
              <Button
                type="primary"
                disabled={!issiMapped}
                loading={commit.isPending}
                onClick={runPreview}
              >
                Weiter
              </Button>
            </Space>
          </Space>
        </Card>
      )}

      {step === 'preview' && preview && (
        <PreviewStep
          result={preview}
          loading={commit.isPending}
          onBack={() => setStep('mapping')}
          onCommit={runCommit}
        />
      )}

      {step === 'done' && result && (
        <Result
          status="success"
          title="Import abgeschlossen"
          subTitle={summaryText(result.summary)}
          extra={
            <Button type="primary" onClick={() => navigate('/devices')}>
              Zu den Geräten
            </Button>
          }
        />
      )}
    </Space>
  );
}

function summaryText(summary: Record<ImportRowClass, number>): string {
  return (Object.keys(CLASS_META) as ImportRowClass[])
    .map((cls) => `${CLASS_META[cls].label}: ${summary[cls] ?? 0}`)
    .join(' · ');
}

function PreviewStep({
  result,
  loading,
  onBack,
  onCommit,
}: {
  result: ImportCommitResult;
  loading: boolean;
  onBack: () => void;
  onCommit: () => void;
}) {
  const columns: ColumnsType<ImportRowResult> = [
    { title: 'Zeile', dataIndex: 'rowIndex', key: 'rowIndex', width: 80 },
    { title: 'ISSI', dataIndex: 'issi', key: 'issi' },
    {
      title: 'Klasse',
      dataIndex: 'class',
      key: 'class',
      render: (cls: ImportRowClass) => {
        const meta = CLASS_META[cls];
        const tag = <Tag color={meta.color}>{meta.label}</Tag>;
        return cls === 'skipped-no-permission' ? (
          <Tooltip title="updater darf keine neuen Geräte anlegen">{tag}</Tooltip>
        ) : (
          tag
        );
      },
    },
    {
      title: 'Änderungen',
      key: 'changes',
      render: (_, row) =>
        row.error ? (
          <Typography.Text type="danger">{row.error}</Typography.Text>
        ) : (
          row.changes.map((c) => c.field).join(', ') || '—'
        ),
    },
  ];

  return (
    <Card title="Vorschau (Probelauf)">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row gutter={16}>
          {(Object.keys(CLASS_META) as ImportRowClass[]).map((cls) => (
            <Col key={cls}>
              <Statistic title={CLASS_META[cls].label} value={result.summary[cls] ?? 0} />
            </Col>
          ))}
        </Row>
        <Table<ImportRowResult>
          rowKey="rowIndex"
          size="small"
          columns={columns}
          dataSource={result.rows}
          pagination={{ pageSize: 10 }}
        />
        <Space>
          <Button onClick={onBack}>Zurück</Button>
          <Button type="primary" loading={loading} onClick={onCommit}>
            Import ausführen
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
