import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export interface SoftwareVersionItem {
  id: string;
  value: string;
  createdAt: number;
  /** Manual display order; higher = further up the list. */
  sortOrder: number;
  /** True for the explicit target version (the value that makes a device 'aktuell'). */
  isTarget: boolean;
  /** Number of devices currently carrying this version string. */
  deviceCount: number;
}

const versionsQueryKey = ['software-versions'] as const;

export function useSoftwareVersions() {
  return useQuery<SoftwareVersionItem[]>({
    queryKey: versionsQueryKey,
    queryFn: () => apiFetch<SoftwareVersionItem[]>('/api/software-versions'),
    staleTime: 60_000,
  });
}

/**
 * Invalidate the version list AND the device list/stats: changing the target (or
 * removing a version) shifts every device's computed update status.
 */
function invalidateVersionsAndDevices(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: versionsQueryKey });
  void queryClient.invalidateQueries({ queryKey: ['devices'] });
}

export function useCreateSoftwareVersion() {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; value: string }, Error, { value: string }>({
    mutationFn: (body) => apiFetch('/api/software-versions', { method: 'POST', body }),
    onSuccess: () => invalidateVersionsAndDevices(queryClient),
  });
}

export function useSetTargetVersion() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiFetch<void>(`/api/software-versions/${id}/target`, { method: 'POST' }),
    onSuccess: () => invalidateVersionsAndDevices(queryClient),
  });
}

export function useDeleteSoftwareVersion() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiFetch<void>(`/api/software-versions/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateVersionsAndDevices(queryClient),
  });
}

export function useReorderSoftwareVersions() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string[]>({
    mutationFn: (ids) => apiFetch<void>('/api/software-versions/order', { method: 'PATCH', body: { ids } }),
    onSuccess: () => invalidateVersionsAndDevices(queryClient),
  });
}
