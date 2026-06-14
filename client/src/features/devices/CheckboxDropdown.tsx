import { Checkbox, Dropdown, theme } from 'antd';
import type { ReactNode } from 'react';

export interface CheckboxOption {
  key: string;
  label: ReactNode;
}

export interface CheckboxDropdownProps {
  options: CheckboxOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** The trigger element (a Button). */
  button: ReactNode;
}

/**
 * A Dropdown whose popup is a list of checkboxes. Unlike a `menu`-item dropdown,
 * the popup stays open while toggling — only an outside click or Esc closes it,
 * because the content is rendered via `popupRender` rather than as menu items.
 */
export function CheckboxDropdown({ options, value, onChange, button }: CheckboxDropdownProps) {
  const { token } = theme.useToken();
  const selected = new Set(value);
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    // Preserve the options' declared order in the emitted value.
    onChange(options.filter((o) => next.has(o.key)).map((o) => o.key));
  };
  return (
    <Dropdown
      trigger={['click']}
      popupRender={() => (
        <div
          style={{
            background: token.colorBgElevated,
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadowSecondary,
            padding: 4,
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {options.map((o) => (
            <div key={o.key} style={{ padding: '6px 12px' }}>
              <Checkbox
                checked={selected.has(o.key)}
                onChange={(e) => toggle(o.key, e.target.checked)}
              >
                {o.label}
              </Checkbox>
            </div>
          ))}
        </div>
      )}
    >
      {button}
    </Dropdown>
  );
}
