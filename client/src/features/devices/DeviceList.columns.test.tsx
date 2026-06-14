import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DeviceList } from './DeviceList';

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ isAdmin: false }) }));

// jsdom matchMedia always returns matches:false, so Grid.useBreakpoint() gives
// md:false (mobile). Force desktop so the Table (with Funktion column) renders.
vi.mock('antd', async (importOriginal) => {
  const antd = await importOriginal<typeof import('antd')>();
  return { ...antd, Grid: { ...antd.Grid, useBreakpoint: () => ({ md: true }) } };
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        rows: [{ id: '1', issi: '1001', funktion: 'Zugführer', deviceType: 'MRT', updateStatus: 'veraltet', updateNote: '[x] abweichung' }],
        total: 1, page: 1, pageSize: 20,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DeviceList /></MemoryRouter>
    </QueryClientProvider>,
  );
}

test('shows the Funktion column value and the Abweichung marker by default', async () => {
  renderList();
  expect(await screen.findByText('Zugführer')).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByLabelText('Abweichung gemeldet').length).toBeGreaterThan(0));
});
