import {
  CompactSelection,
  GridCellKind,
  type BooleanCell,
  type EditableGridCell,
  type EditListItem,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Rectangle,
} from '@glideapps/glide-data-grid';
import { CSVRow, SearchResult, ValidationError } from '../../types';
import { isBooleanValue, isTruthyValue } from '../../utils/toggle-column';

export const GLIDE_ROW_HEIGHT = 36;
export const GLIDE_HEADER_HEIGHT = 36;
export const GLIDE_ROW_MARKER_WIDTH = 50;
export const DEFAULT_GLIDE_COLUMN_WIDTH = 180;
export const VALIDATION_ERROR_ACCENT = '#d93025';
export const VALIDATION_ERROR_ACCENT_LIGHT = 'rgba(217, 48, 37, 0.12)';
export const VALIDATION_ERROR_BG = 'rgba(217, 48, 37, 0.06)';
export const VALIDATION_ERROR_HIGHLIGHT = 'rgba(217, 48, 37, 0.16)';

export interface EditorSelectionSnapshot {
  selectedCell?: { row: number; col: number };
  selectedRange?: {
    start: { row: number; col: number };
    end: { row: number; col: number };
  };
}

interface CreateCsvTextCellOptions {
  rows: CSVRow[];
  rowIndex: number;
  colIndex: number;
  selectedFileId?: string;
  searchResults: SearchResult[];
  currentSearchResult?: SearchResult;
  validationErrors?: ValidationError[];
  editingPreview?: { row: number; col: number; value: string };
  toggleColumns?: Set<number>;
}

export function buildGlideColumns(
  headers: string[],
  selectedFileId: string | undefined,
  columnWidths: Record<string, Record<number, number>>
): GridColumn[] {
  return headers.map((header, index) => ({
    title: header || `Col ${index + 1}`,
    id: `col-${index}`,
    width: selectedFileId ? columnWidths[selectedFileId]?.[index] ?? DEFAULT_GLIDE_COLUMN_WIDTH : DEFAULT_GLIDE_COLUMN_WIDTH,
    hasMenu: true,
    menuIcon: 'dots',
  }));
}

export function createCsvTextCell({
  rows,
  rowIndex,
  colIndex,
  selectedFileId,
  searchResults,
  currentSearchResult,
  validationErrors = [],
  editingPreview,
  toggleColumns,
}: CreateCsvTextCellOptions): GridCell {
  const rawValue = rows[rowIndex]?.cells[colIndex] ?? '';
  const isEditingPreview = editingPreview?.row === rowIndex && editingPreview.col === colIndex;
  const isToggleColumn = toggleColumns?.has(colIndex) === true;
  const isToggleValue = isToggleColumn && isBooleanValue(rawValue);
  const displayValue = isEditingPreview ? editingPreview.value : rawValue;

  const isCurrentMatch = Boolean(
    currentSearchResult &&
    currentSearchResult.fileId === selectedFileId &&
    currentSearchResult.rowIndex === rowIndex &&
    currentSearchResult.colIndex === colIndex
  );
  const isOtherMatch = !isCurrentMatch && searchResults.some((res) =>
    res.fileId === selectedFileId &&
    res.rowIndex === rowIndex &&
    res.colIndex === colIndex
  );
  const hasValidationError = validationErrors.some((error) =>
    error.fileId === selectedFileId &&
    error.rowIndex === rowIndex &&
    error.colIndex === colIndex
  );
  const isInvalidKey = colIndex === 0 && (!rawValue || !/^[A-Z0-9_]+$/.test(rawValue));

  let themeOverride: GridCell['themeOverride'];
  if (isCurrentMatch) {
    themeOverride = { bgCell: '#ffd966', textDark: '#333' } as GridCell['themeOverride'] & { fontWeight: string };
    (themeOverride as { fontWeight?: string }).fontWeight = '600';
  } else if (isOtherMatch) {
    themeOverride = { bgCell: 'rgba(255, 255, 0, 0.2)' };
  }
  if (isInvalidKey || hasValidationError) {
    themeOverride = {
      ...themeOverride,
      accentColor: VALIDATION_ERROR_ACCENT,
      accentLight: VALIDATION_ERROR_ACCENT_LIGHT,
      bgCell: VALIDATION_ERROR_BG,
      textDark: VALIDATION_ERROR_ACCENT,
    };
  }

  if (isToggleValue && !isEditingPreview) {
    return {
      kind: GridCellKind.Boolean,
      allowOverlay: false,
      readonly: false,
      data: isTruthyValue(rawValue),
      copyData: rawValue,
      contentAlign: 'center',
      themeOverride,
    };
  }

  return {
    kind: GridCellKind.Text,
    allowOverlay: true,
    readonly: false,
    data: isEditingPreview ? editingPreview.value : rawValue,
    displayData: displayValue,
    copyData: rawValue,
    contentAlign: isToggleColumn ? 'center' : 'left',
    themeOverride,
  };
}

