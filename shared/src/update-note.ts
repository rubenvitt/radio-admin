/** Format a Date as YYYY-MM-DD in UTC (stable, locale-independent). */
function isoDate(when: Date): string {
  return when.toISOString().slice(0, 10);
}

/**
 * Collapse any line breaks (CR/LF) into single spaces so a single appended entry
 * can never span more than one line. This is the integrity guarantee that keeps
 * the append-only log forge-proof — see `appendUpdateNote`.
 */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ');
}

/**
 * Append one timestamped, signed line to an Update-Anmerkung, never mutating
 * existing content. Returns the new full value. The new `text` is trimmed; the
 * existing value is preserved verbatim.
 *
 * Integrity guarantee: each call appends **exactly one** line. `text` and
 * `author` are sanitized — embedded newlines are collapsed to spaces and `]` is
 * stripped from `author` — so neither argument can forge a second
 * `[date · author]` audit entry (audit-trail injection).
 */
export function appendUpdateNote(
  existing: string | null | undefined,
  text: string,
  author: string,
  when: Date,
): string {
  const safeAuthor = singleLine(author).replace(/]/g, '').trim();
  const safeText = singleLine(text.trim());
  const line = `[${isoDate(when)} · ${safeAuthor}] ${safeText}`;
  return existing && existing.length > 0 ? `${existing}\n${line}` : line;
}
