import { Button, Drawer, Form, Select, Space, Switch } from 'antd';
import { DEVICE_MODES, STATUS_OPTIONS, type UpdateStatus } from '@ra/shared';
import { useSuggestions, type SuggestionField } from '../../hooks/useSuggestions';
import type { DeviceListParams } from '../../hooks/useDevices';

export type DeviceFilters = Pick<
  DeviceListParams,
  'updateStatus' | 'status' | 'location' | 'deviceType' | 'funktion' | 'hersteller' | 'deviceModes' | 'loanable' | 'alamosIntegrated' | 'hasUpdateNote'
>;

export const EMPTY_FILTERS: DeviceFilters = {};

/** Count of active filters — drives the toolbar Badge. */
export function countActiveFilters(f: DeviceFilters): number {
  let n = 0;
  if (f.updateStatus) n++;
  for (const arr of [f.status, f.location, f.deviceType, f.funktion, f.hersteller, f.deviceModes]) {
    if (arr && arr.length) n++;
  }
  if (f.loanable) n++;
  if (f.alamosIntegrated) n++;
  if (f.hasUpdateNote) n++;
  return n;
}

const UPDATE_STATUS_OPTIONS: { value: UpdateStatus; label: string }[] = [
  { value: 'aktuell', label: 'Aktuell' },
  { value: 'veraltet', label: 'Veraltet' },
  { value: 'unbekannt', label: 'Unbekannt' },
];

function SuggestSelect({ field, value, onChange, placeholder }: { field: SuggestionField; value?: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const { data, isLoading } = useSuggestions(field);
  return (
    <Select
      mode="multiple" allowClear loading={isLoading} placeholder={placeholder}
      value={value} onChange={onChange} style={{ width: '100%' }}
      options={(data ?? []).map((v) => ({ label: v, value: v }))}
    />
  );
}

export interface DeviceFilterDrawerProps {
  open: boolean;
  value: DeviceFilters;
  onClose: () => void;
  onApply: (next: DeviceFilters) => void;
}

export function DeviceFilterDrawer({ open, value, onClose, onApply }: DeviceFilterDrawerProps) {
  const [form] = Form.useForm<DeviceFilters>();
  return (
    <Drawer
      title="Filter" open={open} onClose={onClose} width={360} destroyOnHidden
      extra={
        <Space>
          <Button onClick={() => { form.resetFields(); onApply(EMPTY_FILTERS); }}>Zurücksetzen</Button>
          <Button type="primary" onClick={() => onApply(form.getFieldsValue())}>Anwenden</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" initialValues={value}>
        <Form.Item name="deviceType" label="Gerät"><SuggestSelect field="deviceType" placeholder="Alle" onChange={(v) => form.setFieldValue('deviceType', v)} value={form.getFieldValue('deviceType')} /></Form.Item>
        <Form.Item name="funktion" label="Funktion"><SuggestSelect field="funktion" placeholder="Alle" onChange={(v) => form.setFieldValue('funktion', v)} value={form.getFieldValue('funktion')} /></Form.Item>
        <Form.Item name="status" label="Status">
          <Select mode="multiple" allowClear placeholder="Alle" options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))} />
        </Form.Item>
        <Form.Item name="updateStatus" label="Update-Stand">
          <Select allowClear placeholder="Alle" options={UPDATE_STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="location" label="Lagerort"><SuggestSelect field="location" placeholder="Alle" onChange={(v) => form.setFieldValue('location', v)} value={form.getFieldValue('location')} /></Form.Item>
        <Form.Item name="hersteller" label="Hersteller"><SuggestSelect field="hersteller" placeholder="Alle" onChange={(v) => form.setFieldValue('hersteller', v)} value={form.getFieldValue('hersteller')} /></Form.Item>
        <Form.Item name="deviceModes" label="Gerätefunktionen">
          <Select mode="multiple" allowClear placeholder="Alle" options={DEVICE_MODES.map((m) => ({ label: m, value: m }))} />
        </Form.Item>
        <Form.Item name="loanable" label="Ausleihbar" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="alamosIntegrated" label="Alamos integriert" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="hasUpdateNote" label="Abweichung gemeldet" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Drawer>
  );
}
