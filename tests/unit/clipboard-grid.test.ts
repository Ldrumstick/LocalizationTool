import {
    buildClipboardPastePlan,
    isMultiCellClipboard,
    parseClipboardGrid
} from '../../src/utils/clipboard-grid';

describe('clipboard-grid', () => {
    it('should parse Excel-style tabular text into cells', () => {
        const data = parseClipboardGrid('A\tB\r\nC\tD\r\n');

        expect(data).toEqual([
            ['A', 'B'],
            ['C', 'D']
        ]);
        expect(isMultiCellClipboard(data)).toBe(true);
    });

    it('should preserve quoted tabs, quotes and line breaks inside a cell', () => {
        const data = parseClipboardGrid(
            '"A\tB"\t"Line1\r\nLine2"\r\nPlain\t"Quote ""Inner"""'
        );

        expect(data).toEqual([
            ['A\tB', 'Line1\r\nLine2'],
            ['Plain', 'Quote "Inner"']
        ]);
    });

    it('should build paste updates and truncate overflow columns', () => {
        const plan = buildClipboardPastePlan(
            [
                ['A', 'B', 'C'],
                ['D', 'E', 'F']
            ],
            {
                startRow: 1,
                startCol: 1,
                maxColumns: 3,
                existingRowCount: 2
            }
        );

        expect(plan.rowsToInsert).toBe(1);
        expect(plan.bounds).toEqual({
            startRow: 1,
            startCol: 1,
            endRow: 2,
            endCol: 2
        });
        expect(plan.updates).toEqual([
            { row: 1, col: 1, value: 'A' },
            { row: 1, col: 2, value: 'B' },
            { row: 2, col: 1, value: 'D' },
            { row: 2, col: 2, value: 'E' }
        ]);
    });
});
