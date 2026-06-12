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
        // Don't optimistically merge softwareVersion/lastUpdatedAt: the cached
        // `updateStatus` badge is derived from softwareVersion server-side, so a
        // local merge would show a stale badge until onSettled refetches. Let
        // those two fields (and the badge) update together on the brief refetch.
        const optimistic: Record<string, unknown> = { ...previous };
        for (const [key, value] of Object.entries(patch)) {
          if (key === 'softwareVersion' || key === 'lastUpdatedAt') continue;
          optimistic[key] = value;
        }
        queryClient.setQueryData<DeviceListItem>(['device', id], optimistic as DeviceListItem);
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
