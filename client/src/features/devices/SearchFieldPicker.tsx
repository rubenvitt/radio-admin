import { Button } from 'antd';
import { FiSliders } from 'react-icons/fi';
import { CheckboxDropdown } from './CheckboxDropdown';

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

/** Dropdown of checkboxes choosing which fields the search targets. Stays open
 *  while toggling — closes only on an outside click. */
export function SearchFieldPicker({ value, onChange }: SearchFieldPickerProps) {
  return (
    <CheckboxDropdown
      options={SEARCH_FIELD_OPTIONS}
      value={value}
      onChange={onChange}
      button={<Button icon={<FiSliders />} aria-label="Suchfelder" />}
    />
  );
}
