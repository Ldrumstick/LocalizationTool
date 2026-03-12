import { act } from '@testing-library/react';
import { commitActiveEdit, hasPendingActiveEdit } from '../../src/services/edit-session-service';
import { useEditorStore } from '../../src/stores/editor-store';
import { useProjectStore } from '../../src/stores/project-store';

function seedFile() {
  useProjectStore.getState().setFiles({
    'file-1': {
      id: 'file-1',
      fileName: 'common_text.csv',
      filePath: 'G:/LocalizationTool/common_text.csv',
      encoding: 'UTF-8',
      headers: ['ID', 'en'],
      rows: [
        { rowIndex: 0, cells: ['KEY_0', 'item 0'], key: 'KEY_0' }
      ],
      isDirty: false,
      isIgnored: false,
      lastModified: 1
    }
  });
}

describe('edit-session-service', () => {
  beforeEach(() => {
    act(() => {
      useProjectStore.getState().resetProject();
      useEditorStore.getState().resetUI();
      seedFile();
    });
  });

  test('应识别并提交当前单元格的未提交编辑', () => {
    act(() => {
      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        isEditing: true,
        editingCell: { row: 0, col: 1 },
        editingLocation: 'cell',
        tempValue: 'edited value',
        originalValue: 'item 0'
      });
    });

    expect(hasPendingActiveEdit('file-1')).toBe(true);

    act(() => {
      expect(commitActiveEdit()).toBe(true);
    });

    expect(useProjectStore.getState().files['file-1'].rows[0].cells[1]).toBe('edited value');
    expect(useProjectStore.getState().files['file-1'].isDirty).toBe(true);
    expect(useEditorStore.getState().isEditing).toBe(true);
    expect(hasPendingActiveEdit('file-1')).toBe(false);
  });

  test('应识别并提交表头编辑中的未提交修改', () => {
    act(() => {
      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        isEditing: true,
        editingCell: { row: -1, col: 1 },
        editingLocation: 'header',
        tempValue: 'english_text'
      });
    });

    expect(hasPendingActiveEdit('file-1')).toBe(true);

    act(() => {
      expect(commitActiveEdit()).toBe(true);
    });

    expect(useProjectStore.getState().files['file-1'].headers[1]).toBe('english_text');
    expect(useProjectStore.getState().files['file-1'].isDirty).toBe(true);
    expect(hasPendingActiveEdit('file-1')).toBe(false);
  });
});