export function mapCellsEditedToUpdates(
  newValues: readonly EditListItem[],
  rows: CSVRow[] = []
): { row: number; col: number; value: string }[] {
  return newValues.flatMap((edit) => {
    const [col, row] = edit.location;
    const previousValue = rows[row]?.cells[col] ?? '';
    const value = editableCellToString(edit.value, previousValue);
    if (value === undefined) return [];

    return [{ row, col, value }];
  });
}

export function editableCellToString(newValue: EditableGridCell, previousValue: string = ''): string | undefined {
  if (newValue.kind === GridCellKind.Boolean) {
    return booleanCellToCsvValue(newValue, previousValue);
  }
  if (newValue.kind !== GridCellKind.Text) return undefined;
  return newValue.data;
}

export function gridSelectionToEditorSelection(
  selection: GridSelection,
  bounds?: { rowCount: number; colCount: number }
): EditorSelectionSnapshot {
  if (selection.current) {
    const [col, row] = selection.current.cell;
    const range = normalizeRectangle(selection.current.range);
    return {
      selectedCell: { row, col },
      selectedRange: rectangleToSelectedRange(range),
    };
  }

  if (!bounds || bounds.rowCount <= 0 || bounds.colCount <= 0) {
    return {};
  }

  const rowRange = compactSelectionToInclusiveRange(selection.rows);
  if (rowRange) {
    return {
      selectedCell: { row: rowRange.start, col: 0 },
      selectedRange: {
        start: { row: rowRange.start, col: 0 },
        end: { row: Math.min(rowRange.end, bounds.rowCount - 1), col: bounds.colCount - 1 },
      },
    };
  }

  const colRange = compactSelectionToInclusiveRange(selection.columns);
  if (colRange) {
    return {
      selectedCell: { row: 0, col: colRange.start },
      selectedRange: {
        start: { row: 0, col: colRange.start },
        end: { row: bounds.rowCount - 1, col: Math.min(colRange.end, bounds.colCount - 1) },
      },
    };
  }

  return {};
}

function booleanCellToCsvValue(newValue: BooleanCell, previousValue: string): string {
  const previous = previousValue.trim();
  const next = newValue.data === true;
  if (previous === 'true' || previous === 'false') {
    return next ? 'true' : 'false';
  }
  if (previous === 'TRUE' || previous === 'FALSE') {
    return next ? 'TRUE' : 'FALSE';
  }
  return next ? '1' : '0';
}

export function editorSelectionToGridSelection(snapshot: EditorSelectionSnapshot): GridSelection {
  const selectedCell = snapshot.selectedCell;
  const selectedRange = snapshot.selectedRange;
  const range = selectedRange
    ? selectedRangeToRectangle(selectedRange)
    : selectedCell
      ? { x: selectedCell.col, y: selectedCell.row, width: 1, height: 1 }
      : undefined;

  return {
    current: selectedCell && range
      ? {
        cell: [selectedCell.col, selectedCell.row],
        range,
        rangeStack: [],
      }
      : undefined,
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  };
}

export function getSelectedBounds(snapshot: EditorSelectionSnapshot, fallback?: { row: number; col: number }) {
  if (snapshot.selectedRange) {
    return {
      minRow: Math.min(snapshot.selectedRange.start.row, snapshot.selectedRange.end.row),
      maxRow: Math.max(snapshot.selectedRange.start.row, snapshot.selectedRange.end.row),
      minCol: Math.min(snapshot.selectedRange.start.col, snapshot.selectedRange.end.col),
      maxCol: Math.max(snapshot.selectedRange.start.col, snapshot.selectedRange.end.col),
    };
  }
  const selectedCell = snapshot.selectedCell ?? fallback;
  if (!selectedCell) return undefined;
  return {
    minRow: selectedCell.row,
    maxRow: selectedCell.row,
    minCol: selectedCell.col,
    maxCol: selectedCell.col,
  };
}

