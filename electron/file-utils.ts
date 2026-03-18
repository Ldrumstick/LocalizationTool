import * as fs from 'fs/promises';
import * as path from 'path';
import chardet from 'chardet';
import * as iconv from 'iconv-lite';
import * as Papa from 'papaparse';
import type { TextFileFormat, TextLineEnding } from '../src/types';

const UTF8_BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
const UTF16LE_BOM = Buffer.from([0xFF, 0xFE]);
const UTF16BE_BOM = Buffer.from([0xFE, 0xFF]);

function isAsciiOnly(buffer: Buffer): boolean {
  return buffer.every((byte) => byte <= 0x7F);
}

function detectBom(buffer: Buffer): { hasBom: boolean; encoding?: string; byteLength: number } {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(UTF8_BOM)) {
    return { hasBom: true, encoding: 'UTF-8', byteLength: 3 };
  }

  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(UTF16LE_BOM)) {
    return { hasBom: true, encoding: 'UTF-16LE', byteLength: 2 };
  }

  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(UTF16BE_BOM)) {
    return { hasBom: true, encoding: 'UTF-16BE', byteLength: 2 };
  }

  return { hasBom: false, byteLength: 0 };
}

function normalizeDetectedEncoding(rawEncoding: string | null | undefined, buffer: Buffer, bomEncoding?: string): string {
  if (bomEncoding) return bomEncoding;
  if (isAsciiOnly(buffer)) return 'UTF-8';

  const normalized = String(rawEncoding || 'UTF-8').trim().toUpperCase();

  switch (normalized) {
    case 'UTF8':
    case 'UTF-8':
    case 'UTF-8-SIG':
    case 'ASCII':
      return 'UTF-8';
    case 'UTF16':
    case 'UTF-16':
    case 'UTF16LE':
    case 'UTF-16LE':
      return 'UTF-16LE';
    case 'UTF16BE':
    case 'UTF-16BE':
      return 'UTF-16BE';
    default:
      return normalized;
  }
}

function stripLeadingBomChar(content: string): string {
  return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}

// 仅统一引号外的记录分隔符，保留带引号字段中的真实多行文本。
function normalizeCsvRecordDelimiters(content: string): string {
  let inQuotes = false;
  let segmentStart = 0;
  const segments: string[] = [];

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (char === '"') {
      if (inQuotes && content[index + 1] === '"') {
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (inQuotes) continue;

    if (char === '\r') {
      const recordDelimiterLength = content[index + 1] === '\n' ? 2 : 1;
      segments.push(content.slice(segmentStart, index), '\n');
      segmentStart = index + recordDelimiterLength;

      if (recordDelimiterLength === 2) {
        index += 1;
      }

      continue;
    }

    if (char === '\n') {
      segments.push(content.slice(segmentStart, index), '\n');
      segmentStart = index + 1;
    }
  }

  if (segments.length === 0) {
    return content;
  }

  segments.push(content.slice(segmentStart));
  return segments.join('');
}

export function detectLineEnding(content: string): TextLineEnding {
  const match = content.match(/\r\n|\n|\r/);
  if (!match) return 'CRLF';

  switch (match[0]) {
    case '\n':
      return 'LF';
    case '\r':
      return 'CR';
    case '\r\n':
    default:
      return 'CRLF';
  }
}

export function encodeContentWithFormat(content: string, format: TextFileFormat): Buffer {
  const encoded = iconv.encode(content, format.encoding || 'UTF-8');
  if (!format.hasBom) return encoded;

  if (format.encoding === 'UTF-8') {
    return Buffer.concat([UTF8_BOM, encoded]);
  }

  if (format.encoding === 'UTF-16LE') {
    return Buffer.concat([UTF16LE_BOM, encoded]);
  }

  if (format.encoding === 'UTF-16BE') {
    return Buffer.concat([UTF16BE_BOM, encoded]);
  }

  return encoded;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

export function buildFileId(projectPath: string, filePath: string): string {
  const relativePath = normalizeRelativePath(path.relative(projectPath, filePath));
  return Buffer.from(relativePath).toString('base64');
}

export function resolveFilePathFromId(projectPath: string, fileId: string): string {
  const decoded = Buffer.from(fileId, 'base64').toString();
  // 兼容旧版：旧 ID 直接编码了绝对路径
  if (path.isAbsolute(decoded)) return decoded;
  return path.join(projectPath, decoded);
}

// 辅助函数：扫描目录下的所有 CSV 文件
export async function scanCSVFiles(dir: string): Promise<any[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const csvFiles = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
      const stats = await fs.stat(fullPath);
      const relativePath = normalizeRelativePath(path.relative(dir, fullPath));
      csvFiles.push({
        id: buildFileId(dir, fullPath),
        fileName: entry.name,
        filePath: fullPath,
        relativePath,
        lastModified: stats.mtimeMs,
      });
    }
  }

  return csvFiles;
}

// 辅助函数：读取并解码文件
export async function readFileAndDecode(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const bom = detectBom(buffer);

  // 1. 检测编码
  const encoding = normalizeDetectedEncoding(chardet.detect(buffer), buffer, bom.encoding);

  // 2. 转换内容
  const decodedContent = iconv.decode(buffer, encoding);
  const content = stripLeadingBomChar(decodedContent);
  const lineEnding = detectLineEnding(content);
  const normalizedContent = normalizeCsvRecordDelimiters(content);

  // 3. 解析 CSV
  const parseResult = Papa.parse<string[]>(normalizedContent, {
    skipEmptyLines: true,
    newline: '\n',
  });

  return {
    encoding,
    hasBom: bom.hasBom,
    lineEnding,
    headers: parseResult.data[0] || [],
    rows: parseResult.data.slice(1).map((cells: any, index: number) => ({
      rowIndex: index,
      cells,
      key: cells[0], // 默认第一列为 Key
    })),
  };
}
