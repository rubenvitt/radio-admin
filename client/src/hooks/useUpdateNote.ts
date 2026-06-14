import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { DeviceListItem } from './useDevices';

/** Append an Update-Anmerkung line to a device (append-only on the server). */
export function useUpdateNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation<DeviceListItem, Error, string>({
    mutationFn: (text) =>
      apiFetch<DeviceListItem>(`/api/devices/${id}/update-note`, {
        method: 'POST',
        body: { text },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['device', id] });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}
