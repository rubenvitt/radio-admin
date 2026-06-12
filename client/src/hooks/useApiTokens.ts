import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

/** A token as returned by the list endpoint — never includes the secret. */
export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

/** POST /api/tokens response: the one-time plaintext `token` is included ONCE. */
export interface CreatedApiToken {
  id: string;
  name: string;
  token: string;
  prefix: string;
  createdAt: number;
}

const tokensQueryKey = ['api-tokens'] as const;

/**
 * GET /api/tokens — admin only. The server returns a BARE ARRAY here (not the
 * `{ values: [] }` envelope used by suggestion endpoints), so we type and read
 * it as `ApiToken[]` directly.
 */
export function useApiTokens() {
  return useQuery<ApiToken[]>({
    queryKey: tokensQueryKey,
    queryFn: () => apiFetch<ApiToken[]>('/api/tokens'),
  });
}

export function useCreateApiToken() {
  const queryClient = useQueryClient();
  return useMutation<CreatedApiToken, Error, { name: string }>({
    mutationFn: (body) => apiFetch<CreatedApiToken>('/api/tokens', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tokensQueryKey });
    },
  });
}

export function useRevokeApiToken() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiFetch<void>(`/api/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tokensQueryKey });
    },
  });
}
