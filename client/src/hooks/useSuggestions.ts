import { useQuery } from '@tanstack/react-query';
import type { SuggestionField } from '@ra/shared';
import { apiFetch } from '../api/client';

export type { SuggestionField };

export function useSuggestions(field: SuggestionField) {
  return useQuery<string[]>({
    queryKey: ['suggestions', field],
    // The server responds with `{ values: string[] }`, not a bare array.
    queryFn: async () => {
      const res = await apiFetch<{ values: string[] }>(
        `/api/suggestions?field=${encodeURIComponent(field)}`,
      );
      return res.values;
    },
    staleTime: 60_000,
  });
}
