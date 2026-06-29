import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { LoanRecord } from '@ra/shared';
import { apiFetch } from '../api/client';

export interface LoanListParams {
  page: number;
  pageSize: number;
}

/** Server overview response — mirrors the `listLoans` repo shape. */
export interface LoanListResponse {
  rows: LoanRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export function toLoanQueryString(params: LoanListParams): string {
  const sp = new URLSearchParams();
  sp.set('page', String(params.page));
  sp.set('pageSize', String(params.pageSize));
  return sp.toString();
}

export function useLoans(params: LoanListParams) {
  return useQuery<LoanListResponse>({
    queryKey: ['loans', params],
    queryFn: () => apiFetch<LoanListResponse>(`/api/loans?${toLoanQueryString(params)}`),
    placeholderData: keepPreviousData,
  });
}
