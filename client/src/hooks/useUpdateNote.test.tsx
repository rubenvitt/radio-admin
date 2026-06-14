import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useUpdateNote } from './useUpdateNote';

afterEach(() => vi.restoreAllMocks());
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test('POSTs the note text to the append endpoint', async () => {
  const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ id: 'd1', updateNote: '[x] y' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  const { result } = renderHook(() => useUpdateNote('d1'), { wrapper });
  await result.current.mutateAsync('ISSI weicht ab');
  await waitFor(() => expect(spy).toHaveBeenCalled());
  const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/devices/d1/update-note');
  expect(opts.method).toBe('POST');
  expect(JSON.parse(opts.body as string)).toEqual({ text: 'ISSI weicht ab' });
});
