import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import iconv from 'iconv-lite';
import { setupWatcher, stopWatcher, updateLastSaveTime } from './watcher';
import { scanCSVFiles, readFileAndDecode } from './file-utils';
import { checkForUpdates, initializeUpdateService } from './update-service';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 鍒涘缓鑿滃崟
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:open-project');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Save All',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:trigger-save');
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('update:show-dialog', { reason: 'manual' });
            }
            void checkForUpdates(true);
          }
        },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 杈呭姪鍑芥暟宸茬Щ鍔ㄥ埌 file-utils.ts

// IPC 澶勭悊锛氭墦寮€椤圭洰
ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const projectPath = result.filePaths[0];
  const files = await scanCSVFiles(projectPath);

  // 鍚姩鏂囦欢鐩戝惉
  if (mainWindow) {
    setupWatcher(mainWindow, projectPath);
  }

  return {
    projectPath,
    files,
  };
});

// 杈呭姪鍑芥暟宸茬Щ鍔ㄥ埌 file-utils.ts

// IPC 澶勭悊锛氳鍙?CSV 鏂囦欢鍐呭
ipcMain.handle('file:read', async (_event, filePath: string) => {
  try {
    return await readFileAndDecode(filePath);
  } catch (error: any) {
    console.error(`璇诲彇鏂囦欢澶辫触: ${filePath}`, error);
    throw error;
  }
});

// IPC 澶勭悊锛氬叏椤圭洰鎼滅储
type SearchParams = {
  projectPath: string;
  query: string;
  isRegExp: boolean;
  isCaseSensitive?: boolean;
  isGlobalSearch: boolean;
  selectedFileId?: string;
  ignoredFileIds?: string[];
  maxResults?: number;
};

type SearchResultItem = {
  fileId: string;
  rowIndex: number;
  colIndex: number;
  key: string;
  context: string;
};

type SearchExecuteResult = {
  results: SearchResultItem[];
  hasMore: boolean;
  cancelled: boolean;
};

