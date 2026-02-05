# 游戏本地化编辑工具 - 技术规范文档

## 文档版本

- **版本**: v1.0
- **创建日期**: 2026-02-04
- **最后更新**: 2026-02-04

---

## 1. 技术栈与开发环境

### 1.1 核心技术栈

#### 运行时环境
- **框架**: Electron ^28.0.0
- **Node.js**: >= 18.x
- **前端框架**: React ^18.2.0
- **构建工具**: Vite ^5.0.0
- **TypeScript**: ^5.3.0

#### 核心库

**UI 组件**
- `react-window`: ^1.8.10 - 虚拟滚动列表
- `@codemirror/state`: ^6.4.0 - 富文本编辑器状态管理
- `@codemirror/view`: ^6.23.0 - 富文本编辑器视图
- `@codemirror/language`: ^6.10.0 - 语言支持

**数据处理**
- `papaparse`: ^5.4.1 - CSV 解析（RFC 4180 兼容）
- `chardet`: ^2.0.0 - 编码检测
- `iconv-lite`: ^0.6.3 - 编码转换

**文件系统**
- `chokidar`: ^3.5.3 - 文件监控
- `electron-store`: ^8.1.0 - 本地数据持久化

**状态管理**
- `zustand`: ^4.5.0 - 轻量级状态管理

**工具库**
- `immer`: ^10.0.3 - 不可变数据结构（Undo/Redo）
- `lodash-es`: ^4.17.21 - 工具函数

### 1.2 开发环境

```json
{
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

### 1.3 平台支持

- **Windows**: Windows 10+ (x64)
- **macOS**: macOS 10.15+ (x64, arm64)

---

## 2. 项目架构设计

### 2.1 整体架构

采用 **Electron 主进程/渲染进程分离架构**：

```
┌─────────────────────────────────────────────────┐
│                  Main Process                   │
│  - 文件系统操作                                  │
│  - CSV 编码检测/读写                             │
│  - 文件监控                                      │
│  - IPC 通信管理                                  │
└───────────────┬─────────────────────────────────┘
                │ IPC Communication
┌───────────────▼─────────────────────────────────┐
│              Renderer Process                   │
│  ┌─────────────────────────────────────────┐   │
│  │         React Application               │   │
│  │  ┌──────────┬──────────┬──────────┐     │   │
│  │  │ 文件列表 │ 编辑区域 │ 功能面板 │     │   │
│  │  └──────────┴──────────┴──────────┘     │   │
│  │                                           │   │
│  │  State Management (Zustand)              │   │
│  │  - Project State                         │   │
│  │  - Editor State                          │   │
│  │  - UI State                              │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
localization-tool/
├── electron/                   # Electron 主进程代码
│   ├── main.ts                # 主进程入口
│   ├── preload.ts             # 预加载脚本
│   ├── ipc/                   # IPC 处理器
│   │   ├── file-handler.ts   # 文件操作
│   │   └── watcher-handler.ts # 文件监控
│   └── utils/
│       ├── csv-parser.ts      # CSV 解析
│       ├── encoding.ts        # 编码检测
│       └── file-io.ts         # 文件读写
├── src/                       # React 前端代码
│   ├── main.tsx              # React 入口
│   ├── App.tsx               # 应用根组件
│   ├── components/           # UI 组件
│   │   ├── FileList/         # 第一列：文件列表
│   │   ├── Editor/           # 第二列：编辑区域
│   │   │   ├── Table/        # 表格编辑器
│   │   │   └── RichTextEditor/ # 富文本编辑器
│   │   └── FunctionPanel/    # 第三列：功能面板
│   │       ├── SearchReplace/
│   │       └── KeyValidator/
│   ├── stores/               # Zustand 状态管理
│   │   ├── project-store.ts  # 项目状态
│   │   ├── editor-store.ts   # 编辑器状态
│   │   └── ui-store.ts       # UI 状态
│   ├── hooks/                # 自定义 Hooks
│   ├── utils/                # 工具函数
│   │   ├── key-validator.ts  # Key 值验证
│   │   ├── search-engine.ts  # 搜索引擎
│   │   └── undo-redo.ts      # 撤销/重做
│   └── types/                # TypeScript 类型定义
└── package.json
```

---

## 3. 核心模块设计

### 3.1 文件管理模块

#### 3.1.1 项目加载

**IPC 接口**：`project:open`

```typescript
// 主进程
interface OpenProjectParams {
  folderPath: string;
}

interface OpenProjectResult {
  success: boolean;
  projectPath: string;
  files: CSVFileInfo[];
  error?: string;
}

interface CSVFileInfo {
  id: string;              // 唯一标识
  fileName: string;        // 文件名
  filePath: string;        // 绝对路径
  encoding: string;        // 编码格式（UTF-8, GBK 等）
  size: number;           // 文件大小（字节）
  lastModified: number;   // 最后修改时间戳
  rowCount?: number;      // 行数（可选，延迟加载）
}
```

**实现流程**：

1. 用户选择文件夹
2. 扫描文件夹，筛选 `.csv` 文件
3. 对每个 CSV 文件：
   - 使用 `chardet` 检测编码
   - 读取文件元信息
   - 生成 `CSVFileInfo`
4. 返回文件列表

#### 3.1.2 文件读取

**IPC 接口**：`file:read`

```typescript
interface ReadFileParams {
  fileId: string;
}

interface ReadFileResult {
  success: boolean;
  fileId: string;
  encoding: string;
  headers: string[];      // 表头
  rows: CSVRow[];         // 数据行
  error?: string;
}

