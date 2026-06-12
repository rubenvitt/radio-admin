import { Button, Form, Space, message } from 'antd';
import dayjs from 'dayjs';
import {
  UPDATER_EDITABLE_FIELDS,
  type DevicePatch,
  type Role,
} from '@ra/shared';
import { ApiError } from '../../api/client';
import { UpdateStatusBadge } from '../../components/UpdateStatusBadge';
import { useUpdateDevice } from '../../hooks/useUpdateDevice';
import type { DeviceListItem } from '../../hooks/useDevices';
import { arrayToModes, modesToArray } from './deviceModes';
import { DeviceFields } from './DeviceFields';

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

// Boolean checkbox fields whose stored `null` renders as `false`; an untouched
// `false` over a stored `null` is not a real change (see diff loop below).
const BOOL_FIELDS = ['alamosIntegrated', 'loanable'] as const;

export function DeviceEditForm({ device, role, onClose }: DeviceEditFormProps) {
  const [form] = Form.useForm<FormValues>();
  const update = useUpdateDevice(device.id);

  const isUpdater = role === 'updater';
  const lockedFor = (field: string) =>
    isUpdater && !(UPDATER_EDITABLE_FIELDS as readonly string[]).includes(field);

  const initialValues: FormValues = {
    ...device,
    lastUpdatedAt: device.lastUpdatedAt ? dayjs(device.lastUpdatedAt) : null,
    deviceModes: modesToArray(device.deviceModes),
    // Bind the controlled Checkboxes to real booleans (null -> false) instead of
    // null (a React controlled/uncontrolled antipattern).
    alamosIntegrated: device.alamosIntegrated ?? false,
    loanable: device.loanable ?? false,
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
      loanable: values.loanable ?? null,
    };

    const patch: DevicePatch = {};
    for (const [key, value] of Object.entries(next) as [keyof DevicePatch, unknown][]) {
      const stored = device[key as keyof DeviceListItem];
      // An unchecked boolean checkbox (false) over a stored null is not a change:
      // the form coerces null -> false on init, so treat them as equal.
      if ((BOOL_FIELDS as readonly string[]).includes(key) && value === false && stored == null)
        continue;
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
      <DeviceFields
        lockedFor={lockedFor}
        updateStatusSlot={<UpdateStatusBadge status={device.updateStatus} />}
      />

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
