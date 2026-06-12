import chardet from 'chardet';
import iconv from 'iconv-lite';

export interface DecodedCsv {
  text: string;
  encoding: string;
}

/**
 * Detects the byte encoding (chardet), decodes to a UTF-8 JS string (iconv-lite),
 * and strips a leading BOM. Falls back to UTF-8 if detection fails or reports an
 * encoding iconv-lite does not support.
 */
export function decodeCsv(buffer: Buffer): DecodedCsv {
  if (buffer.length === 0) {
    throw new Error('Leere Datei');
  }
  const detected = chardet.detect(buffer) ?? 'UTF-8';
  const encoding = iconv.encodingExists(detected) ? detected : 'UTF-8';
  let text = iconv.decode(buffer, encoding);
  // Strip a leading BOM (U+FEFF) if iconv left one in place.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return { text, encoding };
}
