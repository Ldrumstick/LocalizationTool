import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { readFileAndDecode } from '../../electron/file-utils';

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

    expect(result.headers).toEqual(['Key', 'Value']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].cells).toEqual(['HELLO', 'World']);
    expect(result.rows[1].cells).toEqual(['BYE', 'Done']);
  });

  it('should parse CSV with CR line endings via fallback', async () => {
    const filePath = path.join(tempDir, 'cr.csv');
    const content = 'Key,Value\rHELLO,World\rBYE,Done\r';
    await fs.writeFile(filePath, content, 'utf8');

    const result = await readFileAndDecode(filePath);

    expect(result.headers).toEqual(['Key', 'Value']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].cells).toEqual(['HELLO', 'World']);
    expect(result.rows[1].cells).toEqual(['BYE', 'Done']);
  });
});
