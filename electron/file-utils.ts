import * as fs from 'fs/promises';
import * as path from 'path';
import chardet from 'chardet';
import * as iconv from 'iconv-lite';
import * as Papa from 'papaparse';

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

  // 1. 检测编码
  const encoding = chardet.detect(buffer) || 'UTF-8';

  // 2. 转换内容
  let content = '';
  if (encoding === 'UTF-8') {
    content = buffer.toString('utf8');
  } else {
    content = iconv.decode(buffer, encoding);
  }

  // 3. 解析 CSV
  let parseResult = Papa.parse<string[]>(content, {
    skipEmptyLines: true,
  });

  // 兼容外部来源使用 LF/CR 换行符的场景，首次解析报错时自动回退。
  if (parseResult.errors.length > 0) {
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const retryResult = Papa.parse<string[]>(normalizedContent, {
      skipEmptyLines: true,
      newline: '\n',
    });

    if (retryResult.errors.length < parseResult.errors.length) {
      parseResult = retryResult;
    }
  }

  return {
    encoding,
    headers: parseResult.data[0] || [],
    rows: parseResult.data.slice(1).map((cells: any, index: number) => ({
      rowIndex: index,
      cells,
      key: cells[0], // 默认第一列为 Key
    })),
  };
}