interface CSVRow {
  rowIndex: number;       // 行索引（从 0 开始）
  cells: string[];        // 单元格数据
  key?: string;           // 第一列作为 Key
}
```

**解析规则**：
- 使用 `papaparse` 解析，配置 `{ skipEmptyLines: true, header: false }`
- 第一行作为表头
- 第一列作为 Key 值

#### 3.1.3 文件保存机制

系统采用 **内存驻留 (Memory Persist) + 磁盘写入 (Disk Sync)** 的双层保存策略。

**1. 状态持久化 (Memory)**:
- 所有修改实时更新到 `ProjectStore`。
- 切换文件 (`selectedFileId` 变更) 仅改变视图，内存中的 Dirty Data 保持不变。
- 只有在关闭应用或重载项目时才会丢失未写入磁盘的数据。

**2. 磁盘写入 (Disk Sync)**:

**IPC 接口**：`file:save`

```typescript
interface SaveFileParams {
  fileId: string;
  filePath: string;
  content: string;        // 已序列化为 CSV 格式的字符串
  encoding: string;       // 目标编码 (保持原文件编码)
}

interface SaveFileResult {
  success: boolean;
  error?: string;
  lastModified: number;   // 更新文件的时间戳，避免自身触发监控冲突
}
```

**保存策略**：
- **手动保存 (Manual Save)**:
  - 通过原生菜单 File → Save All 或快捷键 `Ctrl/Cmd+S`。
  - 菜单项通过 IPC (`menu:trigger-save`) 通知渲染进程执行保存。
  - 立即写入磁盘，重置 `isDirty` 标记。
  
- **自动保存 (Auto-Save)**:
  - 策略：Debounce (防抖) + Interval (定时)。
  - 默认配置：每 30 秒自动检查 Dirty 文件并后台保存。
  - 可在设置中开启/关闭。

**原生菜单实现**：

```typescript
// electron/main.ts
const menuTemplate = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Open Project...',
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          mainWindow.webContents.send('menu:open-project');
        }
      },
      {
        label: 'Save All',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          mainWindow.webContents.send('menu:trigger-save');
        }
      }
    ]
  }
];
const menu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(menu);

// electron/preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  onSaveTrigger: (callback) => ipcRenderer.on('menu:trigger-save', callback),
  onOpenProjectTrigger: (callback) => ipcRenderer.on('menu:open-project', callback),
  removeMenuListeners: () => {
    ipcRenderer.removeAllListeners('menu:trigger-save');
    ipcRenderer.removeAllListeners('menu:open-project');
  }
});

// src/App.tsx
useEffect(() => {
  window.electronAPI.onSaveTrigger(async () => {
    await fileService.saveAllDirtyFiles();
  });
  
  window.electronAPI.onOpenProjectTrigger(async () => {
    await fileService.openProject();
  });
  
  return () => window.electronAPI.removeMenuListeners();
}, []);
```

#### 3.1.4 文件外部变更监控

使用 `chokidar` 监控项目文件夹：

```typescript
const watcher = chokidar.watch(projectPath, {
  ignored: /(^|[\/\\])\../, // 忽略隐藏文件
  persistent: true,
  ignoreInitial: true
});

watcher.on('change', (filePath) => {
  // 检测到外部修改
  mainWindow.webContents.send('file:external-change', { filePath });
});
```

**冲突处理**：
- 检测到变更时弹出对话框
- 选项：重新加载 / 保留本地 / 合并 / 手动解决
- 合并策略：基于行的三方合并（原始版本 / 本地版本 / 远程版本）

---

### 3.2 表格编辑模块

#### 3.2.1 虚拟滚动实现

使用 `react-window` 实现高性能渲染：

```typescript
import { FixedSizeGrid } from 'react-window';

interface TableProps {
  headers: string[];
  rows: CSVRow[];
  onCellChange: (rowIndex: number, colIndex: number, value: string) => void;
}

const VirtualTable: React.FC<TableProps> = ({ headers, rows, onCellChange }) => {
  const COLUMN_WIDTH = 150;
  const ROW_HEIGHT = 35;

  return (
    <FixedSizeGrid
      columnCount={headers.length}
      columnWidth={COLUMN_WIDTH}
      height={window.innerHeight - 200}
      rowCount={rows.length + 1} // +1 for header
      rowHeight={ROW_HEIGHT}
      width={window.innerWidth - 400}
    >
      {Cell}
    </FixedSizeGrid>
  );
};
```

**性能目标**：
- 50000 行数据初始渲染 < 1 秒
- 滚动帧率 > 60 FPS
- 编辑响应时间 < 100ms

#### 3.2.2 单元格编辑

**编辑状态管理**：

```typescript
interface CellEditorState {
  editingCell: { row: number; col: number } | null;
  tempValue: string;
}

// 双击进入编辑
const handleDoubleClick = (row: number, col: number) => {
  setEditingCell({ row, col });
  setTempValue(rows[row].cells[col]);
};

// 回车确认
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    commitEdit();
    moveToNextRow();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    commitEdit();
    moveToNextCell();
  }
};
```

#### 3.2.3 填充柄功能

**实现思路**：

```typescript
interface FillHandleState {
  isDragging: boolean;
  startCell: { row: number; col: number };
  endCell: { row: number; col: number };
  fillMode: 'copy' | 'sequence';
}

const detectFillMode = (value: string): 'copy' | 'sequence' => {
  // 检测是否为纯数字
  if (/^\d+$/.test(value)) return 'sequence';
  
  // 检测是否包含数字后缀（如 Item_1）
  if (/^(.+?)_(\d+)$/.test(value)) return 'sequence';
  
  return 'copy';
};

