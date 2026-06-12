import {
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Select,
  Space,
  message,
} from 'antd';
import dayjs from 'dayjs';
import {
  DEVICE_MODES,
  STATUS_OPTIONS,
  UPDATER_EDITABLE_FIELDS,
  type DevicePatch,
  type Role,
} from '@ra/shared';
import { ApiError } from '../../api/client';
import { Combobox } from '../../components/Combobox';
import { useSuggestions } from '../../hooks/useSuggestions';
import { useSoftwareVersions } from '../../hooks/useSoftwareVersions';
import type { SuggestionField } from '../../hooks/useSuggestions';
import { useUpdateDevice } from '../../hooks/useUpdateDevice';
import type { DeviceListItem } from '../../hooks/useDevices';
import { arrayToModes, modesToArray } from './deviceModes';

export interface DeviceEditFormProps {
  device: DeviceListItem;
  role: Role;
  onClose: () => void;
}

/** Form values: device fields plus `lastUpdatedAt` held as a dayjs instance. */
type FormValues = Omit<DeviceListItem, 'lastUpdatedAt' | 'deviceModes'> & {
  lastUpdatedAt: dayjs.Dayjs | null;
  deviceModes: string[];
};

/** Combobox field bound to a `useSuggestions` source. */
function SuggestComboItem({
  name,
  label,
  field,
  disabled,
}: {
  name: keyof DeviceListItem;
  label: string;
  field: SuggestionField;
  disabled: boolean;
}) {
  const { data, isLoading } = useSuggestions(field);
  return (
    <Form.Item name={name} label={label}>
      <Combobox options={data ?? []} loading={isLoading} disabled={disabled} placeholder={label} />
    </Form.Item>
  );
}

export function DeviceEditForm({ device, role, onClose }: DeviceEditFormProps) {
  const [form] = Form.useForm<FormValues>();
  const update = useUpdateDevice(device.id);
  const softwareVersions = useSoftwareVersions();

  const isUpdater = role === 'updater';
  const lockedFor = (field: string) =>
    isUpdater && !(UPDATER_EDITABLE_FIELDS as readonly string[]).includes(field);

  const initialValues: FormValues = {
    ...device,
    lastUpdatedAt: device.lastUpdatedAt ? dayjs(device.lastUpdatedAt) : null,
    deviceModes: modesToArray(device.deviceModes),
    // Bind the controlled Checkbox to a real boolean (null -> false) instead of
    // null (a React controlled/uncontrolled antipattern).
    alamosIntegrated: device.alamosIntegrated ?? false,
  };

  const onFinish = async (values: FormValues) => {
    // Build a full patch, then keep only fields that actually changed.
    const next: DevicePatch = {
      issi: values.issi,
      rufname: values.rufname ?? null,
      serialNumber: values.serialNumber ?? null,
      deviceType: values.deviceType ?? null,
      status: values.status ?? null,
      location: values.location ?? null,
      assignedTo: values.assignedTo ?? null,
      softwareVersion: values.softwareVersion ?? null,
      lastUpdatedAt: values.lastUpdatedAt ? values.lastUpdatedAt.valueOf() : null,
      notes: values.notes ?? null,
      hiorgId: values.hiorgId ?? null,
      opta: values.opta ?? null,
      funktion: values.funktion ?? null,
      hersteller: values.hersteller ?? null,
      bedieneinheit: values.bedieneinheit ?? null,
      deviceModes: arrayToModes(values.deviceModes),
      alamosIntegrated: values.alamosIntegrated ?? null,
    };

    const patch: DevicePatch = {};
    for (const [key, value] of Object.entries(next) as [keyof DevicePatch, unknown][]) {
      const stored = device[key as keyof DeviceListItem];
      // An unchecked Alamos checkbox (false) over a stored null is not a change:
      // the form coerces null -> false on init, so treat them as equal.
      if (key === 'alamosIntegrated' && value === false && stored == null) continue;
      if (value !== stored) {
        (patch as Record<string, unknown>)[key] = value;
      }
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    try {
      await update.mutateAsync(patch);
      message.success('Gerät gespeichert');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        message.error('ISSI bereits vergeben');
      } else {
        message.error('Speichern fehlgeschlagen');
      }
    }
  };

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={onFinish}
      requiredMark
    >
      <Form.Item name="issi" label="ISSI" rules={[{ required: true, message: 'ISSI ist erforderlich' }]}>
        {/* issi is the match key; admin-edit-only. */}
        <Input disabled={lockedFor('issi')} />
      </Form.Item>

      <SuggestComboItem name="rufname" label="Rufname" field="rufname" disabled={lockedFor('rufname')} />
      <SuggestComboItem name="opta" label="OPTA" field="opta" disabled={lockedFor('opta')} />
      <SuggestComboItem name="funktion" label="Funktion" field="funktion" disabled={lockedFor('funktion')} />
      <SuggestComboItem name="hersteller" label="Hersteller" field="hersteller" disabled={lockedFor('hersteller')} />
      <SuggestComboItem
        name="bedieneinheit"
        label="Bedieneinheit"
        field="bedieneinheit"
        disabled={lockedFor('bedieneinheit')}
      />
      <SuggestComboItem name="deviceType" label="Gerät" field="deviceType" disabled={lockedFor('deviceType')} />
      <SuggestComboItem name="location" label="Lagerort" field="location" disabled={lockedFor('location')} />
      <SuggestComboItem name="assignedTo" label="Zuordnung" field="assignedTo" disabled={lockedFor('assignedTo')} />

      <Form.Item name="serialNumber" label="Seriennummer">
        <Input disabled={lockedFor('serialNumber')} />
      </Form.Item>

      <Form.Item name="status" label="Status">
        <Select
          allowClear
          disabled={lockedFor('status')}
          options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))}
        />
      </Form.Item>

      <Form.Item name="softwareVersion" label="Letztes Update">
        <Combobox
          allowCreate
          options={(softwareVersions.data ?? []).map((v) => v.value)}
          loading={softwareVersions.isLoading}
          disabled={lockedFor('softwareVersion')}
          placeholder="Softwareversion"
        />
      </Form.Item>

      <Form.Item name="lastUpdatedAt" label="Zuletzt aktualisiert">
        <DatePicker style={{ width: '100%' }} disabled={lockedFor('lastUpdatedAt')} />
      </Form.Item>

      <Form.Item name="deviceModes" label="Gerätefunktionen">
        <Select
          mode="multiple"
          allowClear
          disabled={lockedFor('deviceModes')}
          options={DEVICE_MODES.map((m) => ({ label: m, value: m }))}
        />
      </Form.Item>

      <Form.Item name="alamosIntegrated" label="Alamos integriert" valuePropName="checked">
        <Checkbox disabled={lockedFor('alamosIntegrated')}>Integriert</Checkbox>
      </Form.Item>

      <Form.Item name="hiorgId" label="Hiorg-ID">
        {/* Edit as text; read view (DeviceDetailDrawer) renders it as a link. */}
        <Input disabled={lockedFor('hiorgId')} />
      </Form.Item>

      <Form.Item name="notes" label="Bemerkung">
        <Input.TextArea rows={3} disabled={lockedFor('notes')} />
      </Form.Item>

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={update.isPending}>
            Speichern
          </Button>
          <Button onClick={onClose}>Abbrechen</Button>
        </Space>
      </Form.Item>
    </Form>
  );
}
