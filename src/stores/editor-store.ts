import { produce } from 'immer';
import { create } from 'zustand';
import { SearchResult, UIState, ValidationError } from '../types';

interface EditorState extends UIState {
  // 新增：编辑状态
  isEditing: boolean;
  editingCell: { row: number; col: number } | undefined;
  editMode: 'replace' | 'append';
  editingLocation: 'cell' | 'editor-bar' | 'header'; // 编辑位置
  tempValue: string;
  originalValue: string;

  // Toggle 列状态: fileId -> Set<columnIndex>
  toggleColumns: Record<string, number[]>;

  // Actions
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setSelectedFile: (fileId?: string) => void;
  setSelectedCell: (row?: number, col?: number) => void;
  setSelectedRange: (start?: { row: number; col: number }, end?: { row: number; col: number }) => void;
  setActiveTab: (tab: 'search' | 'validation') => void;

  // 编辑 Actions
  enterEditMode: (mode: 'replace' | 'append', initialValue?: string) => void;
  exitEditMode: (confirm: boolean) => void;
  updateTempValue: (value: string) => void;
  setEditingLocation: (location: 'cell' | 'editor-bar' | 'header') => void;

  // Search Actions
  setSearchQuery: (query: string) => void;
  setReplaceQuery: (query: string) => void;
  toggleReplaceMode: () => void;
  toggleRegExp: () => void;
  toggleGlobalSearch: () => void;
  setSearchResults: (results: SearchResult[]) => void;
  setCurrentResultIndex: (index: number) => void;

  // Validation Actions
  setValidationErrors: (errors: ValidationError[]) => void;

  // Toggle 列 Actions
  setToggleColumn: (fileId: string, colIndex: number, enabled: boolean) => void;
  initToggleColumns: (fileId: string, colIndices: number[]) => void;
  isToggleColumn: (fileId: string, colIndex: number) => boolean;

  // Reset
  resetUI: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  // Initial State
  leftPanelWidth: 250,
  rightPanelWidth: 350,
  selectedFileId: undefined,
  selectedCell: undefined,
  selectedRange: undefined,
  activeTab: 'search',

  // 编辑状态初始值
  isEditing: false,
  editingCell: undefined,
  editMode: 'append',
  editingLocation: 'cell',
  tempValue: '',
  originalValue: '',

  searchQuery: '',
  replaceQuery: '',
  isReplaceMode: false,
  isRegExp: false,
  isGlobalSearch: false,
  searchResults: [],
  currentResultIndex: -1,

  validationErrors: [],

  // Toggle 列初始值
  toggleColumns: {},

  // Actions
  setLeftPanelWidth: (width) => set(produce((state: EditorState) => { state.leftPanelWidth = width; })),
  setRightPanelWidth: (width) => set(produce((state: EditorState) => { state.rightPanelWidth = width; })),

  setSelectedFile: (fileId) => set(produce((state: EditorState) => {
    state.selectedFileId = fileId;
    state.selectedCell = undefined;
    state.selectedRange = undefined;
    state.currentResultIndex = -1;
    // 切换文件时，自动退出编辑模式
    state.isEditing = false;
    state.editingCell = undefined;
    state.editingLocation = 'cell';
    state.tempValue = '';
    state.originalValue = '';
  })),

  setSelectedCell: (row, col) => set(produce((state: EditorState) => {
    if (row === undefined || col === undefined) {
      state.selectedCell = undefined;
    } else {
      state.selectedCell = { row, col };
    }
  })),

  setSelectedRange: (start, end) => set(produce((state: EditorState) => {
    if (!start || !end) {
      state.selectedRange = undefined;
    } else {
      state.selectedRange = { start, end };
    }
  })),

  setActiveTab: (tab) => set(produce((state: EditorState) => { state.activeTab = tab; })),

