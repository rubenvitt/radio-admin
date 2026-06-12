import { useDevices } from './useDevices';

export interface DashboardStats {
  total: number;
  aktuell: number;
  veraltet: number;
  unbekannt: number;
  isLoading: boolean;
}

/**
 * Server-driven status counts: four `useDevices` queries with `pageSize: 1`,
 * reading each `total`. One unfiltered query for the grand total plus one per
 * updateStatus. Avoids client-side recomputation.
 */
export function useDashboardStats(): DashboardStats {
  const all = useDevices({ page: 1, pageSize: 1 });
  const aktuell = useDevices({ page: 1, pageSize: 1, updateStatus: 'aktuell' });
  const veraltet = useDevices({ page: 1, pageSize: 1, updateStatus: 'veraltet' });
  const unbekannt = useDevices({ page: 1, pageSize: 1, updateStatus: 'unbekannt' });

  return {
    total: all.data?.total ?? 0,
    aktuell: aktuell.data?.total ?? 0,
    veraltet: veraltet.data?.total ?? 0,
    unbekannt: unbekannt.data?.total ?? 0,
    isLoading:
      all.isLoading || aktuell.isLoading || veraltet.isLoading || unbekannt.isLoading,
  };
}
