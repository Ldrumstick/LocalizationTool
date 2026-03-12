import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FunctionPanel from '../../src/components/FunctionPanel/FunctionPanel';
import { useEditorStore } from '../../src/stores/editor-store';
import { useProjectStore } from '../../src/stores/project-store';
import { CSVFileData } from '../../src/types';

jest.mock('../../src/services/search-service', () => ({
  searchService: {
    streamSearchInProject: (_project: unknown, _query: string, _options: unknown, handlers: { onDone: (payload: { hasMore: boolean }) => void }) => {
      handlers.onDone({ hasMore: false });
      return () => undefined;
    },
    replace: (text: string) => text
  }
}));

jest.mock('react-use-measure', () => ({
  __esModule: true,
  default: () => [() => undefined, { height: 340, width: 320 }]
}));

jest.mock('react-window', () => {
  const ReactModule = require('react');
  const FIXED_START_INDEX = 210;

  const FixedSizeList = ReactModule.forwardRef((
    {
      itemCount,
      itemKey,
      children
    }: {
      itemCount: number;
      itemKey?: (index: number) => string;
      children: ({ index, style }: { index: number; style: React.CSSProperties }) => React.ReactNode;
    },
    ref: React.Ref<{ scrollTo: (offset: number) => void }>
  ) => {
    ReactModule.useImperativeHandle(ref, () => ({
      scrollTo: () => undefined
    }));

    const startIndex = Math.min(FIXED_START_INDEX, Math.max(0, itemCount - 1));
    const endIndex = Math.min(itemCount, startIndex + 8);

    return ReactModule.createElement(
      'div',
      { 'data-testid': 'fixed-list' },
      Array.from({ length: Math.max(0, endIndex - startIndex) }, (_, offset) => {
        const index = startIndex + offset;
        const key = itemKey ? itemKey(index) : index;
        return ReactModule.createElement(
          ReactModule.Fragment,
          { key },
          children({ index, style: {} })
        );
      })
    );
  });

  return { FixedSizeList };
});

const initialProjectState = useProjectStore.getState();
const initialEditorState = useEditorStore.getState();

function createFile(rowCount = 320): CSVFileData {
  return {
    id: 'file-1',
    fileName: 'common_text.csv',
    filePath: 'G:/LocalizationTool/common_text.csv',
    encoding: 'UTF-8',
    headers: ['ID', 'en'],
    rows: Array.from({ length: rowCount }, (_, rowIndex) => ({
      rowIndex,
      cells: [`KEY_${rowIndex}`, `item ${rowIndex}`],
      key: `KEY_${rowIndex}`
    })),
    isDirty: true,
    isIgnored: false,
    lastModified: 1
  };
}

describe('FunctionPanel 搜索结果刷新', () => {
  afterEach(() => {
    act(() => {
      useProjectStore.setState(initialProjectState, true);
      useEditorStore.setState(initialEditorState, true);
    });
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('右键删除行后，中段可见搜索结果应立即移除', async () => {
    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        projectPath: 'G:/LocalizationTool',
        files: { 'file-1': createFile() },
        ignoredFileIds: [],
        groups: {},
        lastOpenedFileId: 'file-1',
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        activeTab: 'search',
        selectedFileId: 'file-1',
        selectedCell: undefined,
        selectedRange: undefined,
        searchQuery: 'item',
        replaceQuery: '',
        isRegExp: false,
        isCaseSensitive: false,
        isGlobalSearch: false,
        searchResults: [],
        currentSearchResult: undefined,
        currentResultIndex: -1
      });
    });

    render(<FunctionPanel />);

    const visibleResult = await screen.findByTitle('item 210');
    fireEvent.click(visibleResult.closest('.match-item')!);

    act(() => {
      useProjectStore.getState().deleteRows('file-1', [209]);
    });

    await waitFor(() => {
      expect(screen.queryByTitle('item 209')).not.toBeInTheDocument();
    });

    expect(screen.getByTitle('item 210')).toBeInTheDocument();
  });

  test('点击其他搜索结果时应提交并退出当前编辑态', async () => {
    const inlineInput = document.createElement('input');
    document.body.appendChild(inlineInput);
    inlineInput.focus();

    const editorDomBlur = jest.fn();
    const editorContentBlur = jest.fn();

    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        projectPath: 'G:/LocalizationTool',
        files: { 'file-1': createFile() },
        ignoredFileIds: [],
        groups: {},
        lastOpenedFileId: 'file-1',
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        activeTab: 'search',
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        selectedRange: undefined,
        searchQuery: 'item',
        replaceQuery: '',
        isRegExp: false,
        isCaseSensitive: false,
        isGlobalSearch: false,
        isEditing: true,
        editingCell: { row: 0, col: 1 },
        editingLocation: 'cell',
        tempValue: 'edited inline value',
        originalValue: 'item 0',
        editorView: {
          dom: { blur: editorDomBlur },
          contentDOM: { blur: editorContentBlur }
        } as any,
        searchResults: [],
        currentSearchResult: undefined,
        currentResultIndex: -1
      });
    });

    render(<FunctionPanel />);

    const visibleResult = await screen.findByTitle('item 210');
    fireEvent.click(visibleResult.closest('.match-item')!);

    await waitFor(() => {
      expect(useEditorStore.getState().isEditing).toBe(false);
    });

    expect(useEditorStore.getState().editingCell).toBeUndefined();
    expect(useEditorStore.getState().selectedCell).toEqual({ row: 210, col: 1 });
    expect(useProjectStore.getState().files['file-1'].rows[0].cells[1]).toBe('edited inline value');
    expect(editorDomBlur).toHaveBeenCalled();
    expect(editorContentBlur).toHaveBeenCalled();
    expect(inlineInput).not.toHaveFocus();
  });
});