const fillCells = (startRow: number, endRow: number, col: number) => {
  const startValue = rows[startRow].cells[col];
  const mode = detectFillMode(startValue);
  
  if (mode === 'copy') {
    // 纯复制
    for (let i = startRow + 1; i <= endRow; i++) {
      updateCell(i, col, startValue);
    }
  } else {
    // 递增序列
    const match = startValue.match(/^(.+?)_?(\d+)$/);
    const prefix = match?.[1] || '';
    const startNum = parseInt(match?.[2] || startValue);
    
    for (let i = startRow + 1; i <= endRow; i++) {
      const num = startNum + (i - startRow);
      const newValue = prefix ? `${prefix}_${num}` : `${num}`;
      updateCell(i, col, newValue);
    }
  }
};
```

#### 3.2.4 复制粘贴

**剪贴板处理**：

```typescript
// 复制（支持多选）
const handleCopy = (selectedCells: { row: number; col: number }[]) => {
  const text = selectedCells
    .map(cell => rows[cell.row].cells[cell.col])
    .join('\t'); // Tab 分隔
  
  navigator.clipboard.writeText(text);
};

// 粘贴（支持跨应用）
const handlePaste = async (targetRow: number, targetCol: number) => {
  const text = await navigator.clipboard.readText();
  const lines = text.split('\n');
  
  lines.forEach((line, rowOffset) => {
    const cells = line.split('\t');
    cells.forEach((value, colOffset) => {
      updateCell(targetRow + rowOffset, targetCol + colOffset, value);
    });
  });
};
```

---

### 3.3 富文本编辑模块

#### 3.3.1 CodeMirror 6 配置

```typescript
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { Decoration, ViewPlugin } from '@codemirror/view';

const createTMPEditor = (initialValue: string, onChange: (value: string) => void) => {
  const state = EditorState.create({
    doc: initialValue,
    extensions: [
      basicSetup,
      tmpDecorationPlugin,
      tmpAutocompletion,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      })
    ]
  });

  return new EditorView({ state });
};
```

#### 3.3.2 TMP 标签解析器

```typescript
interface TMPTag {
  type: 'color' | 'size' | 'b' | 'i';
  param?: string;          // 如 color 的颜色值
  start: number;          // 标签起始位置
  end: number;            // 标签结束位置
  contentStart: number;   // 内容起始位置
  contentEnd: number;     // 内容结束位置
}

const TMP_TAG_REGEX = /<(color|size|b|i)(?:=([^>]+))?>(.*?)<\/\1>/g;

const parseTMPTags = (text: string): TMPTag[] => {
  const tags: TMPTag[] = [];
  let match;
  
  while ((match = TMP_TAG_REGEX.exec(text)) !== null) {
    const [fullMatch, type, param, content] = match;
    tags.push({
      type: type as TMPTag['type'],
      param,
      start: match.index,
      end: match.index + fullMatch.length,
      contentStart: match.index + fullMatch.indexOf(content),
      contentEnd: match.index + fullMatch.indexOf(content) + content.length
    });
  }
  
  return tags;
};
```

#### 3.3.3 装饰器实现

```typescript
const tmpDecorationPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const cursorPos = view.state.selection.main.head;
    const text = view.state.doc.toString();
    const tags = parseTMPTags(text);

    for (const tag of tags) {
      const isCursorInside = cursorPos >= tag.start && cursorPos <= tag.end;

      if (isCursorInside) {
        // 光标在内：显示源码 + 语法高亮
        builder.add(
          tag.start,
          tag.end,
          Decoration.mark({ class: 'tmp-tag-source' })
        );
      } else {
        // 光标不在：隐藏标签，应用样式
        // 隐藏开始标签
        builder.add(
          tag.start,
          tag.contentStart,
          Decoration.replace({})
        );
        
        // 隐藏结束标签
        builder.add(
          tag.contentEnd,
          tag.end,
          Decoration.replace({})
        );
        
        // 应用样式
        builder.add(
          tag.contentStart,
          tag.contentEnd,
          Decoration.mark({ attributes: getStyleFromTag(tag) })
        );
      }
    }

    return builder.finish();
  }
}, {
  decorations: v => v.decorations
});

const getStyleFromTag = (tag: TMPTag): Record<string, string> => {
  switch (tag.type) {
    case 'color':
      return { style: `color: ${tag.param}` };
    case 'size':
      return { style: `font-size: ${tag.param}px` };
    case 'b':
      return { style: 'font-weight: bold' };
    case 'i':
      return { style: 'font-style: italic' };
    default:
      return {};
  }
};
```

---

### 3.4 搜索与替换模块 (Backend Search)

为了支持全项目范围内的精确搜索，搜索逻辑已从前端内存迁移至 Electron 主进程。这确保了即使用户未打开某个文件，也能通过磁盘扫描快速找到内容。

#### 3.4.1 IPC 接口设计

**搜索接口**：`project:search`

```typescript
interface SearchOptions {
  query: string;           // 搜索词
  isRegExp: boolean;       // 是否正则
  isCaseSensitive: boolean;// 区分大小写
  scope: 'global' | 'current-file';
  fileId?: string;         // 单文件模式下的目标文件 ID
}

