import { create } from 'zustand';
import { produce } from 'immer';
import { HistoryState, HistoryEntry } from '../types/history';
import { v4 as uuidv4 } from 'uuid';

const MAX_HISTORY_LENGTH = 100;

export const useHistoryStore = create<HistoryState>((set, get) => ({
    past: [],
    future: [],

    pushEntry: (entry) => set(produce((state: HistoryState) => {
        // Clear future when new action is pushed
        state.future = [];
        
        const newEntry: HistoryEntry = {
            ...entry,
            id: uuidv4(),
            timestamp: Date.now()
        };

        state.past.push(newEntry);

        // Limit history length
        if (state.past.length > MAX_HISTORY_LENGTH) {
            state.past.shift();
        }
    })),

    undo: () => {
        const { past, future } = get();
        if (past.length === 0) return;

        const entry = past[past.length - 1];
        
        // Execute undo
        /* 
           NOTE: 
           Executing the undo function might trigger other store updates. 
           We assume these updates don't recursively push to history 
           because the 'push' logic should be explicit in the action, 
           not in the setter 
        */
        entry.undo();

        set(produce((state: HistoryState) => {
            const popped = state.past.pop();
            if (popped) {
                state.future.unshift(popped);
            }
        }));
    },

    redo: () => {
        const { future } = get();
        if (future.length === 0) return;

        const entry = future[0];
        
        // Execute redo
        entry.redo();

        set(produce((state: HistoryState) => {
            const shifted = state.future.shift();
            if (shifted) {
                state.past.push(shifted);
            }
        }));
    },

    clear: () => set({ past: [], future: [] }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0
}));
