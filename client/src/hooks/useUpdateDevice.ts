import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DevicePatch } from '@ra/shared';
import { apiFetch } from '../api/client';
import type { DeviceListItem } from './useDevices';

/**
 * PATCH a device with an optimistic cache update on `['device', id]`, rollback
 * on error, and invalidation of both the detail and list queries on settle.
 */
export function useUpdateDevice(id: string) {
  const queryClient = useQueryClient();
  return useMutation<DeviceListItem, Error, DevicePatch, { previous?: DeviceListItem }>({
    mutationFn: (patch) =>
      apiFetch<DeviceListItem>(`/api/devices/${id}`, { method: 'PATCH', body: patch }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['device', id] });
      const previous = queryClient.getQueryData<DeviceListItem>(['device', id]);
      if (previous) {
        queryClient.setQueryData<DeviceListItem>(['device', id], { ...previous, ...patch });
      }
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['device', id], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['device', id] });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}