interface SearchResult {
  fileId: string;
  rowIndex: number;
  colIndex: number;
  key: string;            // 所属行的 Key
  context: string;        // 匹配内容摘要
}
```

**主进程处理流程**：
1. 接收前端请求。
2. 确定搜索范围：
   - 全局模式：遍历项目目录下所有 `.csv` 文件。
   - 单文件模式：仅处理指定文件。
3. 对每个文件：
   - 读取并解析 CSV（复用 `readFileAndDecode`）。
   - 执行匹配算法。
4. 返回聚合结果。

#### 3.4.2 匹配算法

系统支持两种匹配模式：

**1. 正则表达式模式 (Regex Mode)**
- 直接使用 JavaScript `RegExp` 进行匹配。
- 适用于高级用户和复杂规则查找。

**2. 模糊匹配模式 (Unity-like Fuzzy Mode)**
- **分词逻辑**：当 `isRegExp = false` 且输入包含空格时，自动将 query 拆分为多个关键词（Terms）。
- **AND 逻辑**：目标单元格必须同时包含所有关键词（顺序不限）。
- **示例**：输入 "Item 01"，可匹配 "Item_Weapon_01" 或 "01_Item"。
- 性能优化：非空格分词情况下，自动回退到原生字符串查找以提升速度。

#### 3.4.3 替换策略

**替换接口**：`project:batch-replace` (Planned)

由于替换涉及文件写入，为保证数据一致性：
1. 前端发送替换请求（包含目标位置和新值）。
2. 主进程执行文件读取 -> 内容替换 -> 写入磁盘 -> 触发文件监控变更。
3. 前端接收 `file:change` 事件自动刷新视图。

---

### 3.5 Key 值验证模块 (Real-time Validation)

为了满足"打开即校验"和"实时反馈"的需求，系统采用了 **Key Indexing** 机制。

#### 3.5.1 验证架构

- **Backend (Indexer)**: 负责首次加载时读取所有文件的 Key 列，构建初始索引。
- **Frontend (Validator)**: 维护实时的 `KeyIndex`，负责响应用户编辑并计算错误。

#### 3.5.2 数据结构

**Key Index**:
`Record<FileId, string[]>`
映射文件 ID 到该文件的所有 Key 列表。

**Validation Error**:
```typescript
export interface ValidationError {
  fileId: string;
  rowIndex: number;
  colIndex: number; // 默认为 0
  message: string;
  type: 'invalid_key' | 'duplicate_key' | 'empty_value';
}
```

#### 3.5.3 流程设计

1. **初始化 (Project Open)**:
   - 前端调用 `project:open` 获取文件列表。
   - 前端立即调用 `project:build-index` (Async)。
   - 主进程遍历文件读取 Keys -> 返回 `Record<FileId, string[]>`。
   - 前端 Store 更新 `keyIndex`，触发首次全量校验。

2. **实时编辑 (Editing)**:
   - 用户修改单元格。
   - `EditorStore` 更新 `currentFile` 的数据。
   - 同步更新 `KeyIndex` 中对应文件的 Keys。
   - `ValidatorService` 重新计算错误列表 (Debounced)。
   - 更新 UI 错误计数。

3. **错误计算逻辑**:
   - **查重**: 遍历 `KeyIndex`，统计每个 Key 出现的次数和位置。
   - **格式**: 正则检查。

#### 3.5.4 性能考量
- **Debounce**: 编辑操作触发校验需防抖 (e.g., 300ms)。
- **Incremental**: 理想情况下仅重新检查受影响的 Keys，但在 10w 级数据下，全量 JS 扫描通常 < 50ms，可先采用全量重算的简单实现。

---

### 3.6 Undo/Redo 模块

#### 3.6.1 历史栈设计

使用 `immer` 实现不可变状态：

```typescript
import { produce } from 'immer';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface EditorHistory {
  files: Map<string, CSVFileData>;
}

const useHistoryStore = create<HistoryState<EditorHistory>>((set, get) => ({
  past: [],
  present: { files: new Map() },
  future: [],

  // 执行操作
  execute: (fn: (draft: EditorHistory) => void) => {
    set(state => {
      const newPresent = produce(state.present, fn);
      return {
        past: [...state.past, state.present],
        present: newPresent,
        future: [] // 清空 future
      };
    });
  },

  // 撤销
  undo: () => {
    set(state => {
      if (state.past.length === 0) return state;
      
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      
      return {
        past: newPast,
        present: previous,
        future: [state.present, ...state.future]
      };
    });
  },

  // 重做
  redo: () => {
    set(state => {
      if (state.future.length === 0) return state;
      
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      
      return {
        past: [...state.past, state.present],
        present: next,
        future: newFuture
      };
    });
  }
}));
```

#### 3.6.2 操作粒度

每个操作记录一次历史：
- 单元格编辑
- 批量粘贴
- 批量删除
- 填充柄拖动

**性能优化**：
- 限制历史栈大小（最多 100 条）
- 防抖批量操作（500ms 内的连续操作合并）

---

## 4. 数据结构定义

### 4.1 项目数据结构

```typescript
interface ProjectData {
  projectPath: string;
  files: Map<string, CSVFileData>;
  ignoredFiles: Set<string>; // 文件 ID 集合
  lastOpenedFileId?: string;
}

interface CSVFileData {
  id: string;
  fileName: string;
  filePath: string;
  encoding: string;
  headers: string[];
  rows: CSVRow[];
  isDirty: boolean;        // 是否有未保存修改
  isIgnored: boolean;      // 是否被忽略
  lastModified: number;
}

interface CSVRow {
  rowIndex: number;
  cells: string[];
  key?: string;            // 第一列（缓存）
}
```

### 4.2 UI 状态结构

```typescript
interface UIState {
  // 布局
  leftPanelWidth: number;
  rightPanelWidth: number;
  
  // 选中状态
  selectedFileId?: string;
  selectedCell?: { row: number; col: number };
  selectedRange?: {
    start: { row: number; col: number };
    end: { row: number; col: number };
  };
  
  // 功能面板
  activeTab: 'search' | 'validation' | 'custom';
  
  // 搜索
  searchQuery: string;
  searchResults: SearchResult[];
  currentResultIndex: number;
  
