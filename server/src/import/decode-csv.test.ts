import { describe, it, expect } from 'vitest';
import iconv from 'iconv-lite';
import { decodeCsv } from './decode-csv';

describe('decodeCsv', () => {
  it('decodes a cp1252 (latin1) buffer with German umlauts to correct UTF-8 string', () => {
    const original = 'Rufname;Standort\nGerät;Köln\n';
    const buf = iconv.encode(original, 'win1252');
    const { text, encoding } = decodeCsv(buf);
    expect(text).toContain('Gerät');
    expect(text).toContain('Köln');
    // chardet may report windows-1252 / ISO-8859-1; both are latin-family
    expect(encoding.toLowerCase()).toMatch(/1252|8859|latin/);
  });

  it('decodes a UTF-8 buffer unchanged', () => {
    const buf = Buffer.from('a;b\nGrün;Süd\n', 'utf8');
    const { text } = decodeCsv(buf);
    expect(text).toContain('Grün');
    expect(text).toContain('Süd');
  });

  it('strips a UTF-8 BOM from the start of the decoded text', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('issi;rufname\n', 'utf8')]);
    const { text } = decodeCsv(buf);
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(text.startsWith('issi')).toBe(true);
  });

  it('throws on an empty buffer', () => {
    expect(() => decodeCsv(Buffer.alloc(0))).toThrow();
  });
});
