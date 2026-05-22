import {
  CompactSelection,
  GridCellKind,
  type BooleanCell,
  type EditableGridCell,
  type GridSelection,
} from '@glideapps/glide-data-grid';
import {
  buildGlideColumns,
  buildNumericFillUpdates,
  createCsvTextCell,
  gridSelectionToEditorSelection,
  mapCellsEditedToUpdates,
  selectionToClearUpdates,
} from '../../src/components/Editor/glide-grid-adapter';
import { CSVRow, SearchResult, ValidationError } from '../../src/types';

const rows: CSVRow[] = [
  { rowIndex: 0, cells: ['HELLO', 'Original value'], key: 'HELLO' },
  { rowIndex: 1, cells: ['bad-key', 'Matched value'], key: 'bad-key' },
];

const searchResults: SearchResult[] = [
  {
    fileId: 'file-1',
    rowIndex: 1,
    colIndex: 1,
    key: 'bad-key',
    context: 'Matched value',
  },
];

describe('glide-grid-adapter', () => {
  test('builds memo-friendly Glide columns from headers and stored widths', () => {
    expect(buildGlideColumns(['ID', 'en'], 'file-1', { 'file-1': { 1: 260 } })).toEqual([
      { title: 'ID', id: 'col-0', width: 180, hasMenu: true, menuIcon: 'dots' },
      { title: 'en', id: 'col-1', width: 260, hasMenu: true, menuIcon: 'dots' },
    ]);
  });

  test('creates text cells with invalid-key, search, current-search and edit-preview styling', () => {
    const invalidKeyCell = createCsvTextCell({
      rows,
      rowIndex: 1,
      colIndex: 0,
      selectedFileId: 'file-1',
      searchResults,
    });

    expect(invalidKeyCell.kind).toBe(GridCellKind.Text);
    expect(invalidKeyCell.data).toBe('bad-key');
    expect(invalidKeyCell.themeOverride?.bgCell).toBe('rgba(217, 48, 37, 0.06)');
    expect(invalidKeyCell.themeOverride?.accentLight).toBe('rgba(217, 48, 37, 0.12)');

    const searchCell = createCsvTextCell({
      rows,
      rowIndex: 1,
      colIndex: 1,
      selectedFileId: 'file-1',
      searchResults,
    });

    expect(searchCell.themeOverride?.bgCell).toBe('rgba(255, 255, 0, 0.2)');

    const currentSearchCell = createCsvTextCell({
      rows,
      rowIndex: 1,
      colIndex: 1,
      selectedFileId: 'file-1',
      searchResults,
      currentSearchResult: searchResults[0],
    });

    expect(currentSearchCell.themeOverride?.bgCell).toBe('#ffd966');
    expect(currentSearchCell.themeOverride?.fontWeight).toBe('600');

    const previewCell = createCsvTextCell({
      rows,
      rowIndex: 0,
      colIndex: 1,
      selectedFileId: 'file-1',
      searchResults: [],
      editingPreview: {
        row: 0,
        col: 1,
        value: 'Edited preview',
      },
    });

    expect(previewCell.data).toBe('Edited preview');
    expect(previewCell.displayData).toBe('Edited preview');
  });

  test('colors ID cells that have validation errors', () => {
    const validationErrors: ValidationError[] = [
      {
        fileId: 'file-1',
        rowIndex: 0,
        colIndex: 0,
        message: '重复 Key: "HELLO"',
        type: 'duplicate_key',
      },
    ];

    const duplicateKeyCell = createCsvTextCell({
      rows,
      rowIndex: 0,
      colIndex: 0,
      selectedFileId: 'file-1',
      searchResults: [],
      validationErrors,
    });

    expect(duplicateKeyCell.themeOverride?.bgCell).toBe('rgba(217, 48, 37, 0.06)');
    expect(duplicateKeyCell.themeOverride?.accentLight).toBe('rgba(217, 48, 37, 0.12)');
    expect(duplicateKeyCell.themeOverride?.textDark).toBe('#d93025');
  });

  test('maps Glide selection to editor selected cell and range', () => {
    const selection: GridSelection = {
      current: {
        cell: [1, 2],
        range: { x: 1, y: 2, width: 2, height: 3 },
        rangeStack: [],
      },
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
    };

    expect(gridSelectionToEditorSelection(selection)).toEqual({
      selectedCell: { row: 2, col: 1 },
      selectedRange: {
        start: { row: 2, col: 1 },
        end: { row: 4, col: 2 },
      },
    });
  });

  test('maps Glide row and column selections to editor bounds', () => {
    const rowSelection: GridSelection = {
      current: undefined,
      columns: CompactSelection.empty(),
      rows: CompactSelection.fromSingleSelection([1, 3]),
    };

    expect(gridSelectionToEditorSelection(rowSelection, { rowCount: 10, colCount: 4 })).toEqual({
      selectedCell: { row: 1, col: 0 },
      selectedRange: {
        start: { row: 1, col: 0 },
        end: { row: 2, col: 3 },
      },
    });

    const columnSelection: GridSelection = {
      current: undefined,
      columns: CompactSelection.fromSingleSelection([1, 3]),
      rows: CompactSelection.empty(),
    };

    expect(gridSelectionToEditorSelection(columnSelection, { rowCount: 4, colCount: 5 })).toEqual({
      selectedCell: { row: 0, col: 1 },
      selectedRange: {
        start: { row: 0, col: 1 },
        end: { row: 3, col: 2 },
      },
    });
  });

  test('maps batch edits to project-store cell updates and ignores non-text values', () => {
    const textCell: EditableGridCell = {
      kind: GridCellKind.Text,
      allowOverlay: true,
      data: 'New value',
      displayData: 'New value',
    };
    const markdownCell: EditableGridCell = {
      kind: GridCellKind.Markdown,
      allowOverlay: true,
      data: 'ignored',
    };

    expect(mapCellsEditedToUpdates([
      { location: [1, 0], value: textCell },
      { location: [0, 1], value: markdownCell },
    ])).toEqual([{ row: 0, col: 1, value: 'New value' }]);
  });

  test('maps BooleanCell edits back to the previous CSV boolean format', () => {
    const trueBooleanCell: EditableGridCell = {
      kind: GridCellKind.Boolean,
      allowOverlay: false,
      data: true,
    };
    const falseBooleanCell: EditableGridCell = {
      kind: GridCellKind.Boolean,
      allowOverlay: false,
      data: false,
    };

    expect(mapCellsEditedToUpdates([
      { location: [1, 0], value: falseBooleanCell },
      { location: [1, 1], value: trueBooleanCell },
      { location: [1, 2], value: falseBooleanCell },
    ], [
      { rowIndex: 0, cells: ['KEY_A', '1'], key: 'KEY_A' },
      { rowIndex: 1, cells: ['KEY_B', 'false'], key: 'KEY_B' },
      { rowIndex: 2, cells: ['KEY_C', 'TRUE'], key: 'KEY_C' },
    ])).toEqual([
      { row: 0, col: 1, value: '0' },
      { row: 1, col: 1, value: 'true' },
      { row: 2, col: 1, value: 'FALSE' },
    ]);
  });

  test('creates native BooleanCells for toggle columns while keeping CSV copy data', () => {
    const toggleCell = createCsvTextCell({
      rows: [{ rowIndex: 0, cells: ['LOCKED', '1'], key: 'LOCKED' }],
      rowIndex: 0,
      colIndex: 1,
      selectedFileId: 'file-1',
      searchResults: [],
      toggleColumns: new Set([1]),
    }) as BooleanCell;

    expect(toggleCell.kind).toBe(GridCellKind.Boolean);
    expect(toggleCell.data).toBe(true);
    expect(toggleCell.allowOverlay).toBe(false);
    expect(toggleCell.copyData).toBe('1');
    expect(toggleCell.contentAlign).toBe('center');
  });

  test('builds clear updates for cells, rows and columns from Glide selection', () => {
    const gridRows: CSVRow[] = [
      { rowIndex: 0, cells: ['A0', 'B0', 'C0'], key: 'A0' },
      { rowIndex: 1, cells: ['A1', 'B1', 'C1'], key: 'A1' },
    ];

    const rectSelection: GridSelection = {
      current: {
        cell: [1, 0],
        range: { x: 1, y: 0, width: 2, height: 2 },
        rangeStack: [],
      },
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty(),
    };

    expect(selectionToClearUpdates(rectSelection, gridRows, ['id', 'en', 'cn'])).toEqual([
      { row: 0, col: 1, value: '' },
      { row: 0, col: 2, value: '' },
      { row: 1, col: 1, value: '' },
      { row: 1, col: 2, value: '' },
    ]);

    const rowSelection: GridSelection = {
      current: undefined,
      columns: CompactSelection.empty(),
      rows: CompactSelection.fromSingleSelection(1),
    };

    expect(selectionToClearUpdates(rowSelection, gridRows, ['id', 'en', 'cn'])).toEqual([
      { row: 1, col: 0, value: '' },
      { row: 1, col: 1, value: '' },
      { row: 1, col: 2, value: '' },
    ]);
  });

  test('builds numeric fill updates only for numeric sequences', () => {
    const fillRows: CSVRow[] = [
      { rowIndex: 0, cells: ['KEY_1', '1'], key: 'KEY_1' },
      { rowIndex: 1, cells: ['KEY_2', '2'], key: 'KEY_2' },
      { rowIndex: 2, cells: ['KEY_3', ''], key: 'KEY_3' },
      { rowIndex: 3, cells: ['KEY_4', ''], key: 'KEY_4' },
    ];

    expect(buildNumericFillUpdates(
      { x: 1, y: 0, width: 1, height: 2 },
      { x: 1, y: 2, width: 1, height: 2 },
      fillRows
    )).toEqual([
      { row: 2, col: 1, value: '3' },
      { row: 3, col: 1, value: '4' },
    ]);

    expect(buildNumericFillUpdates(
      { x: 0, y: 0, width: 1, height: 2 },
      { x: 0, y: 2, width: 1, height: 2 },
      fillRows
    )).toEqual([
      { row: 2, col: 0, value: 'KEY_3' },
      { row: 3, col: 0, value: 'KEY_4' },
    ]);

    expect(buildNumericFillUpdates(
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0, y: 2, width: 1, height: 1 },
      [{ rowIndex: 0, cells: ['HELLO'], key: 'HELLO' }]
    )).toEqual([]);
  });
});
