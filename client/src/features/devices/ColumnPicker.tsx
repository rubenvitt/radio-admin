import { Button, Checkbox, Dropdown } from 'antd';
import { FiColumns } from 'react-icons/fi';
import { COLUMN_DEFS } from './deviceColumns';

export interface ColumnPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

/** Dropdown of checkboxes toggling visible column keys (persisted by the parent). */
export function ColumnPicker({ value, onChange }: ColumnPickerProps) {
  const visible = new Set(value);
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(visible);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(COLUMN_DEFS.filter((d) => next.has(d.key)).map((d) => d.key));
  };
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: COLUMN_DEFS.map((d) => ({
          key: d.key,
          label: (
            <Checkbox checked={visible.has(d.key)} onChange={(e) => toggle(d.key, e.target.checked)}>
              {d.label}
            </Checkbox>
          ),
        })),
      }}
    >
      <Button icon={<FiColumns />}>Spalten</Button>
    </Dropdown>
  );
}
