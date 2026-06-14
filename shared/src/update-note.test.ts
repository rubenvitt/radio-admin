import { describe, it, expect } from 'vitest';
import { appendUpdateNote } from './update-note';

const when = new Date('2026-06-14T10:00:00Z');

describe('appendUpdateNote', () => {
  it('creates the first line when existing is null/empty', () => {
    expect(appendUpdateNote(null, 'ISSI weicht ab: 999', 'Max', when)).toBe(
      '[2026-06-14 · Max] ISSI weicht ab: 999',
    );
    expect(appendUpdateNote('', 'x', 'Max', when)).toBe('[2026-06-14 · Max] x');
  });

  it('appends a new line, preserving existing content verbatim', () => {
    const existing = '[2026-06-01 · Eva] alt';
    expect(appendUpdateNote(existing, 'neu', 'Max', when)).toBe(
      '[2026-06-01 · Eva] alt\n[2026-06-14 · Max] neu',
    );
  });

  it('trims the new text but never the existing content', () => {
    expect(appendUpdateNote('  keep  ', '  spaces  ', 'Max', when)).toBe(
      '  keep  \n[2026-06-14 · Max] spaces',
    );
  });

  it('newlines in text cannot forge a second audit line (injection)', () => {
    const forged = 'ok\n[2020-01-01 · Hacker] geheim';
    const result = appendUpdateNote(null, forged, 'Max', when);
    // exactly one appended line, no smuggled second entry
    expect(result.split('\n')).toHaveLength(1);
    expect(result).toBe('[2026-06-14 · Max] ok [2020-01-01 · Hacker] geheim');
  });

  it('newlines and ] in author cannot forge entries', () => {
    const result = appendUpdateNote(null, 'x', 'Eve]\n[2020-01-01 · Root', when);
    expect(result.split('\n')).toHaveLength(1);
    expect(result).toBe('[2026-06-14 · Eve [2020-01-01 · Root] x');
  });
});
