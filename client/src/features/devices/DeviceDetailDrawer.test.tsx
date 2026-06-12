import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import type { Role } from '@ra/shared';
import { DeviceDetailDrawer } from './DeviceDetailDrawer';

afterEach(() => vi.restoreAllMocks());

const device = {
  id: 'd1',
  rufname: 'Florian 1',
  issi: '1001',
  serialNumber: 'SN1',
  deviceType: 'MTM5400',
  status: 'Einsatzbereit',
  location: 'Wache',
  assignedTo: 'Zug 1',
  softwareVersion: 'FW 12.3',
  lastUpdatedAt: 1_700_000_000_000,
  notes: null,
  hiorgId: null,
  opta: null,
  funktion: null,
  hersteller: null,
  bedieneinheit: null,
  deviceModes: 'TMO,DMO',
  alamosIntegrated: true,
  createdAt: 1,
  updatedAt: 1,
  createdBy: null,
  updatedBy: null,
  updateStatus: 'aktuell',
};

function stubFetch(role: Role) {
  vi.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = String(input);
    const body = url.includes('/api/auth/me')
      ? { name: 'User', role }
      : url.includes('/api/devices/d1')
        ? device
        : url.includes('/api/software-versions') || url.includes('/api/suggestions')
          ? []
          : {};
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/devices/d1']}>
        <DeviceDetailDrawer deviceId="d1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('admin sees the delete control', async () => {
  stubFetch('admin');
  renderDrawer();
  await waitFor(() => expect(screen.getByRole('button', { name: /Gerät löschen/ })).toBeInTheDocument());
});

test('updater does not see the delete control', async () => {
  stubFetch('updater');
  renderDrawer();
  // The edit form renders once the device loads; the delete button must not.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /Gerät löschen/ })).not.toBeInTheDocument();
});
