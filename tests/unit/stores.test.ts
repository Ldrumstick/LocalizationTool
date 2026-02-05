import { useProjectStore } from '../../src/stores/project-store';
import { useEditorStore } from '../../src/stores/editor-store';
import { act } from '@testing-library/react';

describe('Stores Unit Tests', () => {
  beforeEach(() => {
    // 重置 Stores 状态
    act(() => {
      useProjectStore.getState().resetProject();
      useEditorStore.getState().resetUI();
    });
  });

  describe('ProjectStore', () => {
    it('应该能够正确设置项目路径', () => {
      const testPath = 'C:/test/project';
      act(() => {
        useProjectStore.getState().setProjectPath(testPath);
      });
      expect(useProjectStore.getState().projectPath).toBe(testPath);
    });

    it('应该能够添加并更新文件', () => {
      const mockFile = {
        id: 'file1',
        fileName: 'test.csv',
        filePath: 'C:/test/test.csv',
        encoding: 'UTF-8',
        headers: ['Key', 'Value'],
        rows: [],
        isDirty: false,
        isIgnored: false,
        lastModified: Date.now(),
      };

      act(() => {
        useProjectStore.getState().setFiles({ [mockFile.id]: mockFile });
      });

      expect(useProjectStore.getState().files['file1']).toBeDefined();
      expect(useProjectStore.getState().files['file1'].fileName).toBe('test.csv');

      act(() => {
        useProjectStore.getState().updateFile('file1', { isDirty: true });
      });

      expect(useProjectStore.getState().files['file1'].isDirty).toBe(true);
    });

    it('应该能够切换文件的忽略状态', () => {
      const fileId = 'file1';
      act(() => {
        useProjectStore.getState().setFiles({ [fileId]: { id: fileId, isIgnored: false } as any });
        useProjectStore.getState().toggleIgnoreFile(fileId);
      });

      expect(useProjectStore.getState().ignoredFileIds).toContain(fileId);
      expect(useProjectStore.getState().files[fileId].isIgnored).toBe(true);

      act(() => {
        useProjectStore.getState().toggleIgnoreFile(fileId);
      });

      expect(useProjectStore.getState().ignoredFileIds).not.toContain(fileId);
      expect(useProjectStore.getState().files[fileId].isIgnored).toBe(false);
    });
  });

  describe('EditorStore', () => {
    it('应该能够设置选中的文件和单元格', () => {
      act(() => {
        useEditorStore.getState().setSelectedFile('file1');
        useEditorStore.getState().setSelectedCell(1, 2);
      });

      expect(useEditorStore.getState().selectedFileId).toBe('file1');
      expect(useEditorStore.getState().selectedCell).toEqual({ row: 1, col: 2 });
    });

    it('切换文件时应该清除选中的单元格', () => {
      act(() => {
        useEditorStore.getState().setSelectedCell(1, 2);
        useEditorStore.getState().setSelectedFile('file2');
      });

      expect(useEditorStore.getState().selectedFileId).toBe('file2');
      expect(useEditorStore.getState().selectedCell).toBeUndefined();
    });

    it('应该能够处理搜索查询', () => {
      const query = 'test search';
      act(() => {
        useEditorStore.getState().setSearchQuery(query);
      });

      expect(useEditorStore.getState().searchQuery).toBe(query);
    });

    it('应该能够切换搜索模式', () => {
      act(() => {
        useEditorStore.getState().toggleReplaceMode();
        useEditorStore.getState().toggleRegExp();
      });

      expect(useEditorStore.getState().isReplaceMode).toBe(true);
      expect(useEditorStore.getState().isRegExp).toBe(true);
    });
  });
});
