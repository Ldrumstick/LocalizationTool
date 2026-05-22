import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import GlideGridView from '../../src/components/Editor/GlideGridView';
import { useEditorStore } from '../../src/stores/editor-store';
import { useProjectStore } from '../../src/stores/project-store';
import { CSVFileData } from '../../src/types';

jest.mock('react-use-measure', () => ({
  __esModule: true,
  default: () => [() => undefined, { height: 360, width: 640 }]
}));

jest.mock('@glideapps/glide-data-grid', () => {
  const ReactModule = require('react');
  const mockState = {
    lastProps: undefined as any,
  };

  class CompactSelection {
    private items: Array<[number, number]>;

    constructor(items: Array<[number, number]> = []) {
      this.items = items;
    }

    static empty() {
      return new CompactSelection();
    }

    static fromSingleSelection(selection: number | [number, number]) {
      return new CompactSelection([typeof selection === 'number' ? [selection, selection + 1] : selection]);
    }

    get length() {
      return this.items.length;
    }

    first() {
      return this.items[0]?.[0];
    }

    last() {
      const item = this.items[this.items.length - 1];
      return item ? item[1] - 1 : undefined;
    }

    hasIndex(index: number) {
      return this.items.some(([start, end]) => index >= start && index < end);
    }

    [Symbol.iterator]() {
      const values = this.items.flatMap(([start, end]) =>
        Array.from({ length: end - start }, (_, index) => start + index)
      );
      return values[Symbol.iterator]();
    }
  }

  const DataEditor = ReactModule.forwardRef((props: any, _ref: React.Ref<any>) => {
    mockState.lastProps = props;
    const items: React.ReactNode[] = [];
    for (let rowIndex = 0; rowIndex < props.rows; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < props.columns.length; columnIndex += 1) {
        const cell = props.getCellContent([columnIndex, rowIndex]);
        items.push(ReactModule.createElement('div', {
          key: `${rowIndex}-${columnIndex}`,
          'data-testid': `cell-${rowIndex}-${columnIndex}`
        }, cell.displayData ?? cell.data));
      }
    }

    items.push(ReactModule.createElement('div', {
      key: 'editor-mode',
      'data-testid': 'editor-mode'
    }, props.provideEditor ? 'custom' : 'native'));

    if (props.provideEditor && props.gridSelection?.current) {
      const [col, row] = props.gridSelection.current.cell;
      const value = props.getCellContent([col, row]);
      const ProvidedEditor = props.provideEditor(value);
      if (ProvidedEditor) {
        const Editor = ProvidedEditor.editor ?? ProvidedEditor;
        items.push(ReactModule.createElement(Editor, {
          key: 'editor',
          value,
          initialValue: value.data,
          isHighlighted: false,
          onChange: jest.fn(),
          onFinishedEditing: jest.fn(),
          target: { x: 0, y: 0, width: 100, height: 36 },
          forceEditMode: true,
          theme: {}
        }));
      }
    }

    return ReactModule.createElement('div', { 'data-testid': 'glide-data-editor' }, items);
  });

  return {
    CompactSelection,
    DataEditor,
    __mockState: mockState,
    GridCellKind: {
      Text: 'text',
      Markdown: 'markdown',
      Boolean: 'boolean'
    }
  };
});

const glideMock = jest.requireMock('@glideapps/glide-data-grid') as {
  __mockState: { lastProps: any };
};

const initialProjectState = useProjectStore.getState();
const initialEditorState = useEditorStore.getState();

function createFile(): CSVFileData {
  return {
    id: 'file-1',
    fileName: 'dialog.csv',
    filePath: 'G:/LocalizationTool/dialog.csv',
    encoding: 'UTF-8',
    hasBom: false,
    lineEnding: 'CRLF',
    headers: ['ID', 'en'],
    rows: [
      { rowIndex: 0, cells: ['HELLO', 'Original value'], key: 'HELLO' },
      { rowIndex: 1, cells: ['WORLD', 'Other value'], key: 'WORLD' }
    ],
    isDirty: true,
    isIgnored: false,
    lastModified: 1
  };
}

