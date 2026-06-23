import React from 'react';
import { act, render } from '@testing-library/react';
import FileMonitor from '../../src/components/FileMonitor/FileMonitor';
import { commitActiveEdit } from '../../src/services/edit-session-service';
import { useEditorStore } from '../../src/stores/editor-store';
import { useProjectStore } from '../../src/stores/project-store';
import { CSVFileData } from '../../src/types';

const initialProjectState = useProjectStore.getState();
const initialEditorState = useEditorStore.getState();

function createFile(): CSVFileData {
  return {
    id: 'file-1',
    fileName: 'common_text.csv',
    filePath: 'G:/LocalizationTool/common_text.csv',
    encoding: 'UTF-8',
    hasBom: false,
    lineEnding: 'CRLF',
    headers: ['ID', 'en'],
    rows: [
      { rowIndex: 0, cells: ['KEY_0', 'item 0'], key: 'KEY_0' },
      { rowIndex: 1, cells: ['KEY_1', 'item 1'], key: 'KEY_1' }
    ],
    isDirty: false,
    isIgnored: false,
    lastModified: 1
  };
}

function createExternalFileData() {
  return {
    encoding: 'UTF-8',
    hasBom: false,
    lineEnding: 'CRLF',
    headers: ['ID', 'en'],
    rows: [
      { rowIndex: 0, cells: ['KEY_EXTERNAL', 'external item'], key: 'KEY_EXTERNAL' },
      { rowIndex: 1, cells: ['KEY_0', 'item 0 moved'], key: 'KEY_0' }
    ]
  };
}

describe('FileMonitor 外部文件刷新', () => {
  let fileChangeHandler: ((data: any) => void) | undefined;

  beforeEach(() => {
    fileChangeHandler = undefined;

    (window as any).electronAPI = {
      onFileChange: (handler: (data: any) => void) => {
        fileChangeHandler = handler;
      },
      removeFileChangeListener: jest.fn()
    };

    act(() => {
      useProjectStore.setState(initialProjectState, true);
      useEditorStore.setState(initialEditorState, true);
      useProjectStore.getState().setFiles({ 'file-1': createFile() });
      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 1, col: 1 },
        isEditing: true,
        editingCell: { row: 1, col: 1 },
        editingLocation: 'editor-bar',
        tempValue: 'draft value',
        originalValue: 'item 1'
      });
    });
  });

  afterEach(() => {
    act(() => {
      useProjectStore.setState(initialProjectState, true);
      useEditorStore.setState(initialEditorState, true);
    });
    jest.clearAllMocks();
  });

  test('clean 文件外部刷新前应退出编辑态，避免旧坐标草稿写入新行', () => {
    render(<FileMonitor />);

    act(() => {
      fileChangeHandler?.({
        fileId: 'file-1',
        fileName: 'common_text.csv',
        lastModified: 10,
        data: createExternalFileData()
      });
    });

    expect(useEditorStore.getState().isEditing).toBe(false);
    expect(useEditorStore.getState().editingCell).toBeUndefined();
    expect(useProjectStore.getState().files['file-1'].rows[1].cells[1]).toBe('item 0 moved');

    act(() => {
      expect(commitActiveEdit({ exitEditing: true })).toBe(false);
    });

    expect(useProjectStore.getState().files['file-1'].rows[1].cells[1]).toBe('item 0 moved');
  });
});
