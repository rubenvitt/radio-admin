import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DeviceList } from './DeviceList';

// Drive the admin/non-admin branch via the auth hook directly.
const isAdmin = { value: true };
vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ isAdmin: isAdmin.value }),
}));

beforeEach(() => {
  isAdmin.value = true;
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ rows: [], total: 0, page: 1, pageSize: 20 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
});

afterEach(() => vi.restoreAllMocks());

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DeviceList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('admin: Exportieren triggers a download of the export endpoint', async () => {
  const user = userEvent.setup();
  // The export uses a programmatic anchor click rather than navigation.
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      // Assert the href points at the same-origin export endpoint.
      expect(this.getAttribute('href')).toBe('/api/devices/export');
    });

  renderList();
  await user.click(await screen.findByRole('button', { name: /Exportieren/i }));

  expect(clickSpy).toHaveBeenCalledTimes(1);
});

test('non-admin: no Exportieren button', async () => {
  isAdmin.value = false;
  renderList();
  await waitFor(() => expect(screen.queryByRole('button', { name: /Exportieren/i })).toBeNull());
});
