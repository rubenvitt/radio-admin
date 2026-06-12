import { Form, Grid, Modal, message } from 'antd';
import type dayjs from 'dayjs';
import { type DeviceCreate } from '@ra/shared';
import { ApiError } from '../../api/client';
import { useCreateDevice } from '../../hooks/useCreateDevice';
import { arrayToModes } from './deviceModes';
import { DeviceFields } from './DeviceFields';

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
  loanable?: boolean;
  hiorgId?: string | null;
  notes?: string | null;
}

export function DeviceFormModal({ open, onClose }: DeviceFormModalProps) {
  const [form] = Form.useForm<CreateFormValues>();
  const create = useCreateDevice();
  const screens = Grid.useBreakpoint();

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
      loanable: values.loanable ?? null,
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
      width={screens.sm ? 760 : '100%'}
      destroyOnHidden
    >
      <Form<CreateFormValues> form={form} layout="vertical" preserve={false}>
        <DeviceFields />
      </Form>
    </Modal>
  );
}
