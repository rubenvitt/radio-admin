import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DeviceRecord, UpdateStatus } from '@ra/shared';
import { apiFetch } from '../api/client';

export type DeviceListItem = DeviceRecord & { updateStatus: UpdateStatus };

export interface DeviceListParams {
  q?: string;
  status?: string;
  location?: string;
  updateStatus?: UpdateStatus;
  sort?: string;
  page: number;
  pageSize: number;
}

/**
 * Server list response. Mirrors the `listDevices` repo shape
 * (`{ rows, total, page, pageSize }`) — NOT the `{ items, total }` shape the
 * plan stub assumed; the server route is the source of truth.
 */
export interface DeviceListResponse {
  rows: DeviceListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function toDeviceQueryString(params: DeviceListParams): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.status) sp.set('status', params.status);
  if (params.location) sp.set('location', params.location);
  if (params.updateStatus) sp.set('updateStatus', params.updateStatus);
  if (params.sort) sp.set('sort', params.sort);
  sp.set('page', String(params.page));
  sp.set('pageSize', String(params.pageSize));
  return sp.toString();
}

export function useDevices(params: DeviceListParams) {
  return useQuery<DeviceListResponse>({
    queryKey: ['devices', params],
    queryFn: () => apiFetch<DeviceListResponse>(`/api/devices?${toDeviceQueryString(params)}`),
    placeholderData: keepPreviousData,
  });
}