  setSearchQuery: (query) => set(produce((state: EditorState) => { state.searchQuery = query; })),
  setReplaceQuery: (query) => set(produce((state: EditorState) => { state.replaceQuery = query; })),
  toggleReplaceMode: () => set(produce((state: EditorState) => { state.isReplaceMode = !state.isReplaceMode; })),
  toggleRegExp: () => set(produce((state: EditorState) => { state.isRegExp = !state.isRegExp; })),
  toggleGlobalSearch: () => set(produce((state: EditorState) => { state.isGlobalSearch = !state.isGlobalSearch; })),

  setSearchResults: (results) => set(produce((state: EditorState) => {
    state.searchResults = results;
    state.currentResultIndex = results.length > 0 ? 0 : -1;
  })),

  setCurrentResultIndex: (index) => set(produce((state: EditorState) => { state.currentResultIndex = index; })),

  setValidationErrors: (errors) => set(produce((state: EditorState) => { state.validationErrors = errors; })),

  // Toggle 列 Actions
  setToggleColumn: (fileId, colIndex, enabled) => set(produce((state: EditorState) => {
    if (!state.toggleColumns[fileId]) {
      state.toggleColumns[fileId] = [];
    }
    const cols = state.toggleColumns[fileId];
    const index = cols.indexOf(colIndex);
    if (enabled && index === -1) {
      cols.push(colIndex);
      cols.sort((a, b) => a - b);
    } else if (!enabled && index !== -1) {
      cols.splice(index, 1);
    }
    // 持久化到 localStorage
    localStorage.setItem('toggle-columns', JSON.stringify(state.toggleColumns));
  })),

  initToggleColumns: (fileId, colIndices) => set(produce((state: EditorState) => {
    // 从 localStorage 加载已有配置
    const stored = localStorage.getItem('toggle-columns');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        state.toggleColumns = parsed;
      } catch {
        state.toggleColumns = {};
      }
    }
    // 如果该文件没有配置，使用自动检测结果
    if (!state.toggleColumns[fileId] || state.toggleColumns[fileId].length === 0) {
      state.toggleColumns[fileId] = colIndices;
      localStorage.setItem('toggle-columns', JSON.stringify(state.toggleColumns));
    }
  })),

  isToggleColumn: (_fileId: string, _colIndex: number): boolean => {
    // 注意: 此方法在 store 外部调用，不使用 set
    // 由于 zustand 的工作方式，我们需要在组件中使用 selector 来获取
    return false; // 占位实现，实际使用 useEditorStore 的 selector
  },

  // 编辑 Actions
  enterEditMode: (mode, initialValue) => set(produce((state: EditorState) => {
    const { selectedCell, selectedFileId } = state;
    if (!selectedCell || !selectedFileId) {
      return;
    }

    state.isEditing = true;
    state.editingCell = { row: selectedCell.row, col: selectedCell.col };
    state.editMode = mode;

    // 无论是 replace 还是 append，如果有 initialValue，都应该设置 tempValue
    if (initialValue !== undefined) {
      state.tempValue = initialValue;
    } else if (mode === 'replace') {
      // replace 模式如果不传 initialValue，默认为空
      state.tempValue = '';
    } else {
      // append 模式如果不传，保持 undefined 或空? 
      // 这里的逻辑需要调用者保证传入 current value for append mode
      state.tempValue = '';
    }

    state.originalValue = ''; // Original value management seems unused or needs specific logic
  })),

  exitEditMode: (confirm) => set(produce((state: EditorState) => {
    if (!state.isEditing) return;

    if (!confirm) {
      // 取消编辑，不保存
      state.tempValue = state.originalValue;
    }
    // 如果 confirm=true，tempValue 已经通过 updateFile 保存到 projectStore

    state.isEditing = false;
    state.editingCell = undefined;
    state.tempValue = '';
    state.originalValue = '';
  })),

  updateTempValue: (value) => set(produce((state: EditorState) => {
    state.tempValue = value;
  })),

  setEditingLocation: (location) => set(produce((state: EditorState) => {
    state.editingLocation = location;
  })),

  resetUI: () => set({
    selectedFileId: undefined,
    selectedCell: undefined,
    selectedRange: undefined,
    searchQuery: '',
    replaceQuery: '',
    searchResults: [],
    currentResultIndex: -1,
    validationErrors: [],
  }),
}));
