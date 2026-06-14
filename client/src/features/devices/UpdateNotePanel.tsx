import { useState } from 'react';
import { Button, Input, Space, Typography, message } from 'antd';
import { useUpdateNote } from '../../hooks/useUpdateNote';

export interface UpdateNotePanelProps {
  deviceId: string;
  updateNote: string | null;
}

/** Read-only history of the Update-Anmerkung plus an append-only input. Used for
 *  non-admin roles (admins edit the field directly in the form). */
export function UpdateNotePanel({ deviceId, updateNote }: UpdateNotePanelProps) {
  const append = useUpdateNote(deviceId);
  const [text, setText] = useState('');

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await append.mutateAsync(text.trim());
      message.success('Anmerkung hinzugefügt');
      setText('');
    } catch {
      message.error('Anmerkung fehlgeschlagen');
    }
  };

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Typography.Text strong>Update-Anmerkung</Typography.Text>
      {updateNote ? (
        <Typography.Paragraph type="warning" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
          {updateNote}
        </Typography.Paragraph>
      ) : (
        <Typography.Text type="secondary">Keine Anmerkung.</Typography.Text>
      )}
      <Space.Compact style={{ width: '100%' }}>
        <Input
          placeholder="Anmerkung anhängen (z. B. ISSI weicht ab)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPressEnter={submit}
        />
        <Button onClick={submit} loading={append.isPending}>Hinzufügen</Button>
      </Space.Compact>
    </Space>
  );
}
