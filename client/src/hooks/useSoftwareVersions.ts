import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export interface SoftwareVersionItem {
  value: string;
  createdAt: number;
  /** True for the current reference version (newest version assigned to a device). */
  reference: boolean;
}

export function useSoftwareVersions() {
  return useQuery<SoftwareVersionItem[]>({
    queryKey: ['software-versions'],
    queryFn: () => apiFetch<SoftwareVersionItem[]>('/api/software-versions'),
    staleTime: 60_000,
  });
}