  // 验证
  validationErrors: ValidationError[];
}
```

---

## 5. 性能优化方案

### 5.1 虚拟滚动优化

**目标**：流畅处理 50000+ 行

**策略**：
1. 使用 `react-window` 仅渲染可见区域（约 20-30 行）
2. 单元格组件使用 `React.memo` 避免不必要的重渲染
3. 懒加载文件内容（首次打开只加载前 1000 行，滚动时加载更多）

### 5.2 搜索性能优化

**策略**：
1. 使用 Web Worker 执行搜索（避免阻塞 UI）
2. 正则表达式编译缓存
3. 分批返回结果（每次返回 100 条）

```typescript
// Web Worker 示例
// search-worker.ts
self.onmessage = (e) => {
  const { files, query, isRegex } = e.data;
  const results = performSearch(files, query, isRegex);
  self.postMessage(results);
};
```

### 5.3 内存管理

**策略**：
1. 文件内容按需加载（不是一次性加载所有文件）
2. 大文件分块读取（每次读取 5000 行）
3. 定期清理未使用的文件缓存

### 5.4 编辑响应优化

**策略**：
1. 单元格编辑使用受控组件 + 防抖（100ms）
2. 批量操作使用 `requestIdleCallback` 分帧执行
3. Key 值验证使用防抖（500ms）

---

## 6. 快捷键系统

### 6.1 全局快捷键

```typescript
const GLOBAL_SHORTCUTS = {
  'CmdOrCtrl+S': 'save',
  'CmdOrCtrl+Z': 'undo',
  'CmdOrCtrl+Shift+Z': 'redo',
  'CmdOrCtrl+Y': 'redo',
  'CmdOrCtrl+F': 'search',
  'CmdOrCtrl+H': 'replace',
  'CmdOrCtrl+C': 'copy',
  'CmdOrCtrl+V': 'paste',
  'CmdOrCtrl+X': 'cut',
  'Delete': 'delete',
  'Enter': 'nextRow',
  'Tab': 'nextCell',
  'ArrowUp': 'moveUp',
  'ArrowDown': 'moveDown',
  'ArrowLeft': 'moveLeft',
  'ArrowRight': 'moveRight'
};
```

### 6.2 快捷键注册

使用 Electron 的 `globalShortcut` 和前端的事件监听结合：

```typescript
// 主进程（全局快捷键）
import { globalShortcut } from 'electron';

globalShortcut.register('CommandOrControl+S', () => {
  mainWindow.webContents.send('shortcut:save');
});

