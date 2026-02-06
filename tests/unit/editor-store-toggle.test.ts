
import { act } from '@testing-library/react';
import { useEditorStore } from '../../src/stores/editor-store';

// Mock localStorage if not available (though jsdom usually provides it)
const localStorageMock = (function () {
    let store: Record<string, string> = {};
    return {
        getItem: function (key: string) {
            return store[key] || null;
        },
        setItem: function (key: string, value: string) {
            store[key] = value.toString();
        },
        clear: function () {
            store = {};
        },
        removeItem: function (key: string) {
            delete store[key];
        }
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});

describe('Editor Store Toggle Columns', () => {
    beforeEach(() => {
        // Clear localStorage
        window.localStorage.clear();
        // Reset store
        act(() => {
            useEditorStore.getState().resetUI();
            useEditorStore.setState({ toggleColumns: {} });
        });
    });

    const fileId = 'test.csv';

    it('should set toggle column correctly', () => {
        const { setToggleColumn } = useEditorStore.getState();

        act(() => {
            setToggleColumn(fileId, 1, true);
        });

        expect(useEditorStore.getState().toggleColumns[fileId]).toContain(1);

        act(() => {
            setToggleColumn(fileId, 2, true);
        });

        expect(useEditorStore.getState().toggleColumns[fileId]).toEqual([1, 2]);

        act(() => {
            setToggleColumn(fileId, 1, false);
        });

        expect(useEditorStore.getState().toggleColumns[fileId]).toEqual([2]);
    });

    it('should persist to localStorage when setting toggle column', () => {
        const { setToggleColumn } = useEditorStore.getState();

        act(() => {
            setToggleColumn(fileId, 3, true);
        });

        const stored = window.localStorage.getItem('toggle-columns');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed[fileId]).toContain(3);
    });

    it('should init toggle columns from localStorage if exists', () => {
        // Setup localStorage
        window.localStorage.setItem('toggle-columns', JSON.stringify({
            [fileId]: [5, 6]
        }));

        const { initToggleColumns } = useEditorStore.getState();

        act(() => {
            // Calling init with detection results [1, 2]
            initToggleColumns(fileId, [1, 2]);
        });

        // Should prefer localStorage [5, 6]
        expect(useEditorStore.getState().toggleColumns[fileId]).toEqual([5, 6]);
    });

    it('should init toggle columns from detection if not in localStorage', () => {
        // Setup localStorage with OTHER file
        window.localStorage.setItem('toggle-columns', JSON.stringify({
            'other.csv': [9]
        }));

        const { initToggleColumns } = useEditorStore.getState();

        act(() => {
            initToggleColumns(fileId, [1, 2]);
        });

        expect(useEditorStore.getState().toggleColumns[fileId]).toEqual([1, 2]);

        // And should be saved to localStorage now
        const stored = JSON.parse(window.localStorage.getItem('toggle-columns')!);
        expect(stored[fileId]).toEqual([1, 2]);
        expect(stored['other.csv']).toEqual([9]); // Preserve other files
    });
});
