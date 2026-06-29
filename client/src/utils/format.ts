/** Format an epoch-ms timestamp as a German locale date-time, or '—' when absent. */
export function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('de-DE');
}
