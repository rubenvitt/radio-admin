import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

/**
 * DELETE a device (admin-only on the server). On success, drop the cached detail
 * entry and invalidate the list so the removed device disappears immediately.
 * The 204 response carries no body; apiFetch resolves to undefined.
 */
export function useDeleteDevice(id: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => apiFetch<void>(`/api/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['device', id] });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}
