import { Button, Checkbox, Dropdown } from 'antd';
import { FiSliders } from 'react-icons/fi';

export const SEARCH_FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: 'rufname', label: 'Rufname' },
  { key: 'issi', label: 'ISSI' },
  { key: 'serialNumber', label: 'Seriennummer' },
  { key: 'assignedTo', label: 'Zuordnung' },
  { key: 'opta', label: 'OPTA' },
  { key: 'funktion', label: 'Funktion' },
  { key: 'deviceType', label: 'Gerät' },
  { key: 'location', label: 'Lagerort' },
  { key: 'hersteller', label: 'Hersteller' },
  { key: 'bedieneinheit', label: 'Bedieneinheit' },
  { key: 'hiorgId', label: 'Hiorg-ID' },
];

export const DEFAULT_SEARCH_FIELDS = ['rufname', 'issi', 'serialNumber', 'assignedTo', 'opta', 'funktion'];

export interface SearchFieldPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function SearchFieldPicker({ value, onChange }: SearchFieldPickerProps) {
  const selected = new Set(value);
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(SEARCH_FIELD_OPTIONS.filter((o) => next.has(o.key)).map((o) => o.key));
  };
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: SEARCH_FIELD_OPTIONS.map((o) => ({
          key: o.key,
          label: (
            <Checkbox checked={selected.has(o.key)} onChange={(e) => toggle(o.key, e.target.checked)}>
              {o.label}
            </Checkbox>
          ),
        })),
      }}
    >
      <Button icon={<FiSliders />} aria-label="Suchfelder" />
    </Dropdown>
  );
}