// 渲染进程（局部快捷键）
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    const key = `${e.ctrlKey || e.metaKey ? 'Cmd+' : ''}${e.key}`;
    const action = SHORTCUTS[key];
    if (action) {
      e.preventDefault();
      handleShortcutAction(action);
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

---

## 7. 测试策略

> **核心原则**: 每个功能需求都必须有对应的最小化自动测试，确保代码质量和可维护性。

### 7.1 测试金字塔

```
        ┌─────────────┐
        │  E2E 测试   │  10%  (关键用户流程)
        ├─────────────┤
        │  集成测试   │  30%  (模块间交互)
        ├─────────────┤
        │  单元测试   │  60%  (核心逻辑)
        └─────────────┘
```

**覆盖率目标**:
- 单元测试: > 70%
- 集成测试: 关键路径 100%
- E2E 测试: 核心用户流程 100%

---

### 7.2 单元测试（Unit Tests）

**工具**: Jest + React Testing Library

**要求**: ⭐ **每个独立功能模块必须有对应的单元测试**

#### 7.2.1 必测功能列表

##### CSV 解析器
**文件**: `electron/utils/csv-parser.test.ts`

测试用例：
- ✅ 解析标准 CSV 文件
- ✅ 处理带引号的字段
- ✅ 处理字段内换行符
- ✅ 处理字段内逗号
- ✅ 双引号转义处理
- ✅ 空行处理
- ✅ 表头提取
- ✅ RFC 4180 边界情况

**示例测试**:
```typescript
describe('CSV Parser', () => {
  it('应正确解析标准 CSV 文件', () => {
    const csv = 'Key,Value\nDIALOG_001,Hello';
    const result = parseCSV(csv);
    
    expect(result.headers).toEqual(['Key', 'Value']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells).toEqual(['DIALOG_001', 'Hello']);
  });

  it('应处理包含逗号的字段', () => {
    const csv = 'Key,Value\nDIALOG_001,"Hello, World"';
    const result = parseCSV(csv);
    
    expect(result.rows[0].cells[1]).toBe('Hello, World');
  });

  it('应正确转义双引号', () => {
    const csv = 'Key,Value\nDIALOG_001,"He said ""Hello"""';
    const result = parseCSV(csv);
    
    expect(result.rows[0].cells[1]).toBe('He said "Hello"');
  });
});
```

---

##### 编码检测
**文件**: `electron/utils/encoding.test.ts`

测试用例：
- ✅ 检测 UTF-8 编码
- ✅ 检测 GBK 编码
- ✅ 检测 UTF-16 LE/BE
- ✅ 处理 BOM 标记
- ✅ 编码转换正确性

---

##### Key 值验证器
**文件**: `src/utils/key-validator.test.ts`

测试用例：
- ✅ 验证合法 Key（`DIALOG_001`）
- ✅ 拒绝小写字母（`dialog_001`）
- ✅ 拒绝连字符（`DIALOG-001`）
- ✅ 拒绝点号（`DIALOG.001`）
- ✅ 检测重复 Key（单文件）
- ✅ 检测重复 Key（跨文件）
- ✅ 性能测试（10000 个 Key < 100ms）

**示例测试**:
```typescript
describe('Key Validator', () => {
  it('应接受合法的 Key 值', () => {
    expect(isValidKey('DIALOG_001')).toBe(true);
    expect(isValidKey('ITEM_SWORD_2')).toBe(true);
    expect(isValidKey('UI_BUTTON_CANCEL')).toBe(true);
  });

  it('应拒绝非法的 Key 值', () => {
    expect(isValidKey('dialog-001')).toBe(false);
    expect(isValidKey('Item.Sword')).toBe(false);
    expect(isValidKey('对话_001')).toBe(false);
  });

  it('应检测重复的 Key 值', () => {
    const files = createMockFiles([
      { keys: ['DIALOG_001', 'DIALOG_002'] },
      { keys: ['DIALOG_002', 'DIALOG_003'] } // DIALOG_002 重复
    ]);
    
    const errors = validateKeys(files);
    expect(errors).toHaveLength(2); // 两个位置的 DIALOG_002
    expect(errors[0].reason).toBe('duplicate');
  });
});
```

---

##### TMP 标签解析器
**文件**: `src/utils/tmp-parser.test.ts`

测试用例：
- ✅ 解析 `<color>` 标签
- ✅ 解析 `<size>` 标签
- ✅ 解析 `<b>` 和 `<i>` 标签
- ✅ 处理嵌套标签
- ✅ 检测未闭合标签
- ✅ 提取标签参数
- ✅ 性能测试（1000 个标签 < 50ms）

**示例测试**:
```typescript
describe('TMP Tag Parser', () => {
  it('应正确解析 color 标签', () => {
    const text = '<color=#FF0000>红色文本</color>';
    const tags = parseTMPTags(text);
    
    expect(tags).toHaveLength(1);
    expect(tags[0].type).toBe('color');
    expect(tags[0].param).toBe('#FF0000');
  });

  it('应处理嵌套标签', () => {
    const text = '<color=#FF0000>红色<b>加粗</b></color>';
    const tags = parseTMPTags(text);
    
    expect(tags).toHaveLength(2);
    expect(tags[0].type).toBe('color');
    expect(tags[1].type).toBe('b');
  });

  it('应检测未闭合标签', () => {
    const text = '<color=#FF0000>未闭合';
    expect(() => validateTMPTags(text)).toThrow('标签未闭合');
  });
});
```

---

##### 搜索引擎
**文件**: `src/utils/search-engine.test.ts`

测试用例：
- ✅ 普通文本搜索
- ✅ 正则表达式搜索
- ✅ 全局搜索
- ✅ 单文件搜索
- ✅ 大小写敏感/不敏感
- ✅ 上下文提取
- ✅ 性能测试（搜索 50000 行 < 1s）

---

##### Undo/Redo 系统
**文件**: `src/utils/undo-redo.test.ts`

测试用例：
- ✅ 单次撤销/重做
- ✅ 多次撤销/重做
- ✅ 撤销后新操作清空 future
- ✅ 历史栈大小限制
- ✅ 状态不可变性验证

**示例测试**:
```typescript
describe('Undo/Redo System', () => {
  it('应正确执行撤销操作', () => {
    const store = createHistoryStore();
    
    store.execute(draft => {
      draft.value = 'A';
    });
    store.execute(draft => {
      draft.value = 'B';
    });
    
    expect(store.present.value).toBe('B');
    
    store.undo();
    expect(store.present.value).toBe('A');
  });

  it('撤销后新操作应清空 future', () => {
    const store = createHistoryStore();
    
    store.execute(draft => { draft.value = 'A'; });
    store.execute(draft => { draft.value = 'B'; });
    store.undo();
    
    expect(store.future).toHaveLength(1);
    
    store.execute(draft => { draft.value = 'C'; });
    expect(store.future).toHaveLength(0);
  });
});
```

---

#### 7.2.2 测试覆盖率要求

| 模块 | 最低覆盖率 | 目标覆盖率 |
|------|-----------|-----------|
| CSV 解析器 | 80% | 90% |
| 编码检测 | 70% | 85% |
| Key 值验证 | 90% | 95% |
| TMP 标签解析 | 85% | 90% |
| 搜索引擎 | 75% | 85% |
| Undo/Redo | 90% | 95% |

---

### 7.3 集成测试（Integration Tests）

**工具**: Jest + @testing-library/react

**要求**: ⭐ **测试模块间交互和数据流**

#### 7.3.1 必测集成场景

##### 文件加载流程
**文件**: `tests/integration/file-loading.test.ts`

测试流程：
1. 用户选择文件夹
2. 主进程扫描 CSV 文件
3. 检测编码格式
4. 解析文件内容
5. 渲染进程显示文件列表
6. 验证数据正确传递

**示例测试**:
```typescript
describe('文件加载集成测试', () => {
  it('应完整加载项目并显示文件列表', async () => {
    // 准备测试数据
    const testProjectPath = createTestProject({
      files: [
        { name: 'dialog.csv', encoding: 'UTF-8', rows: 100 },
        { name: 'item.csv', encoding: 'GBK', rows: 200 }
      ]
    });

    // 触发打开项目
    await electronAPI.openProject(testProjectPath);

    // 验证文件列表显示
    const fileList = await screen.findByTestId('file-list');
    expect(fileList).toHaveTextContent('dialog.csv');
    expect(fileList).toHaveTextContent('item.csv');

    // 验证编码检测
    expect(getFileEncoding('dialog.csv')).toBe('UTF-8');
    expect(getFileEncoding('item.csv')).toBe('GBK');
  });
});
```

---

##### 编辑 → 保存 → 验证流程
**文件**: `tests/integration/edit-save.test.ts`

测试流程：
1. 打开文件
2. 编辑单元格
3. 保存文件
4. 验证磁盘文件内容
5. 验证编码未改变

---

##### 搜索 → 替换 → Undo 流程
**文件**: `tests/integration/search-replace.test.ts`

测试流程：
1. 执行全局搜索
2. 验证搜索结果
3. 执行替换操作
4. 验证替换正确
5. 执行撤销操作
6. 验证状态恢复

---

##### Key 值验证流程
**文件**: `tests/integration/key-validation.test.ts`

测试流程：
1. 加载多个文件
2. 修改 Key 值触发验证
3. 验证错误列表更新
4. 验证单元格标红
5. 点击错误项跳转
6. 验证跳转正确

---

### 7.4 端到端测试（E2E Tests）

**工具**: Playwright

**要求**: ⭐ **测试完整的用户操作流程**

#### 7.4.1 必测用户流程

##### 流程 1: 新用户首次使用
**文件**: `tests/e2e/first-time-user.spec.ts`

```typescript
test('新用户首次使用完整流程', async ({ page }) => {
  // 1. 启动应用
  await page.goto('app://');
  
  // 2. 点击"打开项目"
  await page.click('button:has-text("打开项目")');
  
  // 3. 选择文件夹（使用测试项目）
  await selectFolder(testProjectPath);
  
  // 4. 验证文件列表加载
  await expect(page.locator('.file-item')).toHaveCount(2);
  
  // 5. 点击第一个文件
  await page.click('.file-item:first-child');
  
  // 6. 验证表格显示
  await expect(page.locator('.table-grid')).toBeVisible();
  
  // 7. 双击单元格编辑
  await page.dblclick('.cell[data-row="0"][data-col="1"]');
  
  // 8. 输入内容
  await page.keyboard.type('测试内容');
  
  // 9. 按 Enter 确认
  await page.keyboard.press('Enter');
  
  // 10. 验证内容已更新
  await expect(page.locator('.cell[data-row="0"][data-col="1"]')).toHaveText('测试内容');
  
  // 11. 保存文件（Ctrl+S）
  await page.keyboard.press('Control+S');
  
  // 12. 验证文件已保存（* 标记消失）
  await expect(page.locator('.file-item:first-child')).not.toHaveText('*');
});
```

---

##### 流程 2: 搜索与替换
**文件**: `tests/e2e/search-replace.spec.ts`

步骤：
1. 打开项目
2. 打开搜索面板（Ctrl+F）
3. 输入搜索关键词
4. 验证搜索结果显示
5. 点击结果项跳转
6. 勾选"替换"
7. 输入替换内容
8. 点击"全部替换"
9. 验证替换成功
10. 按 Ctrl+Z 撤销
11. 验证恢复原内容

---

##### 流程 3: Key 值验证与修复
**文件**: `tests/e2e/key-validation.spec.ts`

步骤：
1. 打开项目
2. 切换到"Key 值检查" Tab
3. 验证显示非法 Key 列表
4. 点击某个非法 Key
5. 验证跳转到对应位置
6. 修改 Key 值为合法格式
7. 验证错误列表自动更新
8. 验证单元格标红消失

---

##### 流程 4: 富文本编辑
**文件**: `tests/e2e/rich-text.spec.ts`

步骤：
1. 打开项目
2. 选中包含富文本的单元格
3. 验证富文本编辑器显示
4. 验证 Typora 式交互（光标移入显示源码）
5. 编辑富文本内容
6. 验证实时预览
7. 保存并重新加载
8. 验证富文本正确保存

---

### 7.5 性能测试（Performance Tests）

**要求**: ⭐ **确保满足性能目标**

#### 7.5.1 基准测试

**文件**: `tests/performance/benchmarks.test.ts`

```typescript
describe('性能基准测试', () => {
  it('加载 50000 行 CSV 应小于 2 秒', async () => {
    const largeCsv = generateLargeCSV(50000);
    
    const startTime = performance.now();
    await loadCSV(largeCsv);
    const endTime = performance.now();
    
    expect(endTime - startTime).toBeLessThan(2000);
  });

  it('全局搜索 50000 行应小于 1 秒', async () => {
    const project = loadLargeProject(50000);
    
    const startTime = performance.now();
    await search({ query: 'test', scope: 'global' });
    const endTime = performance.now();
    
    expect(endTime - startTime).toBeLessThan(1000);
  });

  it('单元格编辑响应应小于 100ms', async () => {
    const startTime = performance.now();
    await updateCell(0, 1, 'new value');
    const endTime = performance.now();
    
    expect(endTime - startTime).toBeLessThan(100);
  });

  it('表格滚动帧率应大于 60 FPS', async () => {
    const fps = await measureScrollFPS();
    expect(fps).toBeGreaterThan(60);
  });
});
```

#### 7.5.2 性能指标

| 指标 | 目标 | 测试方法 |
|------|------|----------|
| 加载 50000 行 | < 2s | Jest 计时器 |
| 全局搜索 | < 1s | Jest 计时器 |
| 编辑响应 | < 100ms | Jest 计时器 |
| 滚动帧率 | > 60 FPS | Playwright 性能 API |
| 内存占用 | < 500MB | Chrome DevTools |

---

### 7.6 测试驱动开发（TDD）流程

**要求**: ⭐ **新功能开发必须遵循 TDD 流程**

#### 开发流程

```
1️⃣ 编写失败的测试
     ↓
2️⃣ 编写最小代码使测试通过
     ↓
3️⃣ 重构代码
     ↓
4️⃣ 运行所有测试确保无回归
     ↓
5️⃣ 提交代码
```

#### 示例：实现填充柄功能

**第 1 步：编写测试**
```typescript
// fill-handle.test.ts
describe('Fill Handle', () => {
  it('应该实现数字递增填充', () => {
    const result = fillCells(0, 3, 0, '1'); // 从第 0 行填充到第 3 行
    expect(result).toEqual(['1', '2', '3', '4']);
  });
});
```

**第 2 步：实现功能**
```typescript
// fill-handle.ts
export function fillCells(startRow, endRow, col, startValue) {
  const result = [];
  const num = parseInt(startValue);
  
  for (let i = startRow; i <= endRow; i++) {
    result.push(String(num + i - startRow));
  }
  
  return result;
}
```

**第 3 步：运行测试** ✅ 通过

**第 4 步：添加更多测试用例**
```typescript
it('应该实现字符串递增填充', () => {
  const result = fillCells(0, 2, 0, 'Item_1');
  expect(result).toEqual(['Item_1', 'Item_2', 'Item_3']);
});

it('应该实现纯复制填充', () => {
  const result = fillCells(0, 2, 0, 'Hello');
  expect(result).toEqual(['Hello', 'Hello', 'Hello']);
});
```

---

### 7.7 持续集成（CI）

#### GitHub Actions 配置

**文件**: `.github/workflows/test.yml`

```yaml
name: 自动化测试

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20]

    steps:
      - uses: actions/checkout@v3
      
      - name: 安装 Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
      
      - name: 安装依赖
        run: npm ci
      
      - name: 运行单元测试
        run: npm run test:unit
      
      - name: 运行集成测试
        run: npm run test:integration
      
      - name: 生成覆盖率报告
        run: npm run test:coverage
      
      - name: 上传覆盖率
        uses: codecov/codecov-action@v3
```

---

### 7.8 测试检查清单

**每次 Pull Request 必须通过以下检查**：

- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 所有 E2E 测试通过
- [ ] 代码覆盖率 > 70%
- [ ] 性能测试通过
- [ ] 无 ESLint 错误
- [ ] 无 TypeScript 类型错误

---

### 7.9 测试命令

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "playwright test",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch",
    "test:perf": "jest --testPathPattern=performance"
  }
}
```

---

## 8. 部署与打包

### 8.1 Electron Builder 配置

```json
{
  "build": {
    "appId": "com.localization-tool",
    "productName": "游戏本地化编辑工具",
    "directories": {
      "output": "dist"
    },
    "files": [
      "dist-electron/**/*",
      "dist/**/*"
    ],
    "win": {
      "target": ["nsis"],
      "icon": "build/icon.ico"
    },
    "mac": {
      "target": ["dmg"],
      "icon": "build/icon.icns",
      "category": "public.app-category.developer-tools"
    }
  }
}
```

### 8.2 安装包大小优化

- 使用 `electron-builder` 的 `asar` 压缩
- 排除 `devDependencies`
- Tree-shaking 优化（Vite 自动处理）

---

## 9. 安全性考虑

### 9.1 IPC 安全

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 仅暴露必要的 API
  openProject: (path: string) => ipcRenderer.invoke('project:open', path),
  saveFile: (data) => ipcRenderer.invoke('file:save', data),
  // 禁止直接访问 Node.js API
});
```

