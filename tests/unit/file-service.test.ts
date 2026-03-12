import { act } from '@testing-library/react';
import { fileService } from '../../src/services/file-service';
import { useEditorStore } from '../../src/stores/editor-store';
import { useProjectStore } from '../../src/stores/project-store';

jest.mock('papaparse', () => ({
  __esModule: true,
  default: {
    unparse: (data: string[][]) => data.map((row) => row.join(',')).join('\r\n')
  }
}));

describe('file-service project restore', () => {
  beforeEach(() => {
    localStorage.clear();

    act(() => {
      useProjectStore.getState().resetProject();
      useProjectStore.getState().setKeyIndex({});
      useEditorStore.getState().resetUI();
    });

    (window as any).electronAPI = {
      openProject: jest.fn(),
      readConfig: jest.fn().mockResolvedValue(null),
      buildProjectIndex: jest.fn().mockResolvedValue({}),
      readFile: jest.fn(),
      saveFile: jest.fn(),
    };
  });

  it('should reopen the last project path and restore the last selected file', async () => {
    act(() => {
      useProjectStore.getState().setProjectPath('G:/demo');
      useProjectStore.getState().setLastOpenedFile('file-1');
    });

    window.electronAPI.openProject.mockResolvedValue({
      projectPath: 'G:/demo',
      files: [
        {
          id: 'file-1',
          fileName: 'dialog.csv',
          filePath: 'G:/demo/dialog.csv',
          relativePath: 'dialog.csv',
          lastModified: 1,
        },
      ],
    });
    window.electronAPI.readFile.mockResolvedValue({
      encoding: 'UTF-8',
      headers: ['Key', 'Value'],
      rows: [{ rowIndex: 0, cells: ['HELLO', 'World'], key: 'HELLO' }],
    });

    let reopened = false;
    await act(async () => {
      reopened = await fileService.reopenLastProject();
    });

    expect(reopened).toBe(true);
    expect(window.electronAPI.openProject).toHaveBeenCalledWith('G:/demo');
    expect(window.electronAPI.readFile).toHaveBeenCalledWith('G:/demo/dialog.csv');
    expect(useProjectStore.getState().projectPath).toBe('G:/demo');
    expect(useProjectStore.getState().lastOpenedFileId).toBe('file-1');
    expect(useEditorStore.getState().selectedFileId).toBe('file-1');
    expect(useProjectStore.getState().files['file-1'].headers).toEqual(['Key', 'Value']);
  });

  it('should clear stale remembered file selection when the file no longer exists', async () => {
    act(() => {
      useProjectStore.getState().setLastOpenedFile('missing-file');
    });

    window.electronAPI.openProject.mockResolvedValue({
      projectPath: 'G:/demo',
      files: [
        {
          id: 'file-2',
          fileName: 'item.csv',
          filePath: 'G:/demo/item.csv',
          relativePath: 'item.csv',
          lastModified: 2,
        },
      ],
    });

    let opened = false;
    await act(async () => {
      opened = await fileService.openProject('G:/demo');
    });

    expect(opened).toBe(true);
    expect(window.electronAPI.openProject).toHaveBeenCalledWith('G:/demo');
    expect(window.electronAPI.readFile).not.toHaveBeenCalled();
    expect(useProjectStore.getState().lastOpenedFileId).toBeUndefined();
    expect(useEditorStore.getState().selectedFileId).toBeUndefined();
  });

  it('should reset persisted project state when the remembered project path is missing', async () => {
    act(() => {
      useProjectStore.getState().setProjectPath('G:/missing');
      useProjectStore.getState().setLastOpenedFile('file-1');
      useEditorStore.getState().setSelectedFile('file-1');
    });

    window.electronAPI.openProject.mockResolvedValue(null);

    let reopened = true;
    await act(async () => {
      reopened = await fileService.reopenLastProject();
    });

    expect(reopened).toBe(false);
    expect(useProjectStore.getState().projectPath).toBe('');
    expect(useProjectStore.getState().lastOpenedFileId).toBeUndefined();
    expect(useEditorStore.getState().selectedFileId).toBeUndefined();
  });

  it('should flush active edits before saving dirty files when requested', async () => {
    act(() => {
      useProjectStore.getState().setFiles({
        'file-1': {
          id: 'file-1',
          fileName: 'dialog.csv',
          filePath: 'G:/demo/dialog.csv',
          encoding: 'UTF-8',
          headers: ['Key', 'Value'],
          rows: [{ rowIndex: 0, cells: ['HELLO', 'World'], key: 'HELLO' }],
          isDirty: false,
          isIgnored: false,
          lastModified: 1
        }
      });

      useEditorStore.setState({
        ...useEditorStore.getState(),
        selectedFileId: 'file-1',
        selectedCell: { row: 0, col: 1 },
        isEditing: true,
        editingCell: { row: 0, col: 1 },
        editingLocation: 'cell',
        tempValue: 'Edited World',
        originalValue: 'World'
      });
    });

    window.electronAPI.saveFile.mockResolvedValue({
      success: true,
      lastModified: 2
    });

    await act(async () => {
      await fileService.saveAllDirtyFiles({ flushActiveEdit: true });
    });

    expect(window.electronAPI.saveFile).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.saveFile.mock.calls[0][0].content).toContain('Edited World');
    expect(useProjectStore.getState().files['file-1'].rows[0].cells[1]).toBe('Edited World');
    expect(useProjectStore.getState().files['file-1'].isDirty).toBe(false);
    expect(useEditorStore.getState().isEditing).toBe(true);
  });
});
