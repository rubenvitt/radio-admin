import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DeviceRecord, UpdateStatus } from '@ra/shared';
import { apiFetch } from '../api/client';

export type DeviceListItem = DeviceRecord & { updateStatus: UpdateStatus };

export interface DeviceListParams {
  q?: string;
  searchFields?: string[];
  updateStatus?: UpdateStatus;
  status?: string[];
  location?: string[];
  deviceType?: string[];
  funktion?: string[];
  hersteller?: string[];
  deviceModes?: string[];
  loanable?: boolean;
  alamosIntegrated?: boolean;
  hasUpdateNote?: boolean;
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
  const csv = (key: string, arr?: string[]) => {
    if (arr && arr.length) sp.set(key, arr.join(','));
  };
  csv('searchFields', params.searchFields);
  csv('status', params.status);
  csv('location', params.location);
  csv('deviceType', params.deviceType);
  csv('funktion', params.funktion);
  csv('hersteller', params.hersteller);
  csv('deviceModes', params.deviceModes);
  if (params.updateStatus) sp.set('updateStatus', params.updateStatus);
  if (params.loanable) sp.set('loanable', '1');
  if (params.alamosIntegrated) sp.set('alamosIntegrated', '1');
  if (params.hasUpdateNote) sp.set('hasUpdateNote', '1');
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
