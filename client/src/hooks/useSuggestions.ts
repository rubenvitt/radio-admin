import { useQuery } from '@tanstack/react-query';
import type { SuggestionField } from '@ra/shared';
import { apiFetch } from '../api/client';

export type { SuggestionField };

export function useSuggestions(field: SuggestionField) {
  return useQuery<string[]>({
    queryKey: ['suggestions', field],
    queryFn: () =>
      apiFetch<string[]>(`/api/suggestions?field=${encodeURIComponent(field)}`),
    staleTime: 60_000,
  });
}
