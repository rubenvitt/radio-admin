import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { DeviceListItem } from './useDevices';

/** Fetch a single device (with computed `updateStatus`) by id. */
export function useDevice(id: string | undefined) {
  return useQuery<DeviceListItem>({
    queryKey: ['device', id],
    queryFn: () => apiFetch<DeviceListItem>(`/api/devices/${id}`),
    enabled: !!id,
  });
}
