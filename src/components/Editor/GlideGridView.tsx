import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DataEditor,
  type CellClickedEventArgs,
  type DataEditorRef,
  type EditableGridCell,
  type FillPatternEventArgs,
  type GridCell,
  type GridSelection,
  type HeaderClickedEventArgs,
  type Item,
  type Rectangle,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { useEditorStore } from '../../stores/editor-store';
import { useProjectStore } from '../../stores/project-store';
import { commitActiveEdit } from '../../services/edit-session-service';
import { CSVRow } from '../../types';
import { detectBooleanColumns } from '../../utils/toggle-column';
import ContextMenu, { MenuItem } from './ContextMenu';
import {
  buildNumericFillUpdates,
  buildGlideColumns,
  createCsvTextCell,
  DEFAULT_GLIDE_COLUMN_WIDTH,
  editorSelectionToGridSelection,
  getSelectedBounds,
  GLIDE_HEADER_HEIGHT,
  GLIDE_ROW_HEIGHT,
  GLIDE_ROW_MARKER_WIDTH,
  editableCellToString,
  gridSelectionToEditorSelection,
  mapCellsEditedToUpdates,
  selectionToClearUpdates,
  VALIDATION_ERROR_HIGHLIGHT,
} from './glide-grid-adapter';

interface GlideGridViewProps {
  headers: string[];
  rows: CSVRow[];
}

type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  type: 'row' | 'col' | 'cell' | 'header-menu';
  targetIndex: number;
};

