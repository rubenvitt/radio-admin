import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useSuggestions } from './useSuggestions';

afterEach(() => vi.restoreAllMocks());
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test('fetches suggestions and unwraps the server { values } envelope', async () => {
  // The server responds with `{ values: string[] }`, not a bare array.
  const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ values: ['Kdow', 'MTW'] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const { result } = renderHook(() => useSuggestions('location'), { wrapper });
  await waitFor(() => expect(result.current.data).toEqual(['Kdow', 'MTW']));
  expect(spy).toHaveBeenCalledWith(
    '/api/suggestions?field=location',
    expect.objectContaining({ credentials: 'include' }),
  );
});
