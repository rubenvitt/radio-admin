import { useMutation } from '@tanstack/react-query';
import { apiUpload } from '../api/client';

export interface ImportParseResult {
  columns: string[];
  rows: string[][];
  detected: { delimiter: string; encoding: string };
}

/** Upload a CSV file (multipart field `file`) -> detected columns/rows/encoding. */
export function useImportParse() {
  return useMutation<ImportParseResult, Error, File>({
    mutationFn: (file) => {
      const form = new FormData();
      form.append('file', file);
      return apiUpload<ImportParseResult>('/api/import/parse', form);
    },
  });
}
