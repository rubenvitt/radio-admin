import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useDevices } from './useDevices';

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test('fetches the paged device list with encoded params', async () => {
  const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        rows: [{ id: '1', issi: '1001', updateStatus: 'aktuell' }],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );

  const { result } = renderHook(
    () => useDevices({ q: 'funk', page: 1, pageSize: 20 }),
    { wrapper },
  );

  await waitFor(() => expect(result.current.data?.rows[0]?.updateStatus).toBe('aktuell'));
  expect(result.current.data?.total).toBe(1);

  const url = spy.mock.calls[0]?.[0] as string;
  expect(url).toContain('/api/devices?');
  expect(url).toContain('q=funk');
  expect(url).toContain('page=1');
  expect(url).toContain('pageSize=20');
  expect(spy).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ credentials: 'include' }),
  );
});