const GlideGridView: React.FC<GlideGridViewProps> = ({ headers, rows }) => {
  const gridRef = useRef<DataEditorRef>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedCell = useEditorStore((state) => state.selectedCell);
  const selectedRange = useEditorStore((state) => state.selectedRange);
  const setSelectedCell = useEditorStore((state) => state.setSelectedCell);
  const setSelectedRange = useEditorStore((state) => state.setSelectedRange);
  const searchResults = useEditorStore((state) => state.searchResults);
  const currentSearchResult = useEditorStore((state) => state.currentSearchResult);
  const validationErrors = useEditorStore((state) => state.validationErrors);
  const selectedFileId = useEditorStore((state) => state.selectedFileId);
  const isEditing = useEditorStore((state) => state.isEditing);
  const editingCell = useEditorStore((state) => state.editingCell);
  const editingLocation = useEditorStore((state) => state.editingLocation);
  const tempValue = useEditorStore((state) => state.tempValue);
  const columnWidths = useEditorStore((state) => state.columnWidths);
  const setColumnWidth = useEditorStore((state) => state.setColumnWidth);
  const initColumnWidths = useEditorStore((state) => state.initColumnWidths);
  const toggleColumns = useEditorStore((state) => state.toggleColumns);
  const initToggleColumns = useEditorStore((state) => state.initToggleColumns);
  const setToggleColumn = useEditorStore((state) => state.setToggleColumn);
  const setInputModal = useEditorStore((state) => state.setInputModal);
  const projectState = useProjectStore();

  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    type: 'cell',
    targetIndex: -1,
  });
  const [targetScrollOffset, setTargetScrollOffset] = useState<{ x?: number; y?: number }>({});
  const scrollOffsetNudgeRef = useRef(false);

  const currentToggleCols = useMemo(() => {
    if (!selectedFileId) return new Set<number>();
    return new Set(toggleColumns[selectedFileId] || []);
  }, [selectedFileId, toggleColumns]);

  useEffect(() => {
    if (!selectedFileId || rows.length === 0) return;
    const detected = detectBooleanColumns(rows, headers);
    if (detected.length > 0) {
      initToggleColumns(selectedFileId, detected);
    }
  }, [selectedFileId, rows, headers, initToggleColumns]);

  useEffect(() => {
    if (selectedFileId) {
      initColumnWidths(selectedFileId);
    }
  }, [selectedFileId, initColumnWidths]);

  const columns = useMemo(
    () => buildGlideColumns(headers, selectedFileId, columnWidths),
    [headers, selectedFileId, columnWidths]
  );

  const editingPreview = isEditing && editingCell && editingLocation !== 'cell'
    ? { row: editingCell.row, col: editingCell.col, value: tempValue }
    : undefined;

  const validationHighlightRegions = useMemo(
    () => validationErrors
      .filter((error) => error.fileId === selectedFileId)
      .map((error) => ({
        color: VALIDATION_ERROR_HIGHLIGHT,
        range: { x: error.colIndex, y: error.rowIndex, width: 1, height: 1 },
        style: 'dashed' as const,
      })),
    [selectedFileId, validationErrors]
  );

  const getCellContent = useCallback((cell: Item): GridCell => {
    const [colIndex, rowIndex] = cell;
    return createCsvTextCell({
      rows,
      rowIndex,
      colIndex,
      selectedFileId,
      searchResults,
      currentSearchResult,
      validationErrors,
      editingPreview,
      toggleColumns: currentToggleCols,
    });
  }, [rows, selectedFileId, searchResults, currentSearchResult, validationErrors, editingPreview, currentToggleCols]);

  const gridSelection = useMemo<GridSelection>(
    () => editorSelectionToGridSelection({ selectedCell, selectedRange }),
    [selectedCell, selectedRange]
  );

  useLayoutEffect(() => {
    const targetCell = currentSearchResult && currentSearchResult.fileId === selectedFileId
      ? { row: currentSearchResult.rowIndex, col: currentSearchResult.colIndex }
      : selectedCell;
    if (!targetCell) return;
    if (targetCell.row < 0 || targetCell.row >= rows.length || targetCell.col < 0 || targetCell.col >= headers.length) return;

    const columnOffset = columns
      .slice(0, targetCell.col)
      .reduce((offset, column) => offset + ('width' in column ? column.width : DEFAULT_GLIDE_COLUMN_WIDTH), 0);
    const rowOffset = targetCell.row * GLIDE_ROW_HEIGHT;
    const nudge = scrollOffsetNudgeRef.current ? 1 : 0;
    scrollOffsetNudgeRef.current = !scrollOffsetNudgeRef.current;
    const scrollOffset = {
      x: Math.max(0, columnOffset - GLIDE_ROW_MARKER_WIDTH),
      y: rowOffset + nudge,
    };
    setTargetScrollOffset(scrollOffset);
  }, [columns, currentSearchResult, headers.length, rows.length, selectedCell, selectedFileId]);

  const handleGridSelectionChange = useCallback((newSelection: GridSelection) => {
    const mapped = gridSelectionToEditorSelection(newSelection, {
      rowCount: rows.length,
      colCount: headers.length,
    });
    const editorState = useEditorStore.getState();
    if (
      editorState.isEditing &&
      mapped.selectedCell &&
      (
        editorState.editingCell?.row !== mapped.selectedCell.row ||
        editorState.editingCell?.col !== mapped.selectedCell.col
      )
    ) {
      commitActiveEdit({ exitEditing: true, blur: true });
    }
    setSelectedCell(mapped.selectedCell?.row, mapped.selectedCell?.col);
    if (mapped.selectedRange) {
      setSelectedRange(mapped.selectedRange.start, mapped.selectedRange.end);
    } else {
      setSelectedRange(undefined);
    }
  }, [headers.length, rows.length, setSelectedCell, setSelectedRange]);

  const handleCellEdited = useCallback((cell: Item, newValue: EditableGridCell) => {
    if (!selectedFileId) return;
    const [col, row] = cell;
    const previousValue = rows[row]?.cells[col] ?? '';
    const nextValue = editableCellToString(newValue, previousValue);
    if (nextValue === undefined) return;
    projectState.updateCell(selectedFileId, row, col, nextValue);
  }, [projectState, rows, selectedFileId]);

  const handleCellsEdited = useCallback((newValues: readonly { location: Item; value: EditableGridCell }[]) => {
    if (!selectedFileId) return false;
    const updates = mapCellsEditedToUpdates(newValues, rows);
    if (updates.length === 0) return false;
    projectState.batchUpdateCells(selectedFileId, updates, '批量编辑');
    return true;
  }, [projectState, rows, selectedFileId]);

  const handleFillPattern = useCallback((event: FillPatternEventArgs) => {
    if (!selectedFileId) return;
    const source = normalizeRect(event.patternSource);
    const destination = normalizeRect(event.fillDestination);
    const updates = buildNumericFillUpdates(source, destination, rows);
    if (updates.length === 0) return;

    event.preventDefault();
    projectState.batchUpdateCells(selectedFileId, updates, '数字序列填充');
    setSelectedCell(source.y, source.x);
    setSelectedRange(
      { row: source.y, col: source.x },
      { row: destination.y + destination.height - 1, col: destination.x + destination.width - 1 }
    );
  }, [projectState, rows, selectedFileId, setSelectedCell, setSelectedRange]);

  const handleDelete = useCallback((selection: GridSelection) => {
    if (!selectedFileId) return false;
    const updates = selectionToClearUpdates(selection, rows, headers);
    if (updates.length === 0) return false;
    projectState.batchUpdateCells(selectedFileId, updates, '清空单元格');
    return true;
  }, [headers, projectState, rows, selectedFileId]);

  const handleRowAppended = useCallback(async () => {
    if (!selectedFileId) return undefined;
    projectState.insertRows(selectedFileId, rows.length, 1);
    setSelectedCell(rows.length, 0);
    setSelectedRange(undefined);
    return 'bottom';
  }, [projectState, rows.length, selectedFileId, setSelectedCell, setSelectedRange]);

  const handleColumnResizeEnd = useCallback((_column: unknown, newSize: number, colIndex: number) => {
    if (!selectedFileId) return;
    setColumnWidth(selectedFileId, colIndex, Math.max(50, Math.min(800, newSize || DEFAULT_GLIDE_COLUMN_WIDTH)));
  }, [selectedFileId, setColumnWidth]);

  const handleColumnResize = useCallback((_column: unknown, newSize: number, colIndex: number) => {
    if (!selectedFileId) return;
    setColumnWidth(selectedFileId, colIndex, Math.max(50, Math.min(800, newSize || DEFAULT_GLIDE_COLUMN_WIDTH)));
  }, [selectedFileId, setColumnWidth]);

  const getClientPoint = useCallback((event: CellClickedEventArgs | HeaderClickedEventArgs) => {
    return {
      x: event.bounds.x + event.localEventX,
      y: event.bounds.y + event.localEventY,
    };
  }, []);

  const handleCellContextMenu = useCallback((cell: Item, event: CellClickedEventArgs) => {
    event.preventDefault();
    const [col, row] = cell;
    if (row < 0) return;
    const menuType = col < 0 ? 'row' : 'cell';
    setSelectedCell(row, Math.max(0, col));
    if (menuType === 'row') {
      setSelectedRange(
        { row, col: 0 },
        { row, col: Math.max(0, headers.length - 1) }
      );
    } else {
      setSelectedRange(undefined);
    }
    const point = getClientPoint(event);
    setContextMenuState({
      visible: true,
      x: point.x,
      y: point.y,
      type: menuType,
      targetIndex: row,
    });
  }, [getClientPoint, headers.length, setSelectedCell, setSelectedRange]);

  const handleHeaderClicked = useCallback((colIndex: number) => {
    if (rows.length === 0) return;
    setSelectedCell(0, colIndex);
    setSelectedRange(
      { row: 0, col: colIndex },
      { row: rows.length - 1, col: colIndex }
    );
  }, [rows.length, setSelectedCell, setSelectedRange]);

  const handleHeaderContextMenu = useCallback((_colIndex: number, event: HeaderClickedEventArgs) => {
    event.preventDefault();
    setContextMenuState((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleHeaderMenuClick = useCallback((colIndex: number, bounds: Rectangle) => {
    if (rows.length > 0) {
      setSelectedCell(0, colIndex);
      setSelectedRange(
        { row: 0, col: colIndex },
        { row: rows.length - 1, col: colIndex }
      );
    }
    setContextMenuState({
      visible: true,
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
      type: 'header-menu',
      targetIndex: colIndex,
    });
  }, [rows.length, setSelectedCell, setSelectedRange]);

  const getContextMenuItems = useCallback((): MenuItem[] => {
    if (!selectedFileId) return [];

    const { type, targetIndex } = contextMenuState;
    const bounds = getSelectedBounds({ selectedCell, selectedRange }, type === 'col' || type === 'header-menu'
      ? { row: 0, col: targetIndex }
      : { row: targetIndex, col: selectedCell?.col ?? 0 });
    if (!bounds) return [];

    const items: MenuItem[] = [];

    if (type === 'row' || type === 'cell') {
      const startIndex = bounds.minRow;
      const selectedCount = bounds.maxRow - bounds.minRow + 1;
      const rowLabel = selectedCount > 1 ? `${selectedCount} 行` : '行';

      items.push({
        label: '在上方插入行',
        inputType: 'number',
        defaultValue: selectedCount,
        action: (count) => projectState.insertRows(selectedFileId, startIndex, count || 1),
      });
      items.push({
        label: '在下方插入行',
        inputType: 'number',
        defaultValue: selectedCount,
        action: (count) => projectState.insertRows(selectedFileId, startIndex + selectedCount, count || 1),
      });
      items.push({ separator: true, label: '' });
      items.push({
        label: `删除 ${rowLabel}`,
        danger: true,
        action: () => {
          projectState.deleteRows(selectedFileId, Array.from({ length: selectedCount }, (_, i) => startIndex + i));
          setSelectedCell(undefined);
          setSelectedRange(undefined);
        },
      });
      items.push({
        label: `复制 ${rowLabel}`,
        action: () => {
          projectState.duplicateRows(selectedFileId, Array.from({ length: selectedCount }, (_, i) => startIndex + i));
        },
      });
    }

    if (type === 'col' || type === 'header-menu') {
      const startIndex = bounds.minCol;
      const selectedCount = bounds.maxCol - bounds.minCol + 1;
      const colLabel = selectedCount > 1 ? `${selectedCount} 列` : '列';
      const allToggle = Array.from({ length: selectedCount }, (_, i) => startIndex + i)
        .every((colIndex) => currentToggleCols.has(colIndex));

      if (type === 'header-menu') {
        items.push({
          label: '重命名列',
          action: () => {
            const currentName = headers[targetIndex] || `Col ${targetIndex + 1}`;
            setInputModal({
              isOpen: true,
              title: '重命名列',
              defaultValue: currentName,
              onConfirm: (name) => {
                if (!selectedFileId) return;
                projectState.updateHeader(selectedFileId, targetIndex, name);
              },
            });
          },
        });
        items.push({ separator: true, label: '' });
      }

      items.push({
        label: '在左侧插入列',
        inputType: 'number',
        defaultValue: selectedCount,
        action: (count) => projectState.insertColumns(selectedFileId, startIndex, count || 1),
      });
      items.push({
        label: '在右侧插入列',
        inputType: 'number',
        defaultValue: selectedCount,
        action: (count) => projectState.insertColumns(selectedFileId, startIndex + selectedCount, count || 1),
      });
      items.push({ separator: true, label: '' });
      items.push({
        label: allToggle ? '取消 Toggle 列' : '设为 Toggle 列',
        action: () => {
          for (let i = 0; i < selectedCount; i += 1) {
            setToggleColumn(selectedFileId, startIndex + i, !allToggle);
          }
        },
      });
      items.push({ separator: true, label: '' });
      items.push({
        label: `删除 ${colLabel}`,
        danger: true,
        action: () => {
          projectState.deleteColumns(selectedFileId, Array.from({ length: selectedCount }, (_, i) => startIndex + i));
          setSelectedCell(undefined);
          setSelectedRange(undefined);
        },
      });
    }

    return items;
  }, [
    contextMenuState,
    currentToggleCols,
    headers,
    projectState,
    selectedCell,
    selectedFileId,
    selectedRange,
    setSelectedCell,
    setSelectedRange,
    setInputModal,
    setToggleColumn,
  ]);

  return (
    <div className="glide-grid-view" ref={containerRef} onContextMenu={(event) => event.preventDefault()}>
      <DataEditor
        ref={gridRef}
        className="localization-glide-grid"
        columns={columns}
        rows={rows.length}
        scrollOffsetX={targetScrollOffset.x}
        scrollOffsetY={targetScrollOffset.y}
        getCellContent={getCellContent}
        getCellsForSelection={true}
        highlightRegions={validationHighlightRegions}
        gridSelection={gridSelection}
        onGridSelectionChange={handleGridSelectionChange}
        onDelete={handleDelete}
        onCellEdited={handleCellEdited}
        onCellsEdited={handleCellsEdited}
        onPaste={true}
        onFillPattern={handleFillPattern}
        onRowAppended={handleRowAppended}
        onColumnResize={handleColumnResize}
        onColumnResizeEnd={handleColumnResizeEnd}
        onCellContextMenu={handleCellContextMenu}
        onHeaderClicked={handleHeaderClicked}
        onHeaderContextMenu={handleHeaderContextMenu}
        onHeaderMenuClick={handleHeaderMenuClick}
        rowMarkers={{ kind: 'both', width: GLIDE_ROW_MARKER_WIDTH }}
        rangeSelect="multi-rect"
        rowSelect="multi"
        columnSelect="multi"
        rowHeight={GLIDE_ROW_HEIGHT}
        headerHeight={GLIDE_HEADER_HEIGHT}
        width="100%"
        height="100%"
        smoothScrollX
        smoothScrollY
        fillHandle
        allowedFillDirections="vertical"
        keybindings={{ downFill: true, rightFill: true }}
        trailingRowOptions={{
          sticky: true,
          tint: true,
          hint: '新增行...',
          targetColumn: 0,
        }}
        editOnType
        verticalBorder
        theme={{
          accentColor: '#1a73e8',
          accentLight: '#e8f0fe',
          bgHeader: '#f8f9fa',
          bgHeaderHovered: '#eef3f8',
          bgCell: '#fff',
          borderColor: '#efefef',
          headerBottomBorderColor: '#dee2e6',
          textHeader: '#495057',
          textDark: '#333',
          cellHorizontalPadding: 12,
          cellVerticalPadding: 6,
          headerFontStyle: '600 13px',
          baseFontStyle: '13px',
          markerFontStyle: '13px',
          fontFamily: 'Arial, sans-serif',
        }}
      />
      {contextMenuState.visible && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenuState((prev) => ({ ...prev, visible: false }))}
        />
      )}
    </div>
  );
};

function normalizeRect(rect: Rectangle): Rectangle {
  return {
    x: rect.width < 0 ? rect.x + rect.width + 1 : rect.x,
    y: rect.height < 0 ? rect.y + rect.height + 1 : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

export default GlideGridView;
