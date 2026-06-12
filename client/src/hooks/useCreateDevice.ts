import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeviceCreate, DeviceRecord } from '@ra/shared';
import { apiFetch } from '../api/client';

/** Admin-only device creation. Invalidates the list + suggestion caches on success. */
export function useCreateDevice() {
  const queryClient = useQueryClient();
  return useMutation<DeviceRecord, Error, DeviceCreate>({
    mutationFn: (body) => apiFetch<DeviceRecord>('/api/devices', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      void queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['software-versions'] });
    },
  });
}
