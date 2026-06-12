import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { DevicesPage } from './DevicesPage';

afterEach(() => vi.restoreAllMocks());

function renderAt(url: string) {
  const spy = vi.spyOn(global, 'fetch').mockImplementation((input) => {
    const reqUrl = String(input);
    const body = reqUrl.includes('/api/devices')
      ? { rows: [], total: 0, page: 1, pageSize: 20 }
      : reqUrl.includes('/api/auth/me')
        ? { name: 'Admin', role: 'admin' }
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
  const spy = renderAt('/devices?updateStatus=veraltet');

  // The device-list query fires server-side with the URL filter applied.
  await waitFor(() => {
    const calledWithFilter = spy.mock.calls.some(([input]) =>
      String(input).includes('/api/devices?') && String(input).includes('updateStatus=veraltet'),
    );
    expect(calledWithFilter).toBe(true);
  });

  // The filter Select reflects the seeded value.
  expect(screen.getByText('Veraltet')).toBeInTheDocument();
});
