import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import GridView from '../../src/components/Editor/GridView';
import { useEditorStore } from '../../src/stores/editor-store';
import { useProjectStore } from '../../src/stores/project-store';
import { CSVFileData } from '../../src/types';

jest.mock('react-use-measure', () => ({
  __esModule: true,
  default: () => [() => undefined, { height: 360, width: 640 }]
}));

jest.mock('../../src/components/Editor/RowHeaders', () => ({
  __esModule: true,
  default: () => <div data-testid="row-headers" />
}));

jest.mock('react-window', () => {
  const ReactModule = require('react');

  const FixedSizeList = ReactModule.forwardRef((_props: any, _ref: React.Ref<any>) => {
    return ReactModule.createElement('div', { 'data-testid': 'fixed-size-list' });
  });

  const VariableSizeGrid = ReactModule.forwardRef((props: any, _ref: React.Ref<any>) => {
    const items: React.ReactNode[] = [];
    for (let rowIndex = 0; rowIndex < props.rowCount; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < props.columnCount; columnIndex += 1) {
        items.push(
          ReactModule.createElement(
            'div',
            { key: `${rowIndex}-${columnIndex}` },
            props.children({ rowIndex, columnIndex, style: {} })
          )
        );
      }
    }

    return ReactModule.createElement('div', { 'data-testid': 'variable-grid' }, items);
  });

  return {
    FixedSizeList,
    VariableSizeGrid,
    areEqual: () => false
  };
});

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

describe('GridView 富文本编辑预览', () => {
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

    render(<GridView headers={file.headers} rows={file.rows} />);

    expect(screen.getByText('Edited once')).toBeInTheDocument();

    act(() => {
      useEditorStore.getState().updateTempValue('Edited twice');
    });

    await waitFor(() => {
      expect(screen.getByText('Edited twice')).toBeInTheDocument();
    });

    expect(screen.queryByText('Edited once')).not.toBeInTheDocument();
  });
});
