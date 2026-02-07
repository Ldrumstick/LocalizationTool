import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { produce } from 'immer';
import { ProjectData, CSVFileData } from '../types';
import { useHistoryStore } from './history-store';
import { HistoryOperationType } from '../types/history';
import { useEditorStore } from './editor-store';

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
  
  // Fine-grained Editing Actions (History Aware)
  updateCell: (fileId: string, rowIndex: number, colIndex: number, value: string) => void;
  batchUpdateCells: (fileId: string, updates: { row: number; col: number; value: string }[], description?: string) => void;
  updateHeader: (fileId: string, colIndex: number, name: string) => void;
  
  // Batch Actions (History Aware)
  insertRows: (fileId: string, index: number, count: number) => void;
  deleteRows: (fileId: string, indices: number[]) => void;
  insertColumns: (fileId: string, index: number, count: number) => void;
  deleteColumns: (fileId: string, indices: number[]) => void;
  duplicateRows: (fileId: string, indices: number[]) => void;
   
  // File Monitoring Actions
  reloadFile: (fileId: string, fileData: any, timestamp: number) => void;
  updateFileTimestamp: (fileId: string, timestamp: number) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
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
            // Sync ignored status from persisted list
            Object.keys(files).forEach((fileId) => {
              if (state.ignoredFileIds.includes(fileId)) {
                files[fileId].isIgnored = true;
              }
            });
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

      updateCell: (fileId, rowIndex, colIndex, value) => {
          const state = get();
          const file = state.files[fileId];
          if (!file) return;
          
          const oldValue = file.rows[rowIndex]?.cells[colIndex] ?? '';
          if (oldValue === value) return; // No change

          // Perform update
          set(produce((draft: ProjectState) => {
             if (draft.files[fileId]?.rows[rowIndex]?.cells) {
                 draft.files[fileId].rows[rowIndex].cells[colIndex] = value;
                 draft.files[fileId].isDirty = true;
             }
          }));

          // Record History
          useHistoryStore.getState().pushEntry({
              type: HistoryOperationType.CELL_EDIT,
              fileId,
              description: `编辑单元格 [${rowIndex+1}, ${colIndex+1}]`,
              undo: () => {
                  useProjectStore.setState(produce((draft: ProjectState) => {
                     if (draft.files[fileId]?.rows[rowIndex]?.cells) {
                         draft.files[fileId].rows[rowIndex].cells[colIndex] = oldValue;
                         draft.files[fileId].isDirty = true;
                     }
                  }));
                  // Auto-focus
                  useEditorStore.getState().setSelectedFile(fileId);
                  useEditorStore.getState().setSelectedCell(rowIndex, colIndex);
              },
              redo: () => {
                   useProjectStore.setState(produce((draft: ProjectState) => {
                     if (draft.files[fileId]?.rows[rowIndex]?.cells) {
                         draft.files[fileId].rows[rowIndex].cells[colIndex] = value;
                         draft.files[fileId].isDirty = true;
                     }
                  }));
                  // Auto-focus
                  useEditorStore.getState().setSelectedFile(fileId);
                  useEditorStore.getState().setSelectedCell(rowIndex, colIndex);
              }
          });
      },

      batchUpdateCells: (fileId, updates, description) => {
          const state = get();
          const file = state.files[fileId];
          if (!file) return;

          // Capture old values for Undo
          const historyUpdates = updates.map(u => ({
              ...u,
              oldValue: file.rows[u.row]?.cells[u.col] ?? ''
          })).filter(u => u.oldValue !== u.value); // Optimistic filtering

          if (historyUpdates.length === 0) return;

          set(produce((draft: ProjectState) => {
              const f = draft.files[fileId];
              if (f) {
                  historyUpdates.forEach(u => {
                      if (f.rows[u.row]?.cells) {
                          f.rows[u.row].cells[u.col] = u.value;
                      }
                  });
                  f.isDirty = true;
              }
          }));

          useHistoryStore.getState().pushEntry({
              type: HistoryOperationType.PASTE, // Generalize type or use argument? PASTE/FILL fit here.
              fileId,
              description: description || `批量修改 ${historyUpdates.length} 个单元格`,
              undo: () => {
                  useProjectStore.setState(produce((draft: ProjectState) => {
                      const f = draft.files[fileId];
                      if (f) {
                          historyUpdates.forEach(u => {
                              if (f.rows[u.row]?.cells) {
                                  f.rows[u.row].cells[u.col] = u.oldValue;
                              }
                          });
                          f.isDirty = true;
                      }
                  }));
                  
                  // Auto-focus on Undo
                  if (historyUpdates.length > 0) {
                      useEditorStore.getState().setSelectedFile(fileId);
                      const minRow = Math.min(...historyUpdates.map(u => u.row));
                      const maxRow = Math.max(...historyUpdates.map(u => u.row));
                      const minCol = Math.min(...historyUpdates.map(u => u.col));
                      const maxCol = Math.max(...historyUpdates.map(u => u.col));
                      
                      useEditorStore.getState().setSelectedCell(minRow, minCol);
                      useEditorStore.getState().setSelectedRange(
                          { row: minRow, col: minCol },
                          { row: maxRow, col: maxCol }
                      );
                  }
              },
              redo: () => {
                  useProjectStore.setState(produce((draft: ProjectState) => {
                      const f = draft.files[fileId];
                      if (f) {
                          historyUpdates.forEach(u => {
                              if (f.rows[u.row]?.cells) {
                                  f.rows[u.row].cells[u.col] = u.value;
                              }
                          });
                          f.isDirty = true;
                      }
                  }));

                  // Auto-focus on Redo (Same logic)
                  if (historyUpdates.length > 0) {
                      useEditorStore.getState().setSelectedFile(fileId);
                      const minRow = Math.min(...historyUpdates.map(u => u.row));
                      const maxRow = Math.max(...historyUpdates.map(u => u.row));
                      const minCol = Math.min(...historyUpdates.map(u => u.col));
                      const maxCol = Math.max(...historyUpdates.map(u => u.col));
                      
                      useEditorStore.getState().setSelectedCell(minRow, minCol);
                      useEditorStore.getState().setSelectedRange(
                          { row: minRow, col: minCol },
                          { row: maxRow, col: maxCol }
                      );
                  }
              }
          });
      },

      updateHeader: (fileId, colIndex, name) => {
        const state = get();
        const file = state.files[fileId];
        if (!file) return;
        
        // Capture old value for (potential) history
        // const oldName = file.headers[colIndex];

        set(produce((draft: ProjectState) => {
            if (draft.files[fileId]?.headers) {
                draft.files[fileId].headers[colIndex] = name;
                draft.files[fileId].isDirty = true;
            }
        }));
      },

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
      insertRows: (fileId, index, count) => {
        set(produce((state: ProjectState) => {
            const file = state.files[fileId];
            if (!file) return;

            const newRows: any[] = [];
            const colCount = file.headers.length;

            for (let i = 0; i < count; i++) {
              newRows.push({
                rowIndex: 0, 
                cells: new Array(colCount).fill(''),
                key: '',
              });
            }

            file.rows.splice(index, 0, ...newRows);
            file.rows.forEach((row, idx) => { row.rowIndex = idx; });
            file.isDirty = true;
        }));

        // History
        useHistoryStore.getState().pushEntry({
            type: HistoryOperationType.ROW_INSERT,
            fileId,
            description: `插入 ${count} 行`,
            undo: () => {
                useProjectStore.setState(produce((draft: ProjectState) => {
                    const f = draft.files[fileId];
                    if (f) {
                        f.rows.splice(index, count);
                        f.rows.forEach((row, idx) => { row.rowIndex = idx; });
                        f.isDirty = true;
                    }
                }));
                useEditorStore.getState().setSelectedFile(fileId);
                useEditorStore.getState().setSelectedCell(index, 0);
            },
            redo: () => {
                 useProjectStore.setState(produce((draft: ProjectState) => {
                    const f = draft.files[fileId];
                    if (f) {
                        const newRows: any[] = [];
                        const colCount = f.headers.length;
                        for (let i = 0; i < count; i++) {
                            newRows.push({ rowIndex: 0, cells: new Array(colCount).fill(''), key: '' });
                        }
                        f.rows.splice(index, 0, ...newRows);
                        f.rows.forEach((row, idx) => { row.rowIndex = idx; });
                        f.isDirty = true;
                    }
                 }));
                 useEditorStore.getState().setSelectedFile(fileId);
                 useEditorStore.getState().setSelectedCell(index, 0);
            }
        });
      },

      deleteRows: (fileId, indices) => {
        const state = get();
        const file = state.files[fileId];
        if (!file) return;
        
        // Capture deleted data for Undo: { idx, row }
        const deletedRowsData = indices.map(idx => ({ idx, row: file.rows[idx] })).filter(item => item.row);
        
        set(produce((state: ProjectState) => {
            const f = state.files[fileId];
            if (!f) return;
            const sortedIndices = [...indices].sort((a, b) => b - a);
            sortedIndices.forEach((idx) => {
              if (idx >= 0 && idx < f.rows.length) {
                f.rows.splice(idx, 1);
              }
            });
            f.rows.forEach((row, idx) => { row.rowIndex = idx; });
            f.isDirty = true;
        }));

        useHistoryStore.getState().pushEntry({
            type: HistoryOperationType.ROW_DELETE,
            fileId,
            description: `删除 ${indices.length} 行`,
            undo: () => {
                 useProjectStore.setState(produce((draft: ProjectState) => {
                    const f = draft.files[fileId];
                    if (f) {
                        const sorted = [...deletedRowsData].sort((a, b) => a.idx - b.idx);
                        
                        sorted.forEach(item => {
                            // Clone to avoid mutating frozen object
                            f.rows.splice(item.idx, 0, { ...item.row, cells: [...item.row.cells] });
                        });
                        
                        f.rows.forEach((row, idx) => { row.rowIndex = idx; });
                        f.isDirty = true;
                    }
                 }));
                 // Select restored rows
                 const minIdx = Math.min(...indices);
                 useEditorStore.getState().setSelectedFile(fileId);
                 useEditorStore.getState().setSelectedCell(minIdx, 0);
            },
            redo: () => {
                 useProjectStore.setState(produce((draft: ProjectState) => {
                    const f = draft.files[fileId];
                    if (f) {
                        const sortedIndices = [...indices].sort((a, b) => b - a);
                        sortedIndices.forEach((idx) => {
                             if (idx >= 0 && idx < f.rows.length) f.rows.splice(idx, 1);
                        });
                        f.rows.forEach((row, idx) => { row.rowIndex = idx; });
                        f.isDirty = true;
                    }
                 }));
                 // No specific selection needed on redo delete, maybe clear?
                 useEditorStore.getState().setSelectedFile(fileId);
                 useEditorStore.getState().setSelectedCell(undefined);
            }
        });
      },

      insertColumns: (fileId, index, count) => {
        set(produce((state: ProjectState) => {
            const f = state.files[fileId];
            if (!f) return;
            const newHeaders = new Array(count).fill('');
            f.headers.splice(index, 0, ...newHeaders);
            f.rows.forEach(row => {
              const newCells = new Array(count).fill('');
              row.cells.splice(index, 0, ...newCells);
            });
            f.isDirty = true;
        }));
        
        useHistoryStore.getState().pushEntry({
             type: HistoryOperationType.COL_INSERT,
             fileId,
             description: `插入 ${count} 列`,
             undo: () => {
                 useProjectStore.setState(produce((draft: ProjectState) => {
                     const f = draft.files[fileId];
                     if(f) {
                         f.headers.splice(index, count);
                         f.rows.forEach(row => row.cells.splice(index, count));
                         f.isDirty = true;
                     }
                 }));
                 useEditorStore.getState().setSelectedCell(0, index);
             },
             redo: () => {
                 useProjectStore.setState(produce((draft: ProjectState) => {
                     const f = draft.files[fileId];
                     if (f) {
                         const newHeaders = new Array(count).fill('');
                         f.headers.splice(index, 0, ...newHeaders);
                         f.rows.forEach(row => {
                             const newCells = new Array(count).fill('');
                             row.cells.splice(index, 0, ...newCells);
                         });
                         f.isDirty = true;
                     }
                 }));
                 useEditorStore.getState().setSelectedFile(fileId);
                 useEditorStore.getState().setSelectedCell(0, index);
             }
        });
      },

      deleteColumns: (fileId, indices) => {
        const state = get();
        const file = state.files[fileId];
        if (!file) return;

        const deletedColsData = indices.map(idx => {
            return {
                idx,
                header: file.headers[idx],
                cells: file.rows.map(r => r.cells[idx])
            };
        });

        set(produce((state: ProjectState) => {
            const f = state.files[fileId];
             if (!f) return;
            const sortedIndices = [...indices].sort((a, b) => b - a);
            sortedIndices.forEach(idx => {
              if (idx >= 0 && idx < f.headers.length) f.headers.splice(idx, 1);
            });
            f.rows.forEach(row => {
              sortedIndices.forEach(idx => {
                if (idx >= 0 && idx < row.cells.length) row.cells.splice(idx, 1);
              });
            });
            f.isDirty = true;
        }));
        
        useHistoryStore.getState().pushEntry({
            type: HistoryOperationType.COL_DELETE,
            fileId,
            description: `删除 ${indices.length} 列`,
            undo: () => {
                useProjectStore.setState(produce((draft: ProjectState) => {
                    const f = draft.files[fileId];
                     if (!f) return;
                    const sortedData = [...deletedColsData].sort((a, b) => a.idx - b.idx);
                    sortedData.forEach(colData => {
                        f.headers.splice(colData.idx, 0, colData.header);
                        f.rows.forEach((row, rIdx) => {
                            row.cells.splice(colData.idx, 0, colData.cells[rIdx]);
                        });
                    });
                    f.isDirty = true;
                }));
                const minIdx = Math.min(...indices);
                useEditorStore.getState().setSelectedFile(fileId);
                useEditorStore.getState().setSelectedCell(0, minIdx);
            },
            redo: () => {
                 useProjectStore.setState(produce((draft: ProjectState) => {
                    const f = draft.files[fileId];
                     if (!f) return;
                    const sortedIndices = [...indices].sort((a, b) => b - a);
                    sortedIndices.forEach(idx => {
                       if (idx >= 0 && idx < f.headers.length) f.headers.splice(idx, 1);
                    });
                    f.rows.forEach(row => {
                      sortedIndices.forEach(idx => {
                        if (idx >= 0 && idx < row.cells.length) row.cells.splice(idx, 1);
                      });
                    });
                    f.isDirty = true;
                 }));
                 useEditorStore.getState().setSelectedFile(fileId);
                 useEditorStore.getState().setSelectedCell(undefined);
            }
        });
      },
        
      duplicateRows: (fileId, indices) => {
        const sortedIndices = [...indices].sort((a, b) => b - a);
        
        // Calculate where the new rows will be for Undo
        // formula: originalIndex + 1 + (count of original indices smaller than it)
        const addedIndices = indices.map(i => i + 1 + indices.filter(x => x < i).length);

        set(
          produce((state: ProjectState) => {
            const file = state.files[fileId];
            if (!file) return;
            
            sortedIndices.forEach(idx => {
               if (idx >= 0 && idx < file.rows.length) {
                 const original = file.rows[idx];
                 const copy = { ...original, cells: [...original.cells] }; 
                 if (copy.key) copy.key = `${copy.key}_copy`; 
                 file.rows.splice(idx + 1, 0, copy);
               }
            });

            file.rows.forEach((row, idx) => {
              row.rowIndex = idx;
            });
            
            file.isDirty = true;
          })
        );

        useHistoryStore.getState().pushEntry({
            type: HistoryOperationType.ROW_INSERT, // Reuse ROW_INSERT or new type? ROW_INSERT fits.
            fileId,
            description: `复制 ${indices.length} 行`,
            undo: () => {
                useProjectStore.setState(produce((draft: ProjectState) => {
                    const f = draft.files[fileId];
                    if (f) {
                        // Delete the added rows. specific indices.
                        // Sort descending to avoid shift issues during deletion
                        const idsToDelete = [...addedIndices].sort((a, b) => b - a);
                        idsToDelete.forEach(idx => {
                            if (idx < f.rows.length) f.rows.splice(idx, 1);
                        });
                        f.rows.forEach((row, idx) => { row.rowIndex = idx; });
                        f.isDirty = true;
                    }
                }));
                // Select original source? or clear?
                // Let's select the first original row
                const minIdx = Math.min(...indices);
                useEditorStore.getState().setSelectedFile(fileId);
                useEditorStore.getState().setSelectedCell(minIdx, 0);
            },
            redo: () => {
                 useProjectStore.setState(produce((draft: ProjectState) => {
                    const f = draft.files[fileId];
                    if (f) {
                        const sorted = [...indices].sort((a, b) => b - a);
                        sorted.forEach(idx => {
                           if (idx >= 0 && idx < f.rows.length) {
                             const original = f.rows[idx];
                             const copy = { ...original, cells: [...original.cells] }; 
                             if (copy.key) copy.key = `${copy.key}_copy`; 
                             f.rows.splice(idx + 1, 0, copy);
                           }
                        });
                        f.rows.forEach((row, idx) => { row.rowIndex = idx; });
                        f.isDirty = true;
                    }
                 }));
                 // Select the newly added rows (conceptually)
                 // But they might be scattered. Just select the first one.
                 const firstNewIdx = addedIndices[0];
                 useEditorStore.getState().setSelectedFile(fileId);
                 useEditorStore.getState().setSelectedCell(firstNewIdx, 0);
            }
        });
      },

      reloadFile: (fileId, fileData, timestamp) =>
        set(
          produce((state: ProjectState) => {
            if (state.files[fileId]) {
              state.files[fileId] = {
                ...state.files[fileId],
                headers: fileData.headers,
                rows: fileData.rows,
                isDirty: false,
                lastModified: timestamp
              };
            }
          })
        ),

      updateFileTimestamp: (fileId, timestamp) =>
        set(
          produce((state: ProjectState) => {
            if (state.files[fileId]) {
              state.files[fileId].lastModified = timestamp;
            }
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
