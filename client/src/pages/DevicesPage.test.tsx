import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { DevicesPage } from './DevicesPage';

afterEach(() => vi.restoreAllMocks());

function renderAt(url: string) {
  const spy = vi.spyOn(global, 'fetch').mockImplementation((input) => {
    const reqUrl = String(input);
    const body = reqUrl.includes('/api/devices?')
      ? { rows: [], total: 0, page: 1, pageSize: 20 }
      : reqUrl.includes('/api/auth/me')
        ? { name: 'Admin', role: 'admin' }
        : reqUrl.includes('/api/suggestions')
          ? { values: [] } // suggestions return an envelope, not a bare array
          : reqUrl.includes('/api/software-versions')
            ? []
            : {};
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/devices" element={<DevicesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return spy;
}

test('seeds the updateStatus filter from the URL query param', async () => {
  const user = userEvent.setup();
  const spy = renderAt('/devices?updateStatus=veraltet');

  // The device-list query fires server-side with the URL filter applied.
  await waitFor(() => {
    const calledWithFilter = spy.mock.calls.some(([input]) =>
      String(input).includes('/api/devices?') && String(input).includes('updateStatus=veraltet'),
    );
    expect(calledWithFilter).toBe(true);
  });

  // The filter panel reflects the seeded value.
  await user.click(screen.getByRole('button', { name: /Filter/i }));
  expect(await screen.findByText('Veraltet')).toBeInTheDocument();
});

test('seeds the status filter from the URL query param', async () => {
  const user = userEvent.setup();
  const spy = renderAt('/devices?status=Defekt');

  await waitFor(() => {
    const calledWithFilter = spy.mock.calls.some(
      ([input]) => String(input).includes('/api/devices?') && String(input).includes('status=Defekt'),
    );
    expect(calledWithFilter).toBe(true);
  });
  await user.click(screen.getByRole('button', { name: /Filter/i }));
  expect(await screen.findByText('Defekt')).toBeInTheDocument();
});

test('applying a Status filter in the drawer updates the device-list query', async () => {
  const user = userEvent.setup();
  const spy = renderAt('/devices');

  // Wait for the initial (unfiltered) list query.
  await waitFor(() => {
    expect(spy.mock.calls.some(([input]) => String(input).includes('/api/devices?'))).toBe(true);
  });

  // Open the filter drawer, pick a Status, apply.
  await user.click(screen.getByRole('button', { name: /Filter/i }));
  await user.click(await screen.findByLabelText('Status'));
  await user.click(await screen.findByText('Wartung'));
  await user.click(screen.getByRole('button', { name: 'Anwenden' }));

  await waitFor(() => {
    const calledWithFilter = spy.mock.calls.some(
      ([input]) =>
        String(input).includes('/api/devices?') && String(input).includes('status=Wartung'),
    );
    expect(calledWithFilter).toBe(true);
  });
});
