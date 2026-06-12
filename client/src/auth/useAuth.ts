import { useQuery } from '@tanstack/react-query';
import type { Role } from '@ra/shared';
import { ApiError, apiFetch } from '../api/client';

export interface AuthUser {
  name: string;
  role: Role;
}

export const authMeQueryKey = ['auth', 'me'] as const;

export function useAuth() {
  const query = useQuery<AuthUser | null>({
    queryKey: authMeQueryKey,
    queryFn: async () => {
      try {
        return await apiFetch<AuthUser>('/api/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });

  const user = query.data ?? null;
  return {
    user,
    role: user?.role ?? null,
    isAdmin: user?.role === 'admin',
    isUpdater: user?.role === 'updater',
    isAuthenticated: user !== null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
