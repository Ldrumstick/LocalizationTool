import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import iconv from 'iconv-lite';
import { setupWatcher, stopWatcher, updateLastSaveTime } from './watcher';
import { scanCSVFiles, readFileAndDecode, resolveFilePathFromId } from './file-utils';
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

  // 构建应用菜单
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

// 辅助函数已移动到 file-utils.ts

// IPC：打开项目
ipcMain.handle('project:open', async (_event, requestedPath?: string) => {
  let projectPath = requestedPath?.trim() || '';

  if (!projectPath) {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    projectPath = result.filePaths[0];
  } else {
    try {
      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        return null;
      }
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  const files = await scanCSVFiles(projectPath);

  // 启动文件监听
  if (mainWindow) {
    setupWatcher(mainWindow, projectPath);
  }

  return {
    projectPath,
    files,
  };
});

// 辅助函数已移动到 file-utils.ts

// IPC：读取 CSV 文件内容
ipcMain.handle('file:read', async (_event, filePath: string) => {
  try {
    return await readFileAndDecode(filePath);
  } catch (error: any) {
    console.error(`读取文件失败: ${filePath}`, error);
    throw error;
  }
});

// IPC：全项目搜索
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
    const filePath = resolveFilePathFromId(projectPath, selectedFileId);
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
      console.warn(`搜索文件失败: ${fileInfo.path}`, err);
    }
  }

  await flushChunk();
  return { results, hasMore, cancelled: false };
}

// IPC：全项目搜索
ipcMain.handle('project:search', async (_event, params: SearchParams) => {
  try {
    const { results, hasMore } = await executeProjectSearch(params);
    return { results, hasMore };
  } catch (error) {
    console.error('搜索执行失败:', error);
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

// IPC：构建项目 Key 索引
ipcMain.handle('project:build-index', async (_event, projectPath: string) => {
  try {
    const allFiles = await scanCSVFiles(projectPath);
    const index: Record<string, string[]> = {};

    // 并发读取文件以提升速度
    await Promise.all(allFiles.map(async (file: any) => {
      try {
        const { rows } = await readFileAndDecode(file.filePath);
        // 提取每一行第一列作为 Key
        const keys = rows.map((row: any) => row.cells[0] || '');
        index[file.id] = keys;
      } catch (error) {
        console.error(`索引构建失败: ${file.fileName}`, error);
        index[file.id] = [];
      }
    }));

    return index;
  } catch (error) {
    console.error('构建索引失败:', error);
    throw error;
  }
});

const CONFIG_FILENAME = '.localization.config.json';

// IPC：保存文件
ipcMain.handle('file:save', async (_event, { filePath, content, encoding }) => {
  try {
    // 1. 编码转换（默认 UTF-8）
    const buffer = iconv.encode(content, encoding || 'UTF-8');

    // 2. 写入文件
    await fs.writeFile(filePath, buffer);

    // 更新最后保存时间，避免 Watcher 自触发
    updateLastSaveTime(filePath);

    // 3. 获取最新修改时间并返回给调用方
    const stats = await fs.stat(filePath);

    return {
      success: true,
      lastModified: stats.mtimeMs
    };
  } catch (error: any) {
    console.error(`保存文件失败: ${filePath}`, error);
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC：读取配置文件
ipcMain.handle('config:read', async (_event, projectPath: string) => {
  try {
    const configPath = path.join(projectPath, CONFIG_FILENAME);
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    // 配置文件不存在时返回 null，由前端处理默认值
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error(`读取配置文件失败: ${projectPath}`, error);
    throw error;
  }
});

// IPC：保存配置文件
ipcMain.handle('config:save', async (_event, { projectPath, config }) => {
  try {
    const configPath = path.join(projectPath, CONFIG_FILENAME);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (error: any) {
    console.error(`保存配置文件失败: ${projectPath}`, error);
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
