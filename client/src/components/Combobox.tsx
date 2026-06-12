import { Select } from 'antd';
import { useMemo, useState } from 'react';

export interface ComboboxProps {
  value?: string | null;
  onChange?: (value: string | null) => void;
  options: string[];
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  allowCreate?: boolean;
  /**
   * Forwarded to the inner antd `Select`. antd `Form.Item` injects `id` into its
   * child control to associate the rendered `<label htmlFor>`; without forwarding
   * it, `getByLabelText`/label-clicks (and the role-gated form test) cannot reach
   * the control. Also accept `aria-*` so callers can label it directly.
   */
  id?: string;
  'aria-label'?: string;
}

interface Option {
  label: string;
  value: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  loading,
  disabled,
  allowCreate = true,
  id,
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const [searchValue, setSearchValue] = useState('');

  const selectOptions = useMemo<Option[]>(() => {
    const base: Option[] = options.map((opt) => ({ label: opt, value: opt }));
    const trimmed = searchValue.trim();
    if (
      allowCreate &&
      trimmed.length > 0 &&
      !options.some((opt) => opt.toLowerCase() === trimmed.toLowerCase())
    ) {
      return [{ label: `Anlegen: ${trimmed}`, value: trimmed }, ...base];
    }
    return base;
  }, [options, searchValue, allowCreate]);

  return (
    <Select<string>
      id={id}
      aria-label={ariaLabel}
      showSearch
      allowClear
      value={value ?? undefined}
      placeholder={placeholder}
      loading={loading}
      disabled={disabled}
      options={selectOptions}
      searchValue={searchValue}
      onSearch={setSearchValue}
      filterOption={(input, option) =>
        String(option?.value ?? '')
          .toLowerCase()
          .includes(input.toLowerCase())
      }
      onChange={(next) => {
        setSearchValue('');
        onChange?.(next ?? null);
      }}
      style={{ width: '100%' }}
    />
  );
}
