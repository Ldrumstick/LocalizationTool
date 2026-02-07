
export enum HistoryOperationType {
    CELL_EDIT = 'CELL_EDIT',
    ROW_INSERT = 'ROW_INSERT',
    ROW_DELETE = 'ROW_DELETE',
    COL_INSERT = 'COL_INSERT',
    COL_DELETE = 'COL_DELETE',
    PASTE = 'PASTE',
    FILL = 'FILL'
}

export interface HistoryEntry {
    id: string;
    timestamp: number;
    description: string;
    fileId: string;
    type: HistoryOperationType;
    // We store closures for undo/redo to handle state changes
    undo: () => void;
    redo: () => void;
}

export interface HistoryState {
    past: HistoryEntry[];
    future: HistoryEntry[];

    // Actions
    pushEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
    undo: () => void;
    redo: () => void;
    clear: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
}
