import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { UpdateNotePanel } from './UpdateNotePanel';

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 'd1', updateNote: '[x] y' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
});
afterEach(() => vi.restoreAllMocks());

test('renders existing note and appends a new one', async () => {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UpdateNotePanel deviceId="d1" updateNote={'[2026-06-01 · Eva] alt'} />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/Eva\] alt/)).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText(/anhängen/i), 'neu');
  await user.click(screen.getByRole('button', { name: 'Hinzufügen' }));
  const calls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
  expect(calls.some(([url]) => url === '/api/devices/d1/update-note')).toBe(true);
});
