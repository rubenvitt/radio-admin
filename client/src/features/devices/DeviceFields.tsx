import type { ReactNode } from 'react';
import { Checkbox, Col, DatePicker, Divider, Form, Input, Row, Select } from 'antd';
import { DEVICE_MODES, STATUS_OPTIONS } from '@ra/shared';
import { Combobox } from '../../components/Combobox';
import { useSuggestions, type SuggestionField } from '../../hooks/useSuggestions';
import { useSoftwareVersions } from '../../hooks/useSoftwareVersions';

/**
 * Shared, presentational field grid for the device create modal and the drawer
 * edit form. Both forms render identical `Form.Item`s (same `name`/`label`), so
 * this extracts only the layout + inputs — each parent keeps its own
 * value-mapping (`onFinish`/`handleOk`, dayjs handling, diffing).
 *
 * `lockedFor(field)` decides per-field disabling: the edit form passes its
 * role-gated predicate; the create modal omits it (everything editable).
 */
export interface DeviceFieldsProps {
  lockedFor?: (field: string) => boolean;
  /**
   * Optional read-only Update-Stand badge rendered in the "Update" section.
   * The edit form passes the device's badge; the create modal omits it (a new
   * device has no update status yet).
   */
  updateStatusSlot?: ReactNode;
}

const COL = { xs: 24, sm: 12 } as const;

/** Combobox field bound to a `useSuggestions` source, wrapped in a grid column. */
function SuggestCol({
  name,
  label,
  field,
  disabled,
}: {
  name: string;
  label: string;
  field: SuggestionField;
  disabled: boolean;
}) {
  const { data, isLoading } = useSuggestions(field);
  return (
    <Col {...COL}>
      <Form.Item name={name} label={label}>
        <Combobox options={data ?? []} loading={isLoading} disabled={disabled} placeholder={label} />
      </Form.Item>
    </Col>
  );
}

export function DeviceFields({ lockedFor = () => false, updateStatusSlot }: DeviceFieldsProps) {
  const softwareVersions = useSoftwareVersions();

  return (
    <>
      <Divider orientation="left" style={{ marginTop: 0 }}>
        Identität
      </Divider>
      <Row gutter={[16, 8]}>
        <Col {...COL}>
          <Form.Item
            name="issi"
            label="ISSI"
            rules={[{ required: true, message: 'ISSI ist erforderlich' }]}
          >
            {/* issi is the match key; admin-edit-only. */}
            <Input disabled={lockedFor('issi')} />
          </Form.Item>
        </Col>
        <SuggestCol name="opta" label="OPTA" field="opta" disabled={lockedFor('opta')} />
        <SuggestCol name="rufname" label="Rufname" field="rufname" disabled={lockedFor('rufname')} />
        <Col {...COL}>
          <Form.Item name="serialNumber" label="Seriennummer">
            <Input disabled={lockedFor('serialNumber')} />
          </Form.Item>
        </Col>
        <Col {...COL}>
          <Form.Item name="hiorgId" label="Hiorg-ID">
            {/* Edit as text; read view (DeviceDetailDrawer) renders it as a link. */}
            <Input disabled={lockedFor('hiorgId')} />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left">Gerät</Divider>
      <Row gutter={[16, 8]}>
        <SuggestCol
          name="hersteller"
          label="Hersteller"
          field="hersteller"
          disabled={lockedFor('hersteller')}
        />
        <SuggestCol name="deviceType" label="Gerät" field="deviceType" disabled={lockedFor('deviceType')} />
        <SuggestCol
          name="bedieneinheit"
          label="Bedieneinheit"
          field="bedieneinheit"
          disabled={lockedFor('bedieneinheit')}
        />
        <Col {...COL}>
          <Form.Item name="deviceModes" label="Gerätefunktionen">
            <Select
              mode="multiple"
              allowClear
              disabled={lockedFor('deviceModes')}
              options={DEVICE_MODES.map((m) => ({ label: m, value: m }))}
            />
          </Form.Item>
        </Col>
        <SuggestCol name="funktion" label="Funktion" field="funktion" disabled={lockedFor('funktion')} />
      </Row>

      <Divider orientation="left">Einsatz</Divider>
      <Row gutter={[16, 8]}>
        <SuggestCol name="location" label="Lagerort" field="location" disabled={lockedFor('location')} />
        <SuggestCol
          name="assignedTo"
          label="Zuordnung"
          field="assignedTo"
          disabled={lockedFor('assignedTo')}
        />
        <Col {...COL}>
          <Form.Item name="status" label="Status">
            <Select
              allowClear
              disabled={lockedFor('status')}
              options={STATUS_OPTIONS.map((s) => ({ label: s, value: s }))}
            />
          </Form.Item>
        </Col>
        <Col {...COL}>
          <Form.Item name="loanable" label="Ausleihbar" valuePropName="checked">
            <Checkbox disabled={lockedFor('loanable')}>Für Ausleihe freigegeben</Checkbox>
          </Form.Item>
        </Col>
        <Col {...COL}>
          <Form.Item name="alamosIntegrated" label="Alamos integriert" valuePropName="checked">
            <Checkbox disabled={lockedFor('alamosIntegrated')}>Integriert</Checkbox>
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left">Update</Divider>
      <Row gutter={[16, 8]}>
        <Col {...COL}>
          <Form.Item name="softwareVersion" label="Letztes Update">
            <Combobox
              allowCreate
              options={(softwareVersions.data ?? []).map((v) => v.value)}
              loading={softwareVersions.isLoading}
              disabled={lockedFor('softwareVersion')}
              placeholder="Softwareversion"
            />
          </Form.Item>
        </Col>
        <Col {...COL}>
          <Form.Item name="lastUpdatedAt" label="Zuletzt aktualisiert">
            <DatePicker style={{ width: '100%' }} disabled={lockedFor('lastUpdatedAt')} />
          </Form.Item>
        </Col>
        {updateStatusSlot && (
          <Col {...COL}>
            <Form.Item label="Update-Stand">{updateStatusSlot}</Form.Item>
          </Col>
        )}
      </Row>

      <Divider orientation="left">Bemerkung</Divider>
      <Row gutter={[16, 8]}>
        <Col xs={24}>
          <Form.Item name="notes" label="Bemerkung">
            <Input.TextArea rows={3} disabled={lockedFor('notes')} />
          </Form.Item>
        </Col>
      </Row>
    </>
  );
}
