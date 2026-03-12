import { useEditorStore } from '../stores/editor-store';
import { useProjectStore } from '../stores/project-store';

type CommitActiveEditOptions = {
  exitEditing?: boolean;
  blur?: boolean;
};

function getCurrentEditingValue(fileId: string, rowIndex: number, colIndex: number): string {
  const file = useProjectStore.getState().files[fileId];
  return file?.rows[rowIndex]?.cells[colIndex] ?? '';
}

function getCurrentEditingHeader(fileId: string, colIndex: number): string {
  const file = useProjectStore.getState().files[fileId];
  return file?.headers[colIndex] ?? '';
}

export function hasPendingActiveEdit(fileId?: string): boolean {
  const editorState = useEditorStore.getState();
  const editingFileId = editorState.selectedFileId;

  if (!editorState.isEditing || !editingFileId) return false;
  if (fileId && editingFileId !== fileId) return false;

  if (editorState.editingLocation === 'header') {
    const colIndex = editorState.editingCell?.col;
    if (colIndex === undefined || colIndex < 0) return false;
    return editorState.tempValue !== getCurrentEditingHeader(editingFileId, colIndex);
  }

  const editingTarget = editorState.editingCell ?? editorState.selectedCell;
  if (!editingTarget) return false;

  return editorState.tempValue !== getCurrentEditingValue(editingFileId, editingTarget.row, editingTarget.col);
}

export function commitActiveEdit(options: CommitActiveEditOptions = {}): boolean {
  const { exitEditing = false, blur = false } = options;
  const editorState = useEditorStore.getState();
  const editingFileId = editorState.selectedFileId;

  if (!editorState.isEditing || !editingFileId) {
    if (blur) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }
    }
    if (exitEditing && editorState.isEditing) {
      editorState.exitEditMode(true);
    }
    return false;
  }

  let hasCommittedChange = false;
  const projectStore = useProjectStore.getState();

  if (editorState.editingLocation === 'header') {
    const colIndex = editorState.editingCell?.col;
    if (colIndex !== undefined && colIndex >= 0) {
      const currentHeader = getCurrentEditingHeader(editingFileId, colIndex);
      if (editorState.tempValue !== currentHeader) {
        projectStore.updateHeader(editingFileId, colIndex, editorState.tempValue);
        hasCommittedChange = true;
      }
    }
  } else {
    const editingTarget = editorState.editingCell ?? editorState.selectedCell;
    if (editingTarget) {
      const currentValue = getCurrentEditingValue(editingFileId, editingTarget.row, editingTarget.col);
      if (editorState.tempValue !== currentValue) {
        projectStore.updateCell(editingFileId, editingTarget.row, editingTarget.col, editorState.tempValue);
        hasCommittedChange = true;
      }
    }
  }

  if (blur) {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
    editorState.editorView?.contentDOM.blur?.();
    editorState.editorView?.dom.blur?.();
  }

  if (exitEditing) {
    editorState.exitEditMode(true);
  }

  return hasCommittedChange;
}
