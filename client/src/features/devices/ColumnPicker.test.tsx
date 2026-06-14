import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ColumnPicker } from './ColumnPicker';

test('toggles a column key and calls onChange', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ColumnPicker value={['rufname', 'issi']} onChange={onChange} />);
  await user.click(screen.getByRole('button', { name: /Spalten/i }));
  await user.click(await screen.findByText('Funktion'));
  expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(['rufname', 'issi', 'funktion']));
});
