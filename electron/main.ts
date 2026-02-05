import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import chardet from 'chardet';
import iconv from 'iconv-lite';
import Papa from 'papaparse';

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

  // 创建菜单
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
    }
  ];
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 辅助函数：扫描目录下的所有 CSV 文件
async function scanCSVFiles(dir: string): Promise<any[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const csvFiles = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
      const stats = await fs.stat(fullPath);
      csvFiles.push({
        id: Buffer.from(fullPath).toString('base64'), // 简单使用路径 base64 作为 ID
        fileName: entry.name,
        filePath: fullPath,
        lastModified: stats.mtimeMs,
      });
    }
  }

  return csvFiles;
}

// IPC 处理：打开项目
ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const projectPath = result.filePaths[0];
  const files = await scanCSVFiles(projectPath);

  return {
    projectPath,
    files,
  };
});

// 辅助函数：读取并解码文件
async function readFileAndDecode(filePath: string) {
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
  const parseResult = Papa.parse(content, {
    skipEmptyLines: true,
  });

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

// IPC 处理：读取 CSV 文件内容
ipcMain.handle('file:read', async (_event, filePath: string) => {
  try {
    return await readFileAndDecode(filePath);
  } catch (error: any) {
    console.error(`读取文件失败: ${filePath}`, error);
    throw error;
  }
});

// IPC 处理：全项目搜索
ipcMain.handle('project:search', async (_event, { projectPath, query, isRegExp, isCaseSensitive, isGlobalSearch, selectedFileId, ignoredFileIds }) => {
  // ... (existing search logic implementation) ...
  // 为了简洁，这里保留原有的 search 实现，不做修改，只是占位表示位置
  // 实际代码中请不要删除原有的 search 实现
  const results: any[] = [];
  
  try {
    // 确定搜索范围：如果是全局搜索，扫描所有文件；否则仅搜索指定文件
    let filesToSearch: { path: string; id: string }[] = [];
    
    if (isGlobalSearch) {
      const allFiles = await scanCSVFiles(projectPath);
      // Filter out ignored files
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
        if (searchTerms.length === 0) return [];
      } else {
        const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(pattern, flags);
      }
    }

    for (const fileInfo of filesToSearch) {
      try {
        const { rows } = await readFileAndDecode(fileInfo.path);
        
        rows.forEach((row: any) => {
          row.cells.forEach((cell: string, colIndex: number) => {
            if (!cell) return;

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

            if (isMatch) {
              results.push({
                fileId: fileInfo.id,
                rowIndex: row.rowIndex,
                colIndex,
                key: row.key || '',
                context: cell.length > 50 ? cell.substring(0, 50) + '...' : cell
              });
            }
          });
        });
      } catch (err) {
        console.warn(`搜索文件失败: ${fileInfo.path}`, err);
      }
    }

    return results;
  } catch (error) {
    console.error('搜索执行失败:', error);
    return [];
  }
});

// IPC 处理：构建项目 Key 索引
ipcMain.handle('project:build-index', async (_event, projectPath: string) => {
  try {
    const allFiles = await scanCSVFiles(projectPath);
    const index: Record<string, string[]> = {};

    // 并发处理文件读取，提高速度
    await Promise.all(allFiles.map(async (file: any) => {
      try {
        const { rows } = await readFileAndDecode(file.filePath);
        // 提取每一行的第一列作为 Key
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

// IPC 处理：保存文件
ipcMain.handle('file:save', async (_event, { filePath, content, encoding }) => {
  try {
    // 1. 编码转换 (默认 UTF-8)
    const buffer = iconv.encode(content, encoding || 'UTF-8');
    
    // 2. 写入文件
    await fs.writeFile(filePath, buffer);
    
    // 3. 获取最新修改时间
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
