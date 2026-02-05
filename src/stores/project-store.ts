import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { produce } from 'immer';
import { ProjectData, CSVFileData } from '../types';

interface ProjectState extends ProjectData {
  // Actions
  setProjectPath: (path: string) => void;
  setFiles: (files: Record<string, CSVFileData>) => void;
  updateFile: (fileId: string, updates: Partial<CSVFileData>) => void;
  toggleIgnoreFile: (fileId: string) => void;
  setLastOpenedFile: (fileId: string) => void;
  resetProject: () => void;
  
  // Indexing Actions
  setKeyIndex: (index: Record<string, string[]>) => void;
  updateKeyIndex: (fileId: string, keys: string[]) => void;
  updateHeader: (fileId: string, colIndex: number, name: string) => void;
  
  // Batch Actions
  insertRows: (fileId: string, index: number, count: number) => void;
  deleteRows: (fileId: string, indices: number[]) => void;
  insertColumns: (fileId: string, index: number, count: number) => void;
  deleteColumns: (fileId: string, indices: number[]) => void;
  duplicateRows: (fileId: string, indices: number[]) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projectPath: '',
      files: {},
      ignoredFileIds: [],
      lastOpenedFileId: undefined,

      setProjectPath: (path) =>
        set(
          produce((state: ProjectState) => {
            state.projectPath = path;
          })
        ),

      setFiles: (files) =>
        set(
          produce((state: ProjectState) => {
            state.files = files;
          })
        ),

      updateFile: (fileId, updates) =>
        set(
          produce((state: ProjectState) => {
            if (state.files[fileId]) {
              state.files[fileId] = { ...state.files[fileId], ...updates };
            }
          })
        ),

      // 新增：全量更新 Key Index
      setKeyIndex: (index) => 
        set(
          produce((state: ProjectState) => {
            state.keyIndex = index;
          })
        ),

      // 新增：更新单个文件的 Key Index (用于编辑时)
      updateKeyIndex: (fileId, keys) =>
        set(
          produce((state: ProjectState) => {
            if (state.keyIndex) {
              state.keyIndex[fileId] = keys;
            }
          })
        ),

      updateHeader: (fileId, colIndex, name) => 
        set(
            produce((state: ProjectState) => {
                const file = state.files[fileId];
                if (file && file.headers[colIndex] !== undefined) {
                    file.headers[colIndex] = name;
                    file.isDirty = true;
                }
            })
        ),

      toggleIgnoreFile: (fileId) =>
        set(
          produce((state: ProjectState) => {
            const index = state.ignoredFileIds.indexOf(fileId);
            if (index > -1) {
              state.ignoredFileIds.splice(index, 1);
              if (state.files[fileId]) state.files[fileId].isIgnored = false;
            } else {
              state.ignoredFileIds.push(fileId);
              if (state.files[fileId]) state.files[fileId].isIgnored = true;
            }
          })
        ),

      setLastOpenedFile: (fileId) =>
        set(
          produce((state: ProjectState) => {
            state.lastOpenedFileId = fileId;
          })
        ),

      resetProject: () =>
        set({
          projectPath: '',
          files: {},
          ignoredFileIds: [],
          lastOpenedFileId: undefined,
        }),

      // Batch Actions Implementation
      insertRows: (fileId, index, count) =>
        set(
          produce((state: ProjectState) => {
            const file = state.files[fileId];
            if (!file) return;

            const newRows: any[] = [];
            const colCount = file.headers.length; // Or file.rows[0]?.cells.length

            for (let i = 0; i < count; i++) {
              newRows.push({
                rowIndex: 0, // Will be re-indexed
                cells: new Array(colCount).fill(''),
                key: '',
              });
            }

            // Insert
            file.rows.splice(index, 0, ...newRows);

            // Re-index
            file.rows.forEach((row, idx) => {
              row.rowIndex = idx;
            });

            file.isDirty = true;
          })
        ),

      deleteRows: (fileId, indices) =>
        set(
          produce((state: ProjectState) => {
            const file = state.files[fileId];
            if (!file) return;

            // Sort descending to avoid index shifting issues
            const sortedIndices = [...indices].sort((a, b) => b - a);
            
            sortedIndices.forEach((idx) => {
              if (idx >= 0 && idx < file.rows.length) {
                file.rows.splice(idx, 1);
              }
            });

            // Re-index
            file.rows.forEach((row, idx) => {
              row.rowIndex = idx;
            });
            
            file.isDirty = true;
          })
        ),

      insertColumns: (fileId, index, count) =>
        set(
          produce((state: ProjectState) => {
            const file = state.files[fileId];
            if (!file) return;

            // Update Headers
            const newHeaders = new Array(count).fill('');
            // Generate default header names if needed? Or just empty.
            // Excel uses A, B, C... but here headers are first row maybe? 
            // In types, headers are string[].
            file.headers.splice(index, 0, ...newHeaders);

            // Update Rows
            file.rows.forEach(row => {
              const newCells = new Array(count).fill('');
              row.cells.splice(index, 0, ...newCells);
            });

            file.isDirty = true;
          })
        ),

      deleteColumns: (fileId, indices) =>
        set(
          produce((state: ProjectState) => {
            const file = state.files[fileId];
            if (!file) return;

            // Sort descending
            const sortedIndices = [...indices].sort((a, b) => b - a);

            // Remove from Headers
            sortedIndices.forEach(idx => {
              if (idx >= 0 && idx < file.headers.length) {
                file.headers.splice(idx, 1);
              }
            });

            // Remove from Rows
            file.rows.forEach(row => {
              sortedIndices.forEach(idx => {
                if (idx >= 0 && idx < row.cells.length) {
                  row.cells.splice(idx, 1);
                }
              });
            });

            file.isDirty = true;
          })
        ),
        
      duplicateRows: (fileId, indices) =>
        set(
          produce((state: ProjectState) => {
            const file = state.files[fileId];
            if (!file) return;
            
            const sortedIndices = [...indices].sort((a, b) => b - a); // Insert from bottom up?
            // Actually if we duplicate, where do we insert? Below the original?
            // Usually "Duplicate" means clone and insert after.
            // Dealing with multiple non-contiguous selection duplication is tricky.
            // Let's assume we insert copies right after each original, starting from bottom to avoid index shift affecting upcoming processing.
            
            sortedIndices.forEach(idx => {
               if (idx >= 0 && idx < file.rows.length) {
                 const original = file.rows[idx];
                 const copy = { ...original, cells: [...original.cells] }; // Deep clone cells
                 // Key duplication? Should be empty or suffixed?
                 // For now, keep it same (validation will flag it) or maybe append '_copy'?
                 // Let's keep it same for now.
                 if (copy.key) copy.key = `${copy.key}_copy`; // Simple avoidance
                 
                 file.rows.splice(idx + 1, 0, copy);
               }
            });

            // Re-index
            file.rows.forEach((row, idx) => {
              row.rowIndex = idx;
            });
            
            file.isDirty = true;
          })
        ),
    }),
    {
      name: 'localization-project-storage',
      partialize: (state) => ({
        projectPath: state.projectPath,
        ignoredFileIds: state.ignoredFileIds,
        lastOpenedFileId: state.lastOpenedFileId,
      }),
    }
  )
);
