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
