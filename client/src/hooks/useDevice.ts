import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { DeviceListItem } from './useDevices';

/**
 * The device-detail response. Extends the list item with the resolved audit
 * display names returned only by `GET /api/devices/:id` (the list endpoint does
 * NOT include these). Each name falls back to the raw sub server-side, so it is
 * null only when the underlying createdBy/updatedBy is null.
 */
export type DeviceDetail = DeviceListItem & {
  createdByName: string | null;
  updatedByName: string | null;
};

/** Fetch a single device (with computed `updateStatus` + resolved names) by id. */
export function useDevice(id: string | undefined) {
  return useQuery<DeviceDetail>({
    queryKey: ['device', id],
    queryFn: () => apiFetch<DeviceDetail>(`/api/devices/${id}`),
    enabled: !!id,
  });
}
