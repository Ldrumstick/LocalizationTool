/**
 * CSV 行数据接口
 */
export interface CSVRow {
  rowIndex: number;
  cells: string[];
  key?: string; // 第一列内容的缓存，用于快速验证
}

/**
 * CSV 文件数据接口
 */
export interface CSVFileData {
  id: string;
  fileName: string;
  filePath: string;
  encoding: string;
  headers: string[];
  rows: CSVRow[];
  isDirty: boolean; // 是否有未保存的修改
  isIgnored: boolean; // 是否在全局操作中被忽略
  lastModified: number;
}

/**
 * 项目全局数据接口
 */
export interface ProjectData {
  projectPath: string;
  files: Record<string, CSVFileData>; // 使用对象结构方便查找，Key 为文件 ID
  ignoredFileIds: string[]; // 被忽略的文件 ID 列表
  lastOpenedFileId?: string;
  keyIndex?: Record<string, string[]>; // 全局 Key 索引
}

/**
 * 搜索结果接口
 */
export interface SearchResult {
  fileId: string;
  rowIndex: number;
  colIndex: number;
  key: string;
  context: string; // 匹配项附近的文本
}

/**
 * 验证错误接口
 */
export interface ValidationError {
  fileId: string;
  rowIndex: number;
  colIndex: number;
  message: string;
  type: 'invalid_key' | 'duplicate_key' | 'empty_value';
}

/**
 * UI 状态接口
 */
export interface UIState {
  // 布局状态
  leftPanelWidth: number;
  rightPanelWidth: number;

  // 选中状态
  selectedFileId?: string;
  selectedCell?: { row: number; col: number };
  selectedRange?: {
    start: { row: number; col: number };
    end: { row: number; col: number };
  };

  // 功能面板状态
  activeTab: 'search' | 'validation';

  // 搜索状态
  searchQuery: string;
  replaceQuery: string;
  isReplaceMode: boolean;
  isRegExp: boolean;
  isGlobalSearch: boolean;
  searchResults: SearchResult[];
  currentResultIndex: number;

  // 验证状态
  validationErrors: ValidationError[];
}