function normalizeRectangle(rect: Rectangle): Rectangle {
  return {
    x: rect.width < 0 ? rect.x + rect.width + 1 : rect.x,
    y: rect.height < 0 ? rect.y + rect.height + 1 : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

function rectangleToSelectedRange(rect: Rectangle) {
  return {
    start: { row: rect.y, col: rect.x },
    end: { row: rect.y + rect.height - 1, col: rect.x + rect.width - 1 },
  };
}

function selectedRangeToRectangle(range: NonNullable<EditorSelectionSnapshot['selectedRange']>): Rectangle {
  const minRow = Math.min(range.start.row, range.end.row);
  const maxRow = Math.max(range.start.row, range.end.row);
  const minCol = Math.min(range.start.col, range.end.col);
  const maxCol = Math.max(range.start.col, range.end.col);
  return {
    x: minCol,
    y: minRow,
    width: maxCol - minCol + 1,
    height: maxRow - minRow + 1,
  };
}

export function selectionToClearUpdates(
  selection: GridSelection,
  rows: CSVRow[],
  headers: string[]
): { row: number; col: number; value: string }[] {
  const rects = selectionToRectangles(selection, rows.length, headers.length);
  const seen = new Set<string>();
  const updates: { row: number; col: number; value: string }[] = [];

  rects.forEach((rect) => {
    const normalized = normalizeRectangle(rect);
    for (let row = normalized.y; row < normalized.y + normalized.height; row += 1) {
      if (row < 0 || row >= rows.length) continue;
      for (let col = normalized.x; col < normalized.x + normalized.width; col += 1) {
        if (col < 0 || col >= headers.length) continue;
        const key = `${row}:${col}`;
        if (seen.has(key)) continue;
        seen.add(key);
        updates.push({ row, col, value: '' });
      }
    }
  });

  return updates;
}

export function buildNumericFillUpdates(
  sourceRect: Rectangle,
  destinationRect: Rectangle,
  rows: CSVRow[]
): { row: number; col: number; value: string }[] {
  const source = normalizeRectangle(sourceRect);
  const destination = normalizeRectangle(destinationRect);
  const updates: { row: number; col: number; value: string }[] = [];

  for (let col = source.x; col < source.x + source.width; col += 1) {
    const sourceValues: string[] = [];
    for (let row = source.y; row < source.y + source.height; row += 1) {
      sourceValues.push(rows[row]?.cells[col] ?? '');
    }

    const sequence = inferNumericSequence(sourceValues);
    if (!sequence) return [];

    for (let row = destination.y; row < destination.y + destination.height; row += 1) {
      if (row < 0 || row >= rows.length) continue;
      const offset = row - (source.y + source.height);
      updates.push({
        row,
        col,
        value: formatNumericSequenceValue(sequence, sourceValues.length + offset),
      });
    }
  }

  return updates;
}

function selectionToRectangles(selection: GridSelection, rowCount: number, colCount: number): Rectangle[] {
  const rects: Rectangle[] = [];

  if (selection.current) {
    rects.push(normalizeRectangle(selection.current.range));
    selection.current.rangeStack.forEach((rect) => rects.push(normalizeRectangle(rect)));
  }

  for (const row of selection.rows) {
    rects.push({ x: 0, y: row, width: colCount, height: 1 });
  }

  for (const col of selection.columns) {
    rects.push({ x: col, y: 0, width: 1, height: rowCount });
  }

  return rects;
}

function compactSelectionToInclusiveRange(selection: CompactSelection) {
  if (selection.length === 0) return undefined;
  const first = selection.first();
  const last = selection.last();
  if (first === undefined || last === undefined) return undefined;
  return { start: first, end: last };
}

type NumericSequence = {
  prefix: string;
  suffix: string;
  start: number;
  step: number;
  decimals: number;
  padLength: number;
};

function inferNumericSequence(values: string[]): NumericSequence | undefined {
  const parsed = values.map(parseNumericToken);
  if (parsed.some((item) => !item)) return undefined;
  const tokens = parsed as NonNullable<ReturnType<typeof parseNumericToken>>[];
  const first = tokens[0];
  if (!tokens.every((token) => token.prefix === first.prefix && token.suffix === first.suffix)) return undefined;

  const step = tokens.length >= 2 ? tokens[1].value - tokens[0].value : 1;
  for (let i = 2; i < tokens.length; i += 1) {
    if (tokens[i].value - tokens[i - 1].value !== step) return undefined;
  }

  return {
    prefix: first.prefix,
    suffix: first.suffix,
    start: first.value,
    step,
    decimals: Math.max(...tokens.map((token) => token.decimals)),
    padLength: Math.max(...tokens.map((token) => token.padLength)),
  };
}

function parseNumericToken(value: string) {
  const match = value.match(/^(.*?)(-?\d+(?:\.\d+)?)(.*?)$/);
  if (!match) return undefined;
  const numericText = match[2];
  return {
    prefix: match[1],
    value: Number(numericText),
    suffix: match[3],
    decimals: numericText.includes('.') ? numericText.split('.')[1].length : 0,
    padLength: numericText.startsWith('0') ? numericText.length : 0,
  };
}

function formatNumericSequenceValue(sequence: NumericSequence, index: number): string {
  const value = sequence.start + sequence.step * index;
  const fixed = sequence.decimals > 0 ? value.toFixed(sequence.decimals) : String(value);
  const [integerPart, decimalPart] = fixed.split('.');
  const paddedInteger = sequence.padLength > 0
    ? integerPart.padStart(sequence.padLength, '0')
    : integerPart;
  return `${sequence.prefix}${decimalPart !== undefined ? `${paddedInteger}.${decimalPart}` : paddedInteger}${sequence.suffix}`;
}
