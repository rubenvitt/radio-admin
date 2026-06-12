import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import { RequireAuth } from './RequireAuth';

function wrapper(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal('location', { href: '' } as Location);
});
afterEach(() => vi.restoreAllMocks());

test('renders children when authenticated', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ name: 'Alice', role: 'admin' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  render(
    wrapper(
      <RequireAuth>
        <div>secret</div>
      </RequireAuth>,
    ),
  );
  await waitFor(() => expect(screen.getByText('secret')).toBeInTheDocument());
  expect(window.location.href).toBe('');
});

test('redirects to /api/auth/login when unauthenticated', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
  );
  render(
    wrapper(
      <RequireAuth>
        <div>secret</div>
      </RequireAuth>,
    ),
  );
  await waitFor(() => expect(window.location.href).toBe('/api/auth/login'));
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});