async function executeProjectSearch(
  params: SearchParams,
  onChunk?: (chunk: SearchResultItem[]) => void,
  shouldCancel?: () => boolean
): Promise<SearchExecuteResult> {
  const {
    projectPath,
    query,
    isRegExp,
    isCaseSensitive,
    isGlobalSearch,
    selectedFileId,
    ignoredFileIds,
    maxResults
  } = params;

  const parsedLimit = Number(maxResults);
  const hardLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : Number.POSITIVE_INFINITY;
  const useChunkMode = typeof onChunk === 'function';
  const chunkSize = 200;
  const results: SearchResultItem[] = [];
  let chunkBuffer: SearchResultItem[] = [];
  let matchCount = 0;
  let hasMore = false;

  const emit = async (item: SearchResultItem) => {
    if (!useChunkMode) {
      results.push(item);
      return;
    }
    chunkBuffer.push(item);
    if (chunkBuffer.length >= chunkSize) {
      onChunk(chunkBuffer);
      chunkBuffer = [];
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  const flushChunk = async () => {
    if (!useChunkMode || chunkBuffer.length === 0) return;
    onChunk(chunkBuffer);
    chunkBuffer = [];
    await new Promise((resolve) => setImmediate(resolve));
  };

  let filesToSearch: { path: string; id: string }[] = [];
  if (isGlobalSearch) {
    const allFiles = await scanCSVFiles(projectPath);
    const ignoredSet = new Set(ignoredFileIds || []);
    filesToSearch = allFiles
      .filter((f: any) => !ignoredSet.has(f.id))
      .map((f: any) => ({ path: f.filePath, id: f.id }));
  } else if (selectedFileId) {
    const filePath = Buffer.from(selectedFileId, 'base64').toString();
    filesToSearch = [{ path: filePath, id: selectedFileId }];
  }

  let regex: RegExp | null = null;
  let searchTerms: string[] = [];
  const flags = isCaseSensitive ? 'g' : 'gi';

  if (isRegExp) {
    regex = new RegExp(query, flags);
  } else {
    const trimmedQuery = query.trim();
    if (trimmedQuery.includes(' ')) {
      searchTerms = trimmedQuery.split(/\s+/).filter((t: string) => t.length > 0);
      if (searchTerms.length === 0) {
        return { results: [], hasMore: false, cancelled: false };
      }
    } else {
      const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(pattern, flags);
    }
  }

  outerLoop:
  for (const fileInfo of filesToSearch) {
    if (shouldCancel?.()) {
      return { results: [], hasMore: false, cancelled: true };
    }
    try {
      const { rows } = await readFileAndDecode(fileInfo.path);
      for (const row of rows as any[]) {
        for (let colIndex = 0; colIndex < row.cells.length; colIndex++) {
          if (shouldCancel?.()) {
            return { results: [], hasMore: false, cancelled: true };
          }
          const cell = row.cells[colIndex] as string;
          if (!cell) continue;

          let isMatch = false;
          if (regex) {
            regex.lastIndex = 0;
            if (regex.test(cell)) isMatch = true;
          } else {
            const target = isCaseSensitive ? cell : cell.toLowerCase();
            isMatch = searchTerms.every(term => {
              const t = isCaseSensitive ? term : term.toLowerCase();
              return target.includes(t);
            });
          }

          if (!isMatch) continue;

          const item: SearchResultItem = {
            fileId: fileInfo.id,
            rowIndex: row.rowIndex,
            colIndex,
            key: row.key || '',
            context: cell.length > 50 ? `${cell.substring(0, 50)}...` : cell
          };
          await emit(item);

          matchCount += 1;
          if (matchCount >= hardLimit) {
            hasMore = true;
            break outerLoop;
          }
        }
      }
    } catch (err) {
      console.warn(`鎼滅储鏂囦欢澶辫触: ${fileInfo.path}`, err);
    }
  }

  await flushChunk();
  return { results, hasMore, cancelled: false };
}

// IPC 澶勭悊锛氬叏椤圭洰鎼滅储
ipcMain.handle('project:search', async (_event, params: SearchParams) => {
  try {
    const { results, hasMore } = await executeProjectSearch(params);
    return { results, hasMore };
  } catch (error) {
    console.error('鎼滅储鎵ц澶辫触:', error);
    return { results: [], hasMore: false };
  }
});

const searchStreamTasks = new Map<string, { cancelled: boolean }>();

ipcMain.on('project:search-stream:start', async (event, payload: SearchParams & { requestId: string }) => {
  const { requestId, ...params } = payload || {};
  if (!requestId) return;

  const task = { cancelled: false };
  searchStreamTasks.set(requestId, task);

  try {
    const result = await executeProjectSearch(
      params,
      (chunk) => {
        if (task.cancelled || chunk.length === 0) return;
        event.sender.send('project:search-stream:chunk', { requestId, chunk });
      },
      () => task.cancelled
    );

    if (!task.cancelled) {
      event.sender.send('project:search-stream:done', {
        requestId,
        hasMore: result.hasMore,
        cancelled: result.cancelled
      });
    }
  } catch (error: any) {
    if (!task.cancelled) {
      event.sender.send('project:search-stream:done', {
        requestId,
        hasMore: false,
        cancelled: false,
        error: error?.message || 'search failed'
      });
    }
  } finally {
    searchStreamTasks.delete(requestId);
  }
});

ipcMain.on('project:search-stream:cancel', (_event, payload: { requestId: string }) => {
  const requestId = payload?.requestId;
  if (!requestId) return;
  const task = searchStreamTasks.get(requestId);
  if (task) {
    task.cancelled = true;
  }
});
// IPC 澶勭悊锛氭瀯寤洪」鐩?Key 绱㈠紩
ipcMain.handle('project:build-index', async (_event, projectPath: string) => {
  try {
    const allFiles = await scanCSVFiles(projectPath);
    const index: Record<string, string[]> = {};

    // 骞跺彂澶勭悊鏂囦欢璇诲彇锛屾彁楂橀€熷害
    await Promise.all(allFiles.map(async (file: any) => {
      try {
        const { rows } = await readFileAndDecode(file.filePath);
        // 鎻愬彇姣忎竴琛岀殑绗竴鍒椾綔涓?Key
        const keys = rows.map((row: any) => row.cells[0] || '');
        index[file.id] = keys;
      } catch (error) {
        console.error(`绱㈠紩鏋勫缓澶辫触: ${file.fileName}`, error);
        index[file.id] = [];
      }
    }));

    return index;
  } catch (error) {
    console.error('鏋勫缓绱㈠紩澶辫触:', error);
    throw error;
  }
});

const CONFIG_FILENAME = '.localization.config.json';

// IPC 澶勭悊锛氫繚瀛樻枃浠?
ipcMain.handle('file:save', async (_event, { filePath, content, encoding }) => {
  try {
    // 1. 缂栫爜杞崲 (榛樿 UTF-8)
    const buffer = iconv.encode(content, encoding || 'UTF-8');
    
    // 2. 鍐欏叆鏂囦欢
    await fs.writeFile(filePath, buffer);
    
    // 鏇存柊鏈€鍚庝繚瀛樻椂闂达紝閬垮厤 Watcher 鑷Е鍙?
    updateLastSaveTime(filePath);

    // 3. 鑾峰彇鏈€鏂颁慨鏀规椂闂?
    const stats = await fs.stat(filePath);
    
    return { 
      success: true, 
      lastModified: stats.mtimeMs 
    };
  } catch (error: any) {
    console.error(`淇濆瓨鏂囦欢澶辫触: ${filePath}`, error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// IPC 澶勭悊锛氳鍙栭厤缃枃浠?
ipcMain.handle('config:read', async (_event, projectPath: string) => {
  try {
    const configPath = path.join(projectPath, CONFIG_FILENAME);
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    // 濡傛灉鏂囦欢涓嶅瓨鍦紝杩斿洖 null锛屽墠绔細澶勭悊榛樿鍊?
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error(`璇诲彇閰嶇疆鏂囦欢澶辫触: ${projectPath}`, error);
    throw error;
  }
});

// IPC 澶勭悊锛氫繚瀛橀厤缃枃浠?
ipcMain.handle('config:save', async (_event, { projectPath, config }) => {
  try {
    const configPath = path.join(projectPath, CONFIG_FILENAME);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (error: any) {
    console.error(`淇濆瓨閰嶇疆鏂囦欢澶辫触: ${projectPath}`, error);
    throw error;
  }
});

app.whenReady().then(() => {
  initializeUpdateService(() => mainWindow);
  createWindow();
  void checkForUpdates(false);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopWatcher();
    app.quit();
  }
});