describe('GlideGridView 富文本编辑预览', () => {
  afterEach(() => {
    act(() => {
      useProjectStore.setState(initialProjectState, true);
      useEditorStore.setState(initialEditorState, true);
    });
    localStorage.clear();
  });

  test('富文本编辑时更新 tempValue 应立即刷新表格中的当前单元格预览', async () => {
    const file = createFile();

    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        files: { 'file-1': file },
        ignoredFileIds: [],
        groups: {},
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        selectedRange: undefined,
        isEditing: true,
        editingCell: { row: 0, col: 1 },
        editingLocation: 'editor-bar',
        tempValue: 'Edited once',
        originalValue: 'Original value'
      });
    });

    render(<GlideGridView headers={file.headers} rows={file.rows} />);

    expect(screen.getByText('Edited once')).toBeInTheDocument();

    act(() => {
      useEditorStore.getState().updateTempValue('Edited twice');
    });

    await waitFor(() => {
      expect(screen.getByText('Edited twice')).toBeInTheDocument();
    });

    expect(screen.queryByText('Edited once')).not.toBeInTheDocument();
  });

  test('文本单元格编辑使用 Glide 原生 overlay 行为', () => {
    const file = createFile();

    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        files: { 'file-1': file },
        ignoredFileIds: [],
        groups: {},
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        selectedRange: undefined
      });
    });

    render(<GlideGridView headers={file.headers} rows={file.rows} />);

    expect(screen.getByTestId('editor-mode')).toHaveTextContent('native');
  });

  test('表格启用 Glide 原生编辑、选择、粘贴和新增行配置', () => {
    const file = createFile();

    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        files: { 'file-1': file },
        ignoredFileIds: [],
        groups: {},
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        selectedRange: undefined
      });
    });

    render(<GlideGridView headers={file.headers} rows={file.rows} />);

    expect(glideMock.__mockState.lastProps.onPaste).toBe(true);
    expect(glideMock.__mockState.lastProps.getCellsForSelection).toBe(true);
    expect(glideMock.__mockState.lastProps.rangeSelect).toBe('multi-rect');
    expect(glideMock.__mockState.lastProps.rowSelect).toBe('multi');
    expect(glideMock.__mockState.lastProps.columnSelect).toBe('multi');
    expect(glideMock.__mockState.lastProps.rowMarkers.kind).toBe('both');
    expect(glideMock.__mockState.lastProps.trailingRowOptions).toEqual({
      sticky: true,
      tint: true,
      hint: '新增行...',
      targetColumn: 0,
    });
    expect(glideMock.__mockState.lastProps.keybindings).toEqual({
      downFill: true,
      rightFill: true,
    });
    expect(glideMock.__mockState.lastProps.onDelete).toEqual(expect.any(Function));
    expect(glideMock.__mockState.lastProps.onRowAppended).toEqual(expect.any(Function));
    expect(glideMock.__mockState.lastProps.onHeaderMenuClick).toEqual(expect.any(Function));
  });

  test('Glide trailing row 通过项目 store 新增行', async () => {
    const file = createFile();

    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        files: { 'file-1': file },
        ignoredFileIds: [],
        groups: {},
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 0 },
        selectedRange: undefined
      });
    });

    render(<GlideGridView headers={file.headers} rows={file.rows} />);

    await act(async () => {
      await glideMock.__mockState.lastProps.onRowAppended();
    });

    const updatedFile = useProjectStore.getState().files['file-1'];
    expect(updatedFile.rows).toHaveLength(3);
    expect(updatedFile.rows[2].cells).toEqual(['', '']);
    expect(useEditorStore.getState().selectedCell).toEqual({ row: 2, col: 0 });
  });

  test('表头菜单重命名列时调用 updateHeader', () => {
    const file = createFile();

    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        files: { 'file-1': file },
        ignoredFileIds: [],
        groups: {},
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        selectedRange: undefined
      });
    });

    render(<GlideGridView headers={file.headers} rows={file.rows} />);

    act(() => {
      glideMock.__mockState.lastProps.onHeaderMenuClick(1, { x: 10, y: 20, width: 30, height: 40 });
    });

    act(() => {
      screen.getByText('重命名列').click();
      useEditorStore.getState().inputModal?.onConfirm('english_text');
    });

    expect(useProjectStore.getState().files['file-1'].headers[1]).toBe('english_text');
  });

  test('表头右键不打开列操作菜单', () => {
    const file = createFile();
    const preventDefault = jest.fn();

    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        files: { 'file-1': file },
        ignoredFileIds: [],
        groups: {},
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        selectedRange: undefined
      });
    });

    render(<GlideGridView headers={file.headers} rows={file.rows} />);

    act(() => {
      glideMock.__mockState.lastProps.onHeaderContextMenu(1, {
        preventDefault,
        localEventX: 10,
        localEventY: 20,
      });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(screen.queryByText('在左侧插入列')).not.toBeInTheDocument();
    expect(screen.queryByText('删除 列')).not.toBeInTheDocument();
  });

  test('表头分隔线双击自适应列宽时保存 Glide 计算出的列宽', () => {
    const file = createFile();

    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        files: { 'file-1': file },
        ignoredFileIds: [],
        groups: {},
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        selectedRange: undefined
      });
    });

    render(<GlideGridView headers={file.headers} rows={file.rows} />);

    act(() => {
      glideMock.__mockState.lastProps.onColumnResize({ id: 'col-1' }, 236, 1, 236);
    });

    expect(useEditorStore.getState().columnWidths['file-1'][1]).toBe(236);
  });

  test('单元格右键菜单显示在鼠标右键位置', () => {
    const file = createFile();
    const preventDefault = jest.fn();

    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        files: { 'file-1': file },
        ignoredFileIds: [],
        groups: {},
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        selectedRange: undefined
      });
    });

    render(<GlideGridView headers={file.headers} rows={file.rows} />);

    act(() => {
      glideMock.__mockState.lastProps.onCellContextMenu([2, 1], {
        preventDefault,
        bounds: { x: 540, y: 260, width: 320, height: 36 },
        localEventX: 180,
        localEventY: 18,
      });
    });

    const menu = screen.getByText('在上方插入行').closest('.context-menu') as HTMLElement;
    expect(preventDefault).toHaveBeenCalled();
    expect(menu).toHaveStyle({ left: '720px', top: '278px' });
  });

  test('校验错误单元格使用 Glide 原生高亮区域', () => {
    const file = createFile();

    act(() => {
      useProjectStore.setState({
        ...useProjectStore.getState(),
        files: { 'file-1': file },
        ignoredFileIds: [],
        groups: {},
        keyIndex: {}
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        selectedRange: undefined,
        validationErrors: [
          {
            fileId: 'file-1',
            rowIndex: 1,
            colIndex: 0,
            message: '重复 Key: "WORLD"',
            type: 'duplicate_key',
          },
        ],
      });
    });

    render(<GlideGridView headers={file.headers} rows={file.rows} />);

    expect(glideMock.__mockState.lastProps.highlightRegions).toEqual([
      {
        color: 'rgba(217, 48, 37, 0.16)',
        range: { x: 0, y: 1, width: 1, height: 1 },
        style: 'dashed',
      },
    ]);
  });
});
