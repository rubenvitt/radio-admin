import { useMutation } from '@tanstack/react-query';
import type { FieldDiff, ImportCommit, ImportRowClass } from '@ra/shared';
import { apiFetch } from '../api/client';

export interface ImportRowResult {
  rowIndex: number;
  issi: string;
  class: ImportRowClass;
  changes: FieldDiff[];
  error?: string;
}

export interface ImportCommitResult {
  dryRun: boolean;
  summary: Record<ImportRowClass, number>;
  rows: ImportRowResult[];
}

/**
 * POST the import commit payload. `dryRun:true` returns the classification
 * preview; `dryRun:false` performs the transactional upsert. The `mapping` must
 * be field->0-based column index (issi required) per `importCommitSchema`.
 */
export function useImportCommit() {
  return useMutation<ImportCommitResult, Error, ImportCommit>({
    mutationFn: (payload) =>
      apiFetch<ImportCommitResult>('/api/import/commit', { method: 'POST', body: payload }),
  });
}
