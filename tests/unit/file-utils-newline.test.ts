import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { encodeContentWithFormat, readFileAndDecode } from '../../electron/file-utils';

describe('readFileAndDecode newline compatibility', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lt-newline-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should parse CSV with LF line endings', async () => {
    const filePath = path.join(tempDir, 'lf.csv');
    const content = 'Key,Value\nHELLO,World\nBYE,Done\n';
    await fs.writeFile(filePath, content, 'utf8');

    const result = await readFileAndDecode(filePath);

    expect(result.encoding).toBe('UTF-8');
    expect(result.hasBom).toBe(false);
    expect(result.lineEnding).toBe('LF');
    expect(result.headers).toEqual(['Key', 'Value']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].cells).toEqual(['HELLO', 'World']);
    expect(result.rows[1].cells).toEqual(['BYE', 'Done']);
  });

  it('should parse CSV with CR line endings', async () => {
    const filePath = path.join(tempDir, 'cr.csv');
    const content = 'Key,Value\rHELLO,World\rBYE,Done\r';
    await fs.writeFile(filePath, content, 'utf8');

    const result = await readFileAndDecode(filePath);

    expect(result.encoding).toBe('UTF-8');
    expect(result.hasBom).toBe(false);
    expect(result.lineEnding).toBe('CR');
    expect(result.headers).toEqual(['Key', 'Value']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].cells).toEqual(['HELLO', 'World']);
    expect(result.rows[1].cells).toEqual(['BYE', 'Done']);
  });

  it('should parse CSV with mixed CRLF and LF record delimiters', async () => {
    const filePath = path.join(tempDir, 'mixed.csv');
    const content = 'Key,Value\r\nHELLO,World\nBYE,Done\r\n';
    await fs.writeFile(filePath, content, 'utf8');

    const result = await readFileAndDecode(filePath);

    expect(result.lineEnding).toBe('CRLF');
    expect(result.headers).toEqual(['Key', 'Value']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].cells).toEqual(['HELLO', 'World']);
    expect(result.rows[1].cells).toEqual(['BYE', 'Done']);
  });

  it('should preserve quoted newlines while normalizing mixed record delimiters', async () => {
    const filePath = path.join(tempDir, 'mixed-quoted.csv');
    const content = 'Key,Value\r\nHELLO,\"Line1\r\nLine2\"\nBYE,Done\r\n';
    await fs.writeFile(filePath, content, 'utf8');

    const result = await readFileAndDecode(filePath);

    expect(result.headers).toEqual(['Key', 'Value']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].cells).toEqual(['HELLO', 'Line1\r\nLine2']);
    expect(result.rows[1].cells).toEqual(['BYE', 'Done']);
  });

  it('should detect UTF-8 BOM and preserve it when re-encoding', async () => {
    const filePath = path.join(tempDir, 'utf8-bom.csv');
    const content = Buffer.concat([
      Buffer.from([0xEF, 0xBB, 0xBF]),
      Buffer.from('Key,Value\r\nHELLO,World\r\n', 'utf8')
    ]);
    await fs.writeFile(filePath, content);

    const result = await readFileAndDecode(filePath);
    const encoded = encodeContentWithFormat('Key,Value\r\nHELLO,World\r\n', {
      encoding: result.encoding,
      hasBom: result.hasBom,
      lineEnding: result.lineEnding
    });

    expect(result.encoding).toBe('UTF-8');
    expect(result.hasBom).toBe(true);
    expect(result.lineEnding).toBe('CRLF');
    expect(Array.from(encoded.subarray(0, 3))).toEqual([0xEF, 0xBB, 0xBF]);
  });
});
