/** Format a Date as YYYY-MM-DD in UTC (stable, locale-independent). */
function isoDate(when: Date): string {
  return when.toISOString().slice(0, 10);
}

/**
 * Append one timestamped, signed line to an Update-Anmerkung, never mutating
 * existing content. Returns the new full value. The new `text` is trimmed; the
 * existing value is preserved verbatim.
 */
export function appendUpdateNote(
  existing: string | null | undefined,
  text: string,
  author: string,
  when: Date,
): string {
  const line = `[${isoDate(when)} · ${author}] ${text.trim()}`;
  return existing && existing.length > 0 ? `${existing}\n${line}` : line;
}
