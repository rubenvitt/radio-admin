import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock('antd', async (importOriginal) => {
  const antd = await importOriginal<typeof import('antd')>();
  return { ...antd, Grid: { ...antd.Grid, useBreakpoint: () => ({ md: false }) } };
});

import { DeviceList } from './DeviceList';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ rows: [{ id: '1', issi: '1001', rufname: 'Alpha', funktion: 'Zugführer', deviceType: 'MRT', updateStatus: 'veraltet', updateNote: '[x] y' }], total: 1, page: 1, pageSize: 20 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
});
afterEach(() => vi.restoreAllMocks());

test('mobile card shows Funktion and the Abweichung marker', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DeviceList /></MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText(/Zugführer/)).toBeInTheDocument();
  expect(screen.getByLabelText('Abweichung gemeldet')).toBeInTheDocument();
});
