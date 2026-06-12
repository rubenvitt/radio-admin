import {
  Checkbox,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  message,
} from 'antd';
import type dayjs from 'dayjs';
import {
  DEVICE_MODES,
  STATUS_OPTIONS,
  type DeviceCreate,
} from '@ra/shared';
import { ApiError } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { useSuggestions } from '../../hooks/useSuggestions';
import { useSoftwareVersions } from '../../hooks/useSoftwareVersions';
import type { SuggestionField } from '../../hooks/useSuggestions';
import { useCreateDevice } from '../../hooks/useCreateDevice';
import { arrayToModes } from './deviceModes';

export interface DeviceFormModalProps {
  open: boolean;
  onClose: () => void;
}

interface CreateFormValues {
  issi: string;
  rufname?: string | null;
  opta?: string | null;
  funktion?: string | null;
  hersteller?: string | null;
  bedieneinheit?: string | null;
  deviceType?: string | null;
  location?: string | null;
  assignedTo?: string | null;
  serialNumber?: string | null;
  status?: string | null;
  softwareVersion?: string | null;
  lastUpdatedAt?: dayjs.Dayjs | null;
  deviceModes?: string[];
  alamosIntegrated?: boolean;
  hiorgId?: string | null;
  notes?: string | null;
}

function SuggestComboItem({
  name,
  label,
  field,
}: {
  name: keyof CreateFormValues;
  label: string;
  field: SuggestionField;
}) {
  const { data, isLoading } = useSuggestions(field);
  return (
    <Form.Item name={name} label={label}>
      <Combobox options={data ?? []} loading={isLoading} placeholder={label} />
    </Form.Item>
  );
}

export function DeviceFormModal({ open, onClose }: DeviceFormModalProps) {
  const [form] = Form.useForm<CreateFormValues>();
  const create = useCreateDevice();
  const softwareVersions = useSoftwareVersions();

  const handleOk = async () => {
    let values: CreateFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // validation errors are surfaced inline by antd
    }

    const payload: DeviceCreate = {
      issi: values.issi,
      rufname: values.rufname ?? null,
      opta: values.opta ?? null,
      funktion: values.funktion ?? null,
      hersteller: values.hersteller ?? null,
      bedieneinheit: values.bedieneinheit ?? null,
      deviceType: values.deviceType ?? null,
      location: values.location ?? null,
      assignedTo: values.assignedTo ?? null,
      serialNumber: values.serialNumber ?? null,
      status: values.status ?? null,
      softwareVersion: values.softwareVersion ?? null,
      lastUpdatedAt: values.lastUpdatedAt ? values.lastUpdatedAt.valueOf() : null,
      deviceModes: arrayToModes(values.deviceModes ?? null),
      alamosIntegrated: values.alamosIntegrated ?? null,
      hiorgId: values.hiorgId ?? null,
      notes: values.notes ?? null,
    };

    try {
      await create.mutateAsync(payload);
      message.success('Gerät angelegt');
      form.resetFields();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        message.error('ISSI bereits vergeben');
      } else {
        message.error('Anlegen fehlgeschlagen');
      }
    }
  };

  return (
    <Modal
      title="Gerät anlegen"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={create.isPending}
      okText="Anlegen"
      cancelText="Abbrechen"
      destroyOnHidden
    >
      <Form<CreateFormValues> form={form} layout="vertical" preserve={false}>
        <Form.Item name="issi" label="ISSI" rules={[{ required: true, message: 'ISSI ist erforderlich' }]}>
          <Input />
        </Form.Item>

        <SuggestComboItem name="rufname" label="Rufname" field="rufname" />
        <SuggestComboItem name="opta" label="OPTA" field="opta" />
        <SuggestComboItem name="funktion" label="Funktion" field="funktion" />
        <SuggestComboItem name="hersteller" label="Hersteller" field="hersteller" />
        <SuggestComboItem name="bedieneinheit" label="Bedieneinheit" field="bedieneinheit" />
        <SuggestComboItem name="deviceType" label="Gerät" field="deviceType" />
        <SuggestComboItem name="location" label="Lagerort" field="location" />
        <SuggestComboItem name="assignedTo" label="Zuordnung" field="assignedTo" />

        <Form.Item name="serialNumber" label="Seriennummer">
          <Input />
        </Form.Item>

        <Form.Item name="status" label="Status">
          <Select allowClear options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))} />
        </Form.Item>

        <Form.Item name="softwareVersion" label="Letztes Update">
          <Combobox
            allowCreate
            options={(softwareVersions.data ?? []).map((v) => v.value)}
            loading={softwareVersions.isLoading}
            placeholder="Softwareversion"
          />
        </Form.Item>

        <Form.Item name="lastUpdatedAt" label="Zuletzt aktualisiert">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item name="deviceModes" label="Gerätefunktionen">
          <Select mode="multiple" allowClear options={DEVICE_MODES.map((m) => ({ label: m, value: m }))} />
        </Form.Item>

        <Form.Item name="alamosIntegrated" label="Alamos integriert" valuePropName="checked">
          <Checkbox>Integriert</Checkbox>
        </Form.Item>

        <Form.Item name="hiorgId" label="Hiorg-ID">
          <Input />
        </Form.Item>

        <Form.Item name="notes" label="Bemerkung">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
