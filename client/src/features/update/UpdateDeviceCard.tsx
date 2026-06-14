import { useState } from 'react';
import { Button, Card, Input, Space, Typography, message } from 'antd';
import { FiAlertTriangle, FiCheck } from 'react-icons/fi';
import { UpdateStatusBadge } from '../../components/UpdateStatusBadge';
import { useUpdateDevice } from '../../hooks/useUpdateDevice';
import { useUpdateNote } from '../../hooks/useUpdateNote';
import type { DeviceListItem } from '../../hooks/useDevices';

export interface UpdateDeviceCardProps {
  device: DeviceListItem;
  targetVersion: string;
}

/** One device row in the Update-Modus: one-tap "set to target version" + an
 *  optional Update-Anmerkung (ISSI discrepancy). Each card owns its mutations. */
export function UpdateDeviceCard({ device, targetVersion }: UpdateDeviceCardProps) {
  const update = useUpdateDevice(device.id);
  const note = useUpdateNote(device.id);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  const apply = async () => {
    try {
      await update.mutateAsync({ softwareVersion: targetVersion, lastUpdatedAt: Date.now() });
      message.success(`${device.rufname || device.opta || device.issi}: auf ${targetVersion} gesetzt`);
    } catch {
      message.error('Speichern fehlgeschlagen');
    }
  };

  const submitNote = async () => {
    if (!noteText.trim()) return;
    try {
      await note.mutateAsync(noteText.trim());
      message.success('Anmerkung gespeichert');
      setNoteText('');
      setNoteOpen(false);
    } catch {
      message.error('Anmerkung fehlgeschlagen');
    }
  };

  return (
    <Card size="small" style={{ width: '100%' }}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{device.rufname || device.opta || device.issi}</Typography.Text>
            <Typography.Text type="secondary">
              ISSI {device.issi}{device.funktion ? ` · ${device.funktion}` : ''}{device.deviceType ? ` · ${device.deviceType}` : ''}
            </Typography.Text>
          </Space>
          <UpdateStatusBadge status={device.updateStatus} />
        </Space>
        <Space wrap>
          <Button type="primary" icon={<FiCheck />} loading={update.isPending} disabled={!targetVersion} onClick={apply}>
            Auf {targetVersion || '—'} aktualisiert
          </Button>
          <Button icon={<FiAlertTriangle />} onClick={() => setNoteOpen((o) => !o)}>
            ISSI weicht ab / Anmerkung
          </Button>
        </Space>
        {noteOpen && (
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="z. B. echte ISSI am Gerät / Abweichung"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onPressEnter={submitNote}
            />
            <Button onClick={submitNote} loading={note.isPending}>Speichern</Button>
          </Space.Compact>
        )}
        {device.updateNote && (
          <Typography.Paragraph type="warning" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {device.updateNote}
          </Typography.Paragraph>
        )}
      </Space>
    </Card>
  );
}