### 9.2 文件路径验证

防止路径遍历攻击：

```typescript
import path from 'path';

const validateFilePath = (projectPath: string, filePath: string): boolean => {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(path.resolve(projectPath));
};
```

---

## 10. 扩展性设计

### 10.1 插件系统（预留）

```typescript
interface Plugin {
  name: string;
  version: string;
  activate: (context: PluginContext) => void;
  deactivate: () => void;
}

interface PluginContext {
  registerValidator: (validator: KeyValidator) => void;
  registerCommand: (command: Command) => void;
  registerTab: (tab: CustomTab) => void;
}
```

### 10.2 自定义验证规则

```typescript
interface CustomValidator {
  name: string;
  validate: (row: CSVRow, context: ValidationContext) => ValidationError[];
}

// 示例：占位符一致性检查
const placeholderValidator: CustomValidator = {
  name: '占位符检查',
  validate: (row, context) => {
    const keyCell = row.cells[0];
    const valueCell = row.cells[1];
    
    const keyPlaceholders = extractPlaceholders(keyCell);
    const valuePlaceholders = extractPlaceholders(valueCell);
    
    if (keyPlaceholders.length !== valuePlaceholders.length) {
      return [{
        reason: 'placeholder-mismatch',
        details: '占位符数量不一致'
      }];
    }
    
    return [];
  }
};
```

