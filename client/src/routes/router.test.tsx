import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { routes } from './router';

afterEach(() => vi.restoreAllMocks());

function renderAt(path: string) {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ name: 'Alice', role: 'admin' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

test('/login renders without auth guard', () => {
  renderAt('/login');
  expect(screen.getByText(/anmelden/i)).toBeInTheDocument();
});

test('/403 renders forbidden notice', () => {
  renderAt('/403');
  expect(screen.getByText(/kein zugriff|zugriff verweigert/i)).toBeInTheDocument();
});

test('unknown route renders not found', async () => {
  renderAt('/does-not-exist');
  await waitFor(() => expect(screen.getByText(/nicht gefunden|404/i)).toBeInTheDocument());
});
