import { Button } from 'antd';
import { FiColumns } from 'react-icons/fi';
import { COLUMN_DEFS } from './deviceColumns';
import { CheckboxDropdown } from './CheckboxDropdown';

export interface ColumnPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

/** Dropdown of checkboxes toggling visible column keys (persisted by the parent).
 *  Stays open while toggling — closes only on an outside click. */
export function ColumnPicker({ value, onChange }: ColumnPickerProps) {
  return (
    <CheckboxDropdown
      options={COLUMN_DEFS.map((d) => ({ key: d.key, label: d.label }))}
      value={value}
      onChange={onChange}
      button={<Button icon={<FiColumns />}>Spalten</Button>}
    />
  );
}
