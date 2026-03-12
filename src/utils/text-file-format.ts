import { TextFileFormat, TextLineEnding } from '../types';

export const DEFAULT_TEXT_ENCODING = 'UTF-8';
export const DEFAULT_TEXT_LINE_ENDING: TextLineEnding = 'CRLF';

export function getLineEndingChars(lineEnding: TextLineEnding = DEFAULT_TEXT_LINE_ENDING): string {
  switch (lineEnding) {
    case 'LF':
      return '\n';
    case 'CR':
      return '\r';
    case 'CRLF':
    default:
      return '\r\n';
  }
}

export function formatEncodingLabel(encoding: string, hasBom = false): string {
  if (!hasBom) return encoding;
  return `${encoding} with BOM`;
}

export function formatTextFileFormatLabel(format: Pick<TextFileFormat, 'encoding' | 'hasBom' | 'lineEnding'>): string {
  return `${formatEncodingLabel(format.encoding, format.hasBom)} · ${format.lineEnding}`;
}
