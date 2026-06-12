import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export interface SoftwareVersionItem {
  id: string;
  value: string;
  createdAt: number;
  isLatest: boolean;
}

export function useSoftwareVersions() {
  return useQuery<SoftwareVersionItem[]>({
    queryKey: ['software-versions'],
    queryFn: () => apiFetch<SoftwareVersionItem[]>('/api/software-versions'),
    staleTime: 60_000,
  });
}