---

## 11. 开发规范

### 11.1 代码风格

- **ESLint**: Airbnb 规范 + TypeScript
- **Prettier**: 统一代码格式化
- **命名规范**：
  - 组件：PascalCase（`FileList.tsx`）
  - 函数/变量：camelCase（`handleClick`）
  - 常量：UPPER_SNAKE_CASE（`MAX_ROWS`）

### 11.2 Commit 规范

使用约定式提交（Conventional Commits）：

```
feat: 添加用户登录功能
fix: 修复积分计算错误
docs: 更新 API 文档
style: 代码格式调整
refactor: 重构文件管理模块
test: 添加单元测试
chore: 更新依赖版本
```

### 11.3 分支策略

- `main`: 生产分支
- `develop`: 开发分支
- `feature/*`: 功能分支
- `hotfix/*`: 紧急修复分支

---

## 12. 附录

### 12.1 RFC 4180 标准要点

1. 字段可以用双引号包裹
2. 字段内包含逗号、换行符或双引号时必须用双引号包裹
3. 双引号转义：`"He said ""Hello"""`

### 12.2 Unity TextMeshPro 富文本标签参考

| 标签 | 示例 | 说明 |
|------|------|------|
| `<color>` | `<color=#FF0000>红色</color>` | 文本颜色 |
| `<size>` | `<size=20>大字</size>` | 字体大小 |
| `<b>` | `<b>粗体</b>` | 粗体 |
| `<i>` | `<i>斜体</i>` | 斜体 |
| `<u>` | `<u>下划线</u>` | 下划线 |
| `<s>` | `<s>删除线</s>` | 删除线 |
| `<mark>` | `<mark=#FFFF00>高亮</mark>` | 背景高亮 |

更多标签参考：[TMP 官方文档](http://digitalnativestudios.com/textmeshpro/docs/rich-text/)

---

**文档结束**
