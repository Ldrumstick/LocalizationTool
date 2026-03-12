import * as Papa from 'papaparse';

export interface ClipboardCellUpdate {
    row: number;
    col: number;
    value: string;
}

export interface ClipboardPasteBounds {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

export interface ClipboardPastePlan {
    updates: ClipboardCellUpdate[];
    rowsToInsert: number;
    bounds?: ClipboardPasteBounds;
}

interface ClipboardPastePlanOptions {
    startRow: number;
    startCol: number;
    maxColumns: number;
    existingRowCount: number;
}

export function parseClipboardGrid(text: string): string[][] {
    if (!text) return [];

    const result = Papa.parse<string[]>(text, {
        delimiter: '\t',
        skipEmptyLines: false
    });

    const data = result.data.map((row) => row.map((cell) => cell ?? ''));

    if (data.length > 1) {
        const lastRow = data[data.length - 1];
        if (lastRow.length === 1 && lastRow[0] === '') {
            data.pop();
        }
    }

    return data;
}

export function isMultiCellClipboard(data: string[][]): boolean {
    return data.length > 1 || data.some((row) => row.length > 1);
}

export function buildClipboardPastePlan(
    data: string[][],
    options: ClipboardPastePlanOptions
): ClipboardPastePlan {
    if (data.length === 0 || options.maxColumns <= options.startCol) {
        return { updates: [], rowsToInsert: 0 };
    }

    const updates: ClipboardCellUpdate[] = [];
    let maxAppliedColumns = 0;

    data.forEach((rowData, rowIndex) => {
        maxAppliedColumns = Math.max(
            maxAppliedColumns,
            Math.min(rowData.length, options.maxColumns - options.startCol)
        );

        rowData.forEach((cellValue, colIndex) => {
            const targetCol = options.startCol + colIndex;
            if (targetCol >= options.maxColumns) return;

            updates.push({
                row: options.startRow + rowIndex,
                col: targetCol,
                value: cellValue
            });
        });
    });

    if (updates.length === 0 || maxAppliedColumns === 0) {
        return { updates: [], rowsToInsert: 0 };
    }

    const totalRowsNeeded = Math.max(options.existingRowCount, options.startRow + data.length);

    return {
        updates,
        rowsToInsert: Math.max(0, totalRowsNeeded - options.existingRowCount),
        bounds: {
            startRow: options.startRow,
            startCol: options.startCol,
            endRow: options.startRow + data.length - 1,
            endCol: options.startCol + maxAppliedColumns - 1
        }
    };
}
