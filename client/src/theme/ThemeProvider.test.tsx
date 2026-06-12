import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeProvider';

function Probe() {
  const { mode, toggle } = useTheme();
  return (
    <button onClick={toggle} data-testid="probe">
      {mode}
    </button>
  );
}

beforeEach(() => localStorage.clear());

test('defaults to light when no preference and no storage', () => {
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('probe')).toHaveTextContent('light');
});

test('toggle flips mode and persists to localStorage', async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  await user.click(screen.getByTestId('probe'));
  expect(screen.getByTestId('probe')).toHaveTextContent('dark');
  expect(localStorage.getItem('ra-theme')).toBe('dark');
});

test('reads initial mode from localStorage', () => {
  localStorage.setItem('ra-theme', 'dark');
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('probe')).toHaveTextContent('dark');
});
