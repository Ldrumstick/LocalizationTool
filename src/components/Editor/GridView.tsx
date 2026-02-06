import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useMeasure from 'react-use-measure';
import { FixedSizeList, VariableSizeGrid as Grid } from 'react-window';
import { useEditorStore } from '../../stores/editor-store';
import { useProjectStore } from '../../stores/project-store';
import { CSVRow } from '../../types';
import { generateFillData } from '../../utils/fill-logic';
import { detectBooleanColumns, isBooleanValue, isTruthyValue, toggleBooleanValue } from '../../utils/toggle-column';
import { calculateAutoFitWidth } from '../../utils/width-measurement';
import ContextMenu, { MenuItem } from './ContextMenu';
import InlineEditor from './InlineEditor';
import RowHeaders from './RowHeaders';

interface GridViewProps {
    headers: string[];
    rows: CSVRow[];
}

const ROW_HEADER_WIDTH = 50;
const DEFAULT_COLUMN_WIDTH = 180;

const GridView: React.FC<GridViewProps> = ({ headers, rows }) => {
    const rowHeight = 36;
    const headerHeight = 36;

    const [containerRef, { width, height }] = useMeasure();
    const innerContainerRef = useRef<HTMLDivElement | null>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<Grid>(null);
    const gridOuterRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<FixedSizeList>(null);
    const scrollTopRef = useRef(0);
    const [gridScrollbarSize, setGridScrollbarSize] = useState({ w: 0, h: 0 });

    // Context Menu State
    const [contextMenuState, setContextMenuState] = useState<{
        visible: boolean;
        x: number;
        y: number;
        type: 'row' | 'col' | 'cell';
        targetIndex: number; // For row/col header context
        headerRect?: { left: number, right: number }; // For auto-fit context if needed (optional)
    }>({ visible: false, x: 0, y: 0, type: 'cell', targetIndex: -1 });

    // ... (Fill Handle State omitted for brevity, will be kept by matching StartLine/EndLine logic if careful) ...

    // Fill Handle State
    const [fillState, setFillState] = useState<{
        isDragging: boolean;
        startRow: number;
        endRow: number;
        startCol: number;
        endCol: number;
        targetRow: number; // Current drag target
    } | null>(null);

    // Auto Fill Options State
    const [fillMenuState, setFillMenuState] = useState<{
        visible: boolean;
        menuOpen: boolean;
        rect: { top: number; left: number }; // Position for button
        fillContext: {
            startRow: number;
            endRow: number;
            startCol: number;
            endCol: number;
            targetRow: number;
        };
        activeMode: 'auto' | 'copy';
    } | null>(null);

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (fillMenuState?.visible) {
                const target = e.target as HTMLElement;
                if (!target.closest('.fill-options-container')) {
                    setFillMenuState(null);
                }
            }
        };

        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [fillMenuState]);

    // 双击检测
    const lastClickRef = useRef<{ row: number; col: number; time: number } | null>(null);

    const selectedCell = useEditorStore((state) => state.selectedCell);
    const selectedRange = useEditorStore((state) => state.selectedRange);
    const setSelectedCell = useEditorStore((state) => state.setSelectedCell);
    const setSelectedRange = useEditorStore((state) => state.setSelectedRange);
    const searchResults = useEditorStore((state) => state.searchResults);
    const currentResultIndex = useEditorStore((state) => state.currentResultIndex);
    const selectedFileId = useEditorStore((state) => state.selectedFileId);
    const isEditing = useEditorStore((state) => state.isEditing);
    const editingCell = useEditorStore((state) => state.editingCell);
    const editingLocation = useEditorStore((state) => state.editingLocation);
    const tempValue = useEditorStore((state) => state.tempValue);
    const enterEditMode = useEditorStore((state) => state.enterEditMode);
    const setEditingLocation = useEditorStore((state) => state.setEditingLocation);

    // Column Widths
    const columnWidths = useEditorStore((state) => state.columnWidths);
    const setColumnWidth = useEditorStore((state) => state.setColumnWidth);
    const initColumnWidths = useEditorStore((state) => state.initColumnWidths);

    // Resizing State
    const [resizeState, setResizeState] = useState<{
        colIndex: number;
        startX: number;
        startWidth: number;
        currentWidth: number;
    } | null>(null);

    // Resize Handlers
    useEffect(() => {
        if (!resizeState) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - resizeState.startX;
            const newWidth = Math.max(50, Math.min(800, resizeState.startWidth + deltaX));

            setResizeState(prev => prev ? { ...prev, currentWidth: newWidth } : null);
        };

        const handleMouseUp = () => {
            if (selectedFileId) {
                setColumnWidth(selectedFileId, resizeState.colIndex, resizeState.currentWidth);
            }
            setResizeState(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizeState, selectedFileId, setColumnWidth]);

    // Toggle 列状态
    const toggleColumns = useEditorStore((state) => state.toggleColumns);
    const initToggleColumns = useEditorStore((state) => state.initToggleColumns);
    const setToggleColumn = useEditorStore((state) => state.setToggleColumn);
    const updateFile = useProjectStore((state) => state.updateFile);

    // 当前文件的 Toggle 列索引
    const currentToggleCols = useMemo(() => {
        if (!selectedFileId) return new Set<number>();
        return new Set(toggleColumns[selectedFileId] || []);
    }, [selectedFileId, toggleColumns]);

    // 自动检测 Toggle 列
    useEffect(() => {
        if (!selectedFileId || rows.length === 0) return;

        // 检测布尔列
        const detected = detectBooleanColumns(rows, headers);
        if (detected.length > 0) {
            initToggleColumns(selectedFileId, detected);
        }
    }, [selectedFileId, rows, headers, initToggleColumns]);

    // 初始化列宽
    useEffect(() => {
        if (selectedFileId) {
            initColumnWidths(selectedFileId);
        }
    }, [selectedFileId, initColumnWidths]);

    const getColWidth = useCallback((index: number) => {
        // Priority: Resizing > Store > Default
        if (resizeState && resizeState.colIndex === index) {
            return resizeState.currentWidth;
        }
        if (selectedFileId && columnWidths[selectedFileId] && columnWidths[selectedFileId][index]) {
            return columnWidths[selectedFileId][index];
        }
        return DEFAULT_COLUMN_WIDTH;
    }, [selectedFileId, columnWidths, resizeState]);

    // Reset grid layout when widths change (either from store or resize drag)
    useEffect(() => {
        if (gridRef.current) {
            gridRef.current.resetAfterColumnIndex(0);
        }
    }, [columnWidths, selectedFileId, resizeState?.currentWidth]); // Added resizeState.currentWidth to dependency

    // Fill Handle Helpers
    const handleFillMouseDown = (e: React.MouseEvent, row: number, col: number) => {
        e.stopPropagation();
        e.preventDefault();

        let startRow = row;
        let endRow = row;
        let startCol = col;
        let endCol = col;

        if (selectedRange) {
            startRow = Math.min(selectedRange.start.row, selectedRange.end.row);
            endRow = Math.max(selectedRange.start.row, selectedRange.end.row);
            startCol = Math.min(selectedRange.start.col, selectedRange.end.col);
            endCol = Math.max(selectedRange.start.col, selectedRange.end.col);
        }

        setFillState({
            isDragging: true,
            startRow, endRow, startCol, endCol,
            targetRow: endRow
        });
    };

    // Perform Fill Utility
    const performFill = useCallback((startRow: number, endRow: number, startCol: number, endCol: number, targetRow: number, mode: 'auto' | 'copy') => {
        const file = useProjectStore.getState().files[selectedFileId!];
        if (!file) return;

        const newRows = [...file.rows];
        let isDirty = false;

        const fillCount = targetRow - endRow;

        // Expand rows
        if (targetRow >= newRows.length) {
            for (let i = newRows.length; i <= targetRow; i++) {
                newRows.push({
                    rowIndex: i,
                    cells: Array(headers.length).fill('')
                });
            }
        }

        // 1. Clone target rows
        for (let i = 0; i < fillCount; i++) {
            const rIdx = endRow + 1 + i;
            if (newRows[rIdx]) {
                newRows[rIdx] = { ...newRows[rIdx], cells: [...newRows[rIdx].cells] };
            }
        }

        // 2. Apply Fill
        for (let c = startCol; c <= endCol; c++) {
            const sourceValues: string[] = [];
            for (let r = startRow; r <= endRow; r++) {
                sourceValues.push(newRows[r]?.cells[c] || '');
            }

            const generated = generateFillData(sourceValues, fillCount, mode);

            for (let i = 0; i < fillCount; i++) {
                const rIdx = endRow + 1 + i;
                if (newRows[rIdx]) {
                    newRows[rIdx].cells[c] = generated[i];
                    isDirty = true;
                }
            }
        }

        if (isDirty) {
            useProjectStore.getState().updateFile(selectedFileId!, { rows: newRows, isDirty: true });

            // Update selection to cover filled area
            setSelectedRange(
                { row: startRow, col: startCol },
                { row: targetRow, col: endCol }
            );
        }
    }, [selectedFileId, headers.length, setSelectedRange]);

    // Fill Handle Drag Logic
    useEffect(() => {
        if (!fillState?.isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (innerContainerRef.current) {
                const rect = innerContainerRef.current.getBoundingClientRect();
                const headerOffset = 36;
                const relativeY = e.clientY - rect.top - headerOffset + scrollTopRef.current;
                const rowIdx = Math.floor(relativeY / rowHeight);

                // Constrain to startRow (only allow dragging down for now as per plan)
                const newTarget = Math.max(fillState.endRow, rowIdx);

                if (newTarget !== fillState.targetRow) {
                    setFillState(prev => prev ? ({ ...prev, targetRow: newTarget }) : null);
                }
            }
        };

        const performFill = (startRow: number, endRow: number, startCol: number, endCol: number, targetRow: number, mode: 'auto' | 'copy') => {
            const file = useProjectStore.getState().files[selectedFileId!];
            if (!file) return;

            const newRows = [...file.rows];
            let isDirty = false;

            const fillCount = targetRow - endRow;

            // Expand rows
            if (targetRow >= newRows.length) {
                for (let i = newRows.length; i <= targetRow; i++) {
                    newRows.push({
                        rowIndex: i,
                        cells: Array(headers.length).fill('')
                    });
                }
            }

            // 1. Clone target rows
            for (let i = 0; i < fillCount; i++) {
                const rIdx = endRow + 1 + i;
                if (newRows[rIdx]) {
                    newRows[rIdx] = { ...newRows[rIdx], cells: [...newRows[rIdx].cells] };
                }
            }

            // 2. Apply Fill
            for (let c = startCol; c <= endCol; c++) {
                const sourceValues: string[] = [];
                for (let r = startRow; r <= endRow; r++) {
                    sourceValues.push(newRows[r]?.cells[c] || '');
                }

                const generated = generateFillData(sourceValues, fillCount, mode);

                for (let i = 0; i < fillCount; i++) {
                    const rIdx = endRow + 1 + i;
                    if (newRows[rIdx]) {
                        newRows[rIdx].cells[c] = generated[i];
                        isDirty = true;
                    }
                }
            }

            if (isDirty) {
                useProjectStore.getState().updateFile(selectedFileId!, { rows: newRows, isDirty: true });

                // Update selection to cover filled area
                setSelectedRange(
                    { row: startRow, col: startCol },
                    { row: targetRow, col: endCol }
                );
            }
        };

        const handleMouseUp = () => {
            if (!fillState || !fillState.isDragging) return;

            // Perform Fill
            if (fillState.targetRow > fillState.endRow && selectedFileId) {
                performFill(fillState.startRow, fillState.endRow, fillState.startCol, fillState.endCol, fillState.targetRow, 'auto');

                const totalRowHeight = (fillState.targetRow + 1) * rowHeight;
                // Calculate total width up to endCol
                let totalColWidth = 0;
                for (let i = 0; i <= fillState.endCol; i++) {
                    totalColWidth += getColWidth(i);
                }

                setFillMenuState({
                    visible: true,
                    menuOpen: false,
                    rect: {
                        top: totalRowHeight,
                        left: totalColWidth
                    },
                    fillContext: {
                        startRow: fillState.startRow,
                        endRow: fillState.endRow,
                        startCol: fillState.startCol,
                        endCol: fillState.endCol,
                        targetRow: fillState.targetRow
                    },
                    activeMode: 'auto'
                });
            }

            setFillState(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [fillState, selectedFileId, headers.length]);

    const insertRows = useProjectStore((state) => state.insertRows);
    const deleteRows = useProjectStore((state) => state.deleteRows);
    const insertColumns = useProjectStore((state) => state.insertColumns);
    const deleteColumns = useProjectStore((state) => state.deleteColumns);
    const duplicateRows = useProjectStore((state) => state.duplicateRows);
    const updateHeader = useProjectStore((state) => state.updateHeader);

    // 导航函数
    const navigateCell = useCallback((direction: 'up' | 'down' | 'left' | 'right' | 'enter' | 'tab' | 'shift-tab') => {
        if (!selectedCell) return;

        let newRow = selectedCell.row;
        let newCol = selectedCell.col;

        switch (direction) {
            case 'up':
                newRow = Math.max(0, newRow - 1);
                break;
            case 'down':
            case 'enter':
                newRow = Math.min(rows.length - 1, newRow + 1);
                break;
            case 'left':
            case 'shift-tab':
                newCol = Math.max(0, newCol - 1);
                break;
            case 'right':
            case 'tab':
                newCol = Math.min(headers.length - 1, newCol + 1);
                break;
        }

        setSelectedCell(newRow, newCol);
    }, [selectedCell, rows.length, headers.length, setSelectedCell]);

    // Clipboard Operations
    const handleCopy = useCallback(async (e: React.ClipboardEvent) => {
        // Prevent default copy behavior if we are handling it
        // But if user is editing in InlineEditor, we should let it pass?
        // GridView container has focus, so if we are in input, input has focus.
        // Easiest is to check if we are editing.
        if (isEditing) return;

        e.preventDefault();

        if (!selectedFileId) return;
        const file = useProjectStore.getState().files[selectedFileId];
        if (!file) return;

        let data = '';

        if (selectedRange) {
            const minRow = Math.min(selectedRange.start.row, selectedRange.end.row);
            const maxRow = Math.max(selectedRange.start.row, selectedRange.end.row);
            const minCol = Math.min(selectedRange.start.col, selectedRange.end.col);
            const maxCol = Math.max(selectedRange.start.col, selectedRange.end.col);

            const lines: string[] = [];
            for (let r = minRow; r <= maxRow; r++) {
                const rowData: string[] = [];
                for (let c = minCol; c <= maxCol; c++) {
                    rowData.push(file.rows[r]?.cells[c] || '');
                }
                lines.push(rowData.join('\t'));
            }
            data = lines.join('\n');
        } else if (selectedCell) {
            data = file.rows[selectedCell.row]?.cells[selectedCell.col] || '';
        }

        if (data) {
            try {
                await navigator.clipboard.writeText(data);
            } catch (err) {
                console.error('Failed to copy', err);
            }
        }
    }, [selectedFileId, selectedRange, selectedCell, isEditing]);

    const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
        if (isEditing) return;
        e.preventDefault();

        if (!selectedFileId) return;

        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;

            const rowsData = text.split(/\r?\n/).map(line => line.split('\t'));
            if (rowsData.length === 0) return;
            // Remove last empty line if generic split causes it (excel often adds newline at end)
            if (rowsData.length > 1 && rowsData[rowsData.length - 1].length === 1 && rowsData[rowsData.length - 1][0] === '') {
                rowsData.pop();
            }

            const projectState = useProjectStore.getState();
            const file = projectState.files[selectedFileId];
            if (!file) return;

            // Determine start position
            let startRow = 0;
            let startCol = 0;

            if (selectedRange) {
                startRow = Math.min(selectedRange.start.row, selectedRange.end.row);
                startCol = Math.min(selectedRange.start.col, selectedRange.end.col);
            } else if (selectedCell) {
                startRow = selectedCell.row;
                startCol = selectedCell.col;
            } else {
                return; // No selection to paste into
            }

            const newRows = [...file.rows];
            let isDirty = false;

            rowsData.forEach((rowData, rIdx) => {
                const targetRowIdx = startRow + rIdx;

                // Handle adding new rows if paste exceeds current row count
                // BUT: projectStore has insertRows, but we need to do it in bulk.
                // For now, let's limit to existing rows or simple push?
                // Simple push might break 'rowIndex' consistency if not careful.
                // Let's create new row objects if needed.
                if (targetRowIdx >= newRows.length) {
                    // We need to add rows. 
                    // Construct new row
                    const newRow: CSVRow = {
                        rowIndex: targetRowIdx,
                        cells: Array(headers.length).fill('')
                    };
                    newRows.push(newRow);
                }

                const targetRow = { ...newRows[targetRowIdx] };
                const newCells = [...targetRow.cells];

                rowData.forEach((cellData, cIdx) => {
                    const targetColIdx = startCol + cIdx;
                    if (targetColIdx < headers.length) {
                        if (newCells[targetColIdx] !== cellData) {
                            newCells[targetColIdx] = cellData;
                            isDirty = true;
                        }
                    }
                });

                targetRow.cells = newCells;
                newRows[targetRowIdx] = targetRow;
            });

            if (isDirty) {
                projectState.updateFile(selectedFileId, { rows: newRows, isDirty: true });
            }

        } catch (err) {
            console.error('Failed to paste', err);
        }
    }, [selectedFileId, selectedRange, selectedCell, isEditing, headers.length]);

    // 全局键盘监听（处理直接输入和 F2）
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 1. 如果事件来自 input 元素（InlineEditor），不处理，防重复
            // 2. 如果正在编辑栏编辑（editingLocation === 'editor-bar'），不处理 Tab/Enter，交给 CodeMirror
            // 3. 检查 target 是否是 CodeMirror 的一部分（contenteditable）
            const target = e.target as HTMLElement;
            const isInput = target.tagName === 'INPUT';
            const isCodeMirror = target.classList.contains('cm-content') || target.closest('.cm-editor');

            if (isInput) return;
            if (editingLocation === 'editor-bar' && isCodeMirror) return;

            if (!selectedCell || !selectedFileId || isEditing) return;

            if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                void handleCopy({ preventDefault: () => { } } as React.ClipboardEvent);
                return;
            }

            if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
                e.preventDefault();
                void handlePaste({ preventDefault: () => { } } as React.ClipboardEvent);
                return;
            }

            // F2 进入编辑模式（追加）
            if (e.key === 'F2') {
                e.preventDefault();
                enterEditMode('append');
                setEditingLocation('cell');
                return;
            }

            // Delete key handling for rows
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // If we have full row selection via context menu or manual selection?
                // TODO: Check if we want to delete content or delete rows.
                // Usually Backspace clears content. Ctrl+ Delete deletes rows.
                if (e.ctrlKey) {
                    // Delete selected rows if range covers full width?
                    // For now, let's keep it simple.
                }
            }

            // Tab 和 Enter 键导航（阻止默认行为）
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                const directionMap: Record<string, 'up' | 'down' | 'left' | 'right' | 'enter' | 'tab' | 'shift-tab'> = {
                    'Enter': 'enter',
                    'Tab': e.shiftKey ? 'shift-tab' : 'tab'
                };
                navigateCell(directionMap[e.key]);
                return;
            }

            // 直接输入 → 替换模式
            // 排除控制键、功能键等
            if (
                e.key.length === 1 &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                e.key !== ' ' // 暂时排除空格，避免误触
            ) {
                e.preventDefault();
                enterEditMode('replace', e.key);
                setEditingLocation('cell');
                return;
            }

            // 方向键导航（非编辑模式）
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const directionMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
                    'ArrowUp': 'up',
                    'ArrowDown': 'down',
                    'ArrowLeft': 'left',
                    'ArrowRight': 'right'
                };
                navigateCell(directionMap[e.key]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedCell, selectedFileId, isEditing, enterEditMode, navigateCell, editingLocation, handleCopy, handlePaste]);

    // 自动滚动到选中项
    useEffect(() => {
        if (gridRef.current && selectedCell && width > 0 && height > 0) {
            gridRef.current.scrollToItem({
                columnIndex: selectedCell.col,
                rowIndex: selectedCell.row,
                align: 'smart'
            });
        }
    }, [selectedCell, width, height, rows.length]);

    // 计算 Grid 外层滚动条尺寸，用于表头/行号对齐
    useEffect(() => {
        const outer = gridOuterRef.current;
        if (!outer) return;
        const w = Math.max(0, outer.offsetWidth - outer.clientWidth);
        const h = Math.max(0, outer.offsetHeight - outer.clientHeight);
        setGridScrollbarSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
    }, [width, height, headers.length, rows.length]);







    // 同步滚动处理
    const lastSyncTimeRef = useRef(0);
    const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleGridScroll = useCallback(({ scrollLeft, scrollTop }: any) => {
        const now = Date.now();
        scrollTopRef.current = scrollTop;
        // 1. Sync Column Headers (Horizontal)
        if (headerRef.current) {
            headerRef.current.scrollLeft = scrollLeft;
        }

        // 2. Sync Row Headers (Vertical) - throttled to reduce React re-render frequency
        const elapsed = now - lastSyncTimeRef.current;
        if (elapsed >= 50) {
            lastSyncTimeRef.current = now;
            if (syncTimerRef.current !== null) {
                clearTimeout(syncTimerRef.current);
                syncTimerRef.current = null;
            }
            if (listRef.current) {
                listRef.current.scrollTo(scrollTop);
            }
        } else if (syncTimerRef.current === null) {
            // Trailing sync to ensure final position is correct
            syncTimerRef.current = setTimeout(() => {
                syncTimerRef.current = null;
                lastSyncTimeRef.current = Date.now();
                if (listRef.current) {
                    listRef.current.scrollTo(scrollTopRef.current);
                }
            }, 50 - elapsed);
        }
    }, []);

    const handleListScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: any) => {
        if (!scrollUpdateWasRequested && gridRef.current && Math.abs(scrollOffset - scrollTopRef.current) > 1) {
            gridRef.current.scrollTo({ scrollTop: scrollOffset });
        }
    }, []);

    // 单元格渲染函数
    const Cell = useCallback(({ columnIndex, rowIndex, style }: any) => {
        const row = rows[rowIndex];
        const content = row.cells[columnIndex] || '';
        const isSelected = selectedCell?.row === rowIndex && selectedCell?.col === columnIndex;

        // Calculate isInSelectedRange once
        const isInSelectedRange = (() => {
            if (!selectedRange) return false;
            const minRow = Math.min(selectedRange.start.row, selectedRange.end.row);
            const maxRow = Math.max(selectedRange.start.row, selectedRange.end.row);
            const minCol = Math.min(selectedRange.start.col, selectedRange.end.col);
            const maxCol = Math.max(selectedRange.start.col, selectedRange.end.col);
            return rowIndex >= minRow && rowIndex <= maxRow && columnIndex >= minCol && columnIndex <= maxCol;
        })();

        // Fill Preview Logic
        const isFillPreview = fillState?.isDragging &&
            rowIndex > fillState.endRow &&
            rowIndex <= fillState.targetRow &&
            columnIndex >= fillState.startCol &&
            columnIndex <= fillState.endCol;

        // Bottom Right Handle Logic
        const isBottomRight = (() => {
            if (isEditing) return false;
            let targetRow, targetCol;
            if (selectedRange) {
                targetRow = Math.max(selectedRange.start.row, selectedRange.end.row);
                targetCol = Math.max(selectedRange.start.col, selectedRange.end.col);
            } else if (selectedCell) {
                targetRow = selectedCell.row;
                targetCol = selectedCell.col;
            } else {
                return false;
            }
            return rowIndex === targetRow && columnIndex === targetCol;
        })();

        const isCurrentEditing = isEditing && editingCell?.row === rowIndex && editingCell?.col === columnIndex;

        // 搜索匹配判断
        const currentResult = searchResults[currentResultIndex];
        const isCurrentMatch = currentResult &&
            currentResult.fileId === selectedFileId &&
            currentResult.rowIndex === rowIndex &&
            currentResult.colIndex === columnIndex;

        const isOtherMatch = searchResults.some((res, idx) =>
            idx !== currentResultIndex &&
            res.fileId === selectedFileId &&
            res.rowIndex === rowIndex &&
            res.colIndex === columnIndex
        );

        // 基础校验规则：Key 不能为空且符合格式 (第一列)
        const isFirstColumn = columnIndex === 0;
        const isInvalidKey = isFirstColumn && (!content || !/^[A-Z0-9_]+$/.test(content));

        const handleClick = (e: React.MouseEvent) => {
            const now = Date.now();
            const lastClick = lastClickRef.current;

            // Close context menu if open
            setContextMenuState(prev => ({ ...prev, visible: false }));

            // 如果正在编辑其他单元格，先保存并退出编辑模式
            if (isEditing && editingCell) {
                if (editingCell.row !== rowIndex || editingCell.col !== columnIndex) {
                    // 点击的是其他单元格，需要先保存当前编辑并退出
                    const state = useEditorStore.getState();
                    const projectState = useProjectStore.getState();

                    // 保存当前编辑的内容
                    if (state.selectedFileId && state.tempValue !== undefined) {
                        const file = projectState.files[state.selectedFileId];
                        if (file && editingCell) {
                            const newRows = [...file.rows];
                            const newCells = [...newRows[editingCell.row].cells];
                            newCells[editingCell.col] = state.tempValue;
                            newRows[editingCell.row] = { ...newRows[editingCell.row], cells: newCells };
                            projectState.updateFile(state.selectedFileId, { rows: newRows, isDirty: true });
                        }
                    }

                    // 退出编辑模式
                    state.exitEditMode(true);
                }
            }

            // 检测双击：同一单元格，300ms内
            if (
                lastClick &&
                lastClick.row === rowIndex &&
                lastClick.col === columnIndex &&
                now - lastClick.time < 300
            ) {
                e.stopPropagation();
                e.preventDefault();

                // 清除单击记录，避免三击被误认为又一次双击
                lastClickRef.current = null;

                // 进入编辑模式
                setSelectedCell(rowIndex, columnIndex);
                requestAnimationFrame(() => {
                    enterEditMode('append', content);
                    setEditingLocation('cell');
                });

                return;
            }

            // 记录这次单击
            lastClickRef.current = { row: rowIndex, col: columnIndex, time: now };

            e.stopPropagation();

            // Check for Shift+Click (Multi-select / Range Select)
            if (e.shiftKey) {
                const anchor = useEditorStore.getState().selectedCell;
                if (anchor) {
                    // Preserve anchor, update range
                    const minRow = Math.min(anchor.row, rowIndex);
                    const maxRow = Math.max(anchor.row, rowIndex);
                    const minCol = Math.min(anchor.col, columnIndex);
                    const maxCol = Math.max(anchor.col, columnIndex);
                    setSelectedRange(
                        { row: minRow, col: minCol },
                        { row: maxRow, col: maxCol }
                    );
                    return; // Done, anchor stays
                }
            }

            // Normal Click: Set new anchor/active cell, clear range
            setSelectedCell(rowIndex, columnIndex);
            setSelectedRange(undefined);
        };

        const handleContextMenu = (e: React.MouseEvent) => {
            e.preventDefault();
            // Select cell if not already inside selection
            if (!isInSelectedRange && !isSelected) {
                setSelectedCell(rowIndex, columnIndex);
            }
            setContextMenuState({
                visible: true,
                x: e.clientX,
                y: e.clientY,
                type: 'cell',
                targetIndex: rowIndex // Pass context info
            });
        };

        // Toggle 列检测和处理
        const isToggleCol = currentToggleCols.has(columnIndex);
        const isToggleBoolValue = isToggleCol && isBooleanValue(content);

        const handleToggleClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (!selectedFileId || !isToggleBoolValue) return;

            /// 如果是空值，尝试推断该列的偏好格式（'1' 或 'true'）
            let preferredFormat = '1';

            // 简单推断：扫描前 20 行，看第一个非空值的格式
            // 优化：可以缓存这个结果，但考虑到点击频率不高，实时扫描也可以
            for (let r = 0; r < Math.min(rows.length, 20); r++) {
                const val = rows[r].cells[columnIndex]?.trim();
                if (!val) continue;
                if (val === 'true' || val === 'false') {
                    preferredFormat = 'true';
                    break;
                } else if (val === 'TRUE' || val === 'FALSE') {
                    preferredFormat = 'TRUE';
                    break;
                } else if (val === '0' || val === '1') {
                    preferredFormat = '1';
                    break;
                }
            }

            const newValue = toggleBooleanValue(content, preferredFormat);
            const file = useProjectStore.getState().files[selectedFileId];
            if (!file) return;

            const newRows = [...file.rows];
            const newCells = [...newRows[rowIndex].cells];
            newCells[columnIndex] = newValue;
            newRows[rowIndex] = { ...newRows[rowIndex], cells: newCells };
            updateFile(selectedFileId, { rows: newRows, isDirty: true });
        };

        // 渲染复选框或普通内容
        const renderContent = () => {
            if (isCurrentEditing) {
                if (editingLocation === 'cell') {
                    return <InlineEditor row={rowIndex} col={columnIndex} value={content} onNavigate={navigateCell} />;
                } else {
                    return <div className="cell-content-preview" style={{ whiteSpace: 'pre-wrap' }}>{tempValue}</div>;
                }
            }

            // Toggle 列显示复选框
            if (isToggleCol) {
                if (isToggleBoolValue) {
                    const checked = isTruthyValue(content);
                    return (
                        <div className="toggle-checkbox" onClick={handleToggleClick}>
                            {checked ? '☑' : '☐'}
                        </div>
                    );
                } else {
                    // 非布尔值显示原文
                    return content;
                }
            }

            return content;
        };

        return (
            <div
                style={style}
                className={`grid-cell ${isSelected ? 'selected' : ''} ${isInSelectedRange ? 'selected-range' : ''} ${isInvalidKey ? 'invalid-key' : ''} ${isCurrentMatch ? 'current-match' : isOtherMatch ? 'search-match' : ''
                    } ${isFillPreview ? 'fill-preview' : ''} ${isToggleCol ? 'toggle-column' : ''}`}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                title={content}
            >
                {renderContent()}

                {/* Fill Handle */}
                {isBottomRight && <div className="fill-handle" onMouseDown={(e) => handleFillMouseDown(e, rowIndex, columnIndex)} />}
            </div>
        );
    }, [rows, selectedCell, selectedRange, setSelectedCell, searchResults, currentResultIndex, selectedFileId, isEditing, editingCell, enterEditMode, navigateCell, tempValue, editingLocation, fillState, currentToggleCols, updateFile]);

    const handleRowContextMenu = (rowIndex: number, e: React.MouseEvent) => {
        e.preventDefault();

        // Select the row if not already multi-selected
        let shouldSelect = true;

        if (selectedRange) {
            const minRow = Math.min(selectedRange.start.row, selectedRange.end.row);
            const maxRow = Math.max(selectedRange.start.row, selectedRange.end.row);

            // Strict check: Only preserve selection if it contains the clicked row AND spans full width (is a row selection)
            const isFullWidth = (Math.min(selectedRange.start.col, selectedRange.end.col) === 0) &&
                (Math.max(selectedRange.start.col, selectedRange.end.col) === headers.length - 1);

            if (rowIndex >= minRow && rowIndex <= maxRow && isFullWidth) {
                shouldSelect = false; // Already inside valid row selection
            }
        }

        if (shouldSelect) {
            const colCount = headers.length;
            setSelectedCell(rowIndex, 0);
            setSelectedRange(
                { row: rowIndex, col: 0 },
                { row: rowIndex, col: colCount - 1 }
            );
        }

        setContextMenuState({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            type: 'row',
            targetIndex: rowIndex
        });
    };

    const handleColumnContextMenu = (colIndex: number, e: React.MouseEvent) => {
        e.preventDefault();

        // Select the column if not already selected
        let shouldSelect = true;
        if (selectedRange) {
            const minCol = Math.min(selectedRange.start.col, selectedRange.end.col);
            const maxCol = Math.max(selectedRange.start.col, selectedRange.end.col);

            // Strict check: Only preserve selection if it contains the clicked column AND spans full height (is a column selection)
            const isFullHeight = (Math.min(selectedRange.start.row, selectedRange.end.row) === 0) &&
                (Math.max(selectedRange.start.row, selectedRange.end.row) === rows.length - 1);

            if (colIndex >= minCol && colIndex <= maxCol && isFullHeight) {
                shouldSelect = false;
            }
        }

        if (shouldSelect) {
            const rowCount = rows.length;
            setSelectedCell(0, colIndex);
            setSelectedRange(
                { row: 0, col: colIndex },
                { row: rowCount - 1, col: colIndex }
            );
        }

        setContextMenuState({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            type: 'col', // New type
            targetIndex: colIndex
        });
    };

    const handleColumnClick = (colIndex: number, e: React.MouseEvent) => {
        const rowCount = rows.length;

        // Shift+Click multi-selection
        if (e.shiftKey) {
            const currentSelectedCell = useEditorStore.getState().selectedCell;
            if (currentSelectedCell) {
                const startCol = Math.min(currentSelectedCell.col, colIndex);
                const endCol = Math.max(currentSelectedCell.col, colIndex);
                setSelectedRange(
                    { row: 0, col: startCol },
                    { row: rowCount - 1, col: endCol }
                );
                return;
            }
        }

        // Basic Column Selection
        setSelectedCell(0, colIndex);
        setSelectedRange(
            { row: 0, col: colIndex },
            { row: rowCount - 1, col: colIndex }
        );
    };

    const getContextMenuItems = (): MenuItem[] => {
        const { type, targetIndex } = contextMenuState;
        if (!selectedFileId) return [];

        const items: MenuItem[] = [];

        // Determine selection count
        let selectedCount = 1;
        let startIndex = targetIndex;

        if (selectedRange) {
            if (type === 'row' || type === 'cell') {
                startIndex = Math.min(selectedRange.start.row, selectedRange.end.row);
                const endRow = Math.max(selectedRange.start.row, selectedRange.end.row);
                selectedCount = endRow - startIndex + 1;
            } else if (type === 'col') {
                startIndex = Math.min(selectedRange.start.col, selectedRange.end.col);
                const endCol = Math.max(selectedRange.start.col, selectedRange.end.col);
                selectedCount = endCol - startIndex + 1;
            }
        } else if (selectedCell) {
            startIndex = (type === 'row' || type === 'cell') ? selectedCell.row : selectedCell.col;
        }

        // Row Operations
        if (type === 'row' || type === 'cell') {
            const rowLabel = selectedCount > 1 ? `${selectedCount} 行` : '行';

            items.push({
                label: `在上方插入行`,
                inputType: 'number',
                defaultValue: selectedCount,
                action: (count) => insertRows(selectedFileId, startIndex, count || 1)
            });
            items.push({
                label: `在下方插入行`,
                inputType: 'number',
                defaultValue: selectedCount,
                action: (count) => insertRows(selectedFileId, startIndex + selectedCount, count || 1)
            });
            items.push({ separator: true, label: '' });
            items.push({
                label: `删除 ${rowLabel}`,
                danger: true,
                action: () => {
                    const indices = Array.from({ length: selectedCount }, (_, i) => startIndex + i);
                    deleteRows(selectedFileId, indices);
                    setSelectedCell(undefined);
                    setSelectedRange(undefined);
                }
            });
            items.push({
                label: `复制 ${rowLabel}`,
                action: () => {
                    const indices = Array.from({ length: selectedCount }, (_, i) => startIndex + i);
                    duplicateRows(selectedFileId, indices);
                }
            });
        }

        // Column Operations
        if (type === 'col') {
            const colLabel = selectedCount > 1 ? `${selectedCount} 列` : '列';

            items.push({
                label: `在左侧插入列`,
                inputType: 'number',
                defaultValue: selectedCount,
                action: (count) => insertColumns(selectedFileId, startIndex, count || 1)
            });
            items.push({
                label: `在右侧插入列`,
                inputType: 'number',
                defaultValue: selectedCount,
                action: (count) => insertColumns(selectedFileId, startIndex + selectedCount, count || 1)
            });

            // Toggle Column Options
            // Check if all selected columns are toggle columns
            const allToggle = (() => {
                for (let i = 0; i < selectedCount; i++) {
                    if (!currentToggleCols.has(startIndex + i)) return false;
                }
                return true;
            })();

            items.push({ separator: true, label: '' });
            if (allToggle) {
                items.push({
                    label: `取消 Toggle 列`,
                    action: () => {
                        for (let i = 0; i < selectedCount; i++) {
                            setToggleColumn(selectedFileId, startIndex + i, false);
                        }
                    }
                });
            } else {
                items.push({
                    label: `设为 Toggle 列`,
                    action: () => {
                        for (let i = 0; i < selectedCount; i++) {
                            setToggleColumn(selectedFileId, startIndex + i, true);
                        }
                    }
                });
            }

            items.push({ separator: true, label: '' });
            items.push({
                label: `删除 ${colLabel}`,
                danger: true,
                action: () => {
                    const indices = Array.from({ length: selectedCount }, (_, i) => startIndex + i);
                    deleteColumns(selectedFileId, indices);
                    setSelectedCell(undefined);
                    setSelectedRange(undefined);
                }
            });
        }

        return items;
    };

    const gridContent = useMemo(() => {
        if (width === 0 || height === 0) return null;

        const totalWidth = headers.reduce((sum, _, i) => sum + getColWidth(i), 0);
        const gridWidth = width - ROW_HEADER_WIDTH;

        return (
            <div
                className="grid-view-container"
                style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}
                ref={(node) => {
                    containerRef(node);
                    innerContainerRef.current = node;
                }}
                onContextMenu={(e) => e.preventDefault()}
                tabIndex={0}
                onCopy={handleCopy}
                onPaste={handlePaste}
            >
                {/* 主要布局：水平 Flex */}
                <div style={{ display: 'flex', flex: 1, height: '100%' }}>

                    {/* 左侧区域：左上角空块 + 行号栏 */}
                    <div style={{ width: ROW_HEADER_WIDTH, display: 'flex', flexDirection: 'column' }}>
                        {/* 左上角空块 (对应表头高度) */}
                        <div style={{ height: headerHeight, width: '100%', borderBottom: '1px solid #ccc', borderRight: '1px solid #ccc', backgroundColor: '#f4f4f4', flexShrink: 0 }}></div>

                        {/* 行号栏 */}
                        <RowHeaders
                            height={Math.max(0, height - headerHeight - gridScrollbarSize.h)}
                            rowCount={rows.length}
                            rowHeight={rowHeight}
                            listRef={listRef}
                            onScroll={handleListScroll}
                            onRowContextMenu={handleRowContextMenu}
                        />
                    </div>

                    {/* 右侧区域：表头 + 表格 */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* 表头部分 */}
                        <div
                            className="grid-header-wrapper"
                            ref={headerRef}
                            style={{ width: Math.max(0, gridWidth - gridScrollbarSize.w), overflow: 'hidden', flexShrink: 0 }}
                        >
                            <div className="grid-header" style={{ width: totalWidth, display: 'flex' }}>
                                {headers.map((header, index) => {
                                    const colW = getColWidth(index);

                                    const isColSelected = (() => {
                                        if (selectedRange) {
                                            const minCol = Math.min(selectedRange.start.col, selectedRange.end.col);
                                            const maxCol = Math.max(selectedRange.start.col, selectedRange.end.col);
                                            return index >= minCol && index <= maxCol;
                                        }
                                        return selectedCell?.col === index;
                                    })();

                                    const isHeaderEditing = isEditing && editingLocation === 'header' && editingCell?.col === index;

                                    return (
                                        <div
                                            key={index}
                                            className={`grid-header-cell ${isColSelected ? 'selected' : ''}`}
                                            style={{ width: colW, minWidth: colW }}
                                            onClick={(e) => handleColumnClick(index, e)}
                                            onContextMenu={(e) => handleColumnContextMenu(index, e)}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                // Enter header edit mode
                                                // Use editingCell to track which header (row= -1 or just use col)
                                                // We can just set row=0 (or -1) but rely on editingLocation='header'
                                                setSelectedCell(0, index); // Select top cell of column? Or just track col?
                                                // Actually editor store uses editingCell {row, col}.
                                                // We can use row=-1 to denote header if needed, but 'header' location is explicit.
                                                // Let's set editingCell to {row: -1, col: index} just to be safe/consistent
                                                // But we need to update store to allow row -1? Types are number.
                                                // Let's just USE existing selectedCell logic or specific header logic.
                                                // The store action `enterEditMode` uses `selectedCell` to set `editingCell`.
                                                // So we must set selectedCell to something. 
                                                // If we select cell (0, index), then editing start at (0, index).
                                                // But we want to edit HEADER.
                                                // We need to trick the store or just manually set state?
                                                // Store `enterEditMode` logic:
                                                // state.editingCell = { row: selectedCell.row, col: selectedCell.col };
                                                // state.tempValue = initialValue;

                                                // We can manually call `setState` or modify `enterEditMode`.
                                                // Or we can just set editingCell manually if exposed? No, it's not exposed as setter.
                                                // We have `enterEditMode`.
                                                // We can temporarily set selectedCell to {row: -1, col: index} then call enter.
                                                // But row -1 might break other things (virtual list).

                                                useEditorStore.setState({
                                                    isEditing: true,
                                                    editingCell: { row: -1, col: index },
                                                    editingLocation: 'header',
                                                    tempValue: header,
                                                    editMode: 'replace'
                                                });
                                            }}
                                        >
                                            {isHeaderEditing ? (
                                                <input
                                                    autoFocus
                                                    value={tempValue}
                                                    onChange={(e) => useEditorStore.getState().updateTempValue(e.target.value)}
                                                    onBlur={() => {
                                                        // Save
                                                        if (selectedFileId && tempValue !== undefined && tempValue !== header) {
                                                            updateHeader(selectedFileId, index, tempValue);
                                                        }
                                                        useEditorStore.getState().exitEditMode(true);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            if (selectedFileId && tempValue !== undefined && tempValue !== header) {
                                                                updateHeader(selectedFileId, index, tempValue);
                                                            }
                                                            useEditorStore.getState().exitEditMode(true);
                                                        } else if (e.key === 'Escape') {
                                                            useEditorStore.getState().exitEditMode(false);
                                                        }
                                                        e.stopPropagation();
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{ width: '100%', height: '100%', border: 'none', outline: 'none', padding: '0 4px' }}
                                                />
                                            ) : (
                                                header
                                            )}

                                            {/* Resizer Handle */}
                                            <div
                                                className={`col-resize-handle ${resizeState?.colIndex === index ? 'active' : ''}`}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    setResizeState({
                                                        colIndex: index,
                                                        startX: e.clientX,
                                                        startWidth: colW,
                                                        currentWidth: colW
                                                    });
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    // Auto Fit
                                                    if (selectedFileId) {
                                                        const bestWidth = calculateAutoFitWidth(rows, index, header);
                                                        setColumnWidth(selectedFileId, index, bestWidth);
                                                    }
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Grid */}
                        <div style={{ flex: 1, width: '100%' }}>
                            <Grid
                                ref={gridRef}
                                outerRef={gridOuterRef}
                                columnCount={headers.length}
                                columnWidth={getColWidth}
                                height={height - headerHeight}
                                rowCount={rows.length}
                                rowHeight={() => rowHeight}
                                width={gridWidth}
                                onScroll={handleGridScroll}
                                itemData={{}}
                            >
                                {Cell}
                            </Grid>
                        </div>
                    </div>
                </div>

                {fillMenuState?.visible && (
                    <div
                        className="fill-options-container"
                        style={{
                            position: 'absolute',
                            top: fillMenuState.rect.top,
                            left: fillMenuState.rect.left + 5,
                            zIndex: 100
                        }}
                    >
                        <div
                            className="fill-options-button"
                            onClick={() => setFillMenuState(prev => prev ? { ...prev, menuOpen: !prev.menuOpen } : null)}
                            title="自动填充选项"
                        >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
                            <span style={{ fontSize: '10px', marginLeft: 2 }}>▼</span>
                        </div>

                        {fillMenuState.menuOpen && (
                            <div className="fill-options-menu">
                                <div
                                    className={`fill-option-item ${fillMenuState.activeMode === 'copy' ? 'active' : ''}`}
                                    onClick={() => {
                                        if (!fillMenuState) return;
                                        const { startRow, endRow, startCol, endCol, targetRow } = fillMenuState.fillContext;
                                        performFill(startRow, endRow, startCol, endCol, targetRow, 'copy');
                                        setFillMenuState(prev => prev ? { ...prev, activeMode: 'copy', menuOpen: false } : null);
                                    }}
                                >
                                    <span>○</span> 复制单元格
                                </div>
                                <div
                                    className={`fill-option-item ${fillMenuState.activeMode === 'auto' ? 'active' : ''}`}
                                    onClick={() => {
                                        if (!fillMenuState) return;
                                        const { startRow, endRow, startCol, endCol, targetRow } = fillMenuState.fillContext;
                                        performFill(startRow, endRow, startCol, endCol, targetRow, 'auto');
                                        setFillMenuState(prev => prev ? { ...prev, activeMode: 'auto', menuOpen: false } : null);
                                    }}
                                >
                                    <span>●</span> 智能填充
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
        // Dependencies updated
    }, [
        width, height, headers, rows,
        getColWidth,
        handleGridScroll, handleCopy, handlePaste,
        fillMenuState,
        Cell,
        gridRef,
        performFill,
        headerHeight,
        rowHeight,
        gridScrollbarSize
    ]);



    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', overflow: 'hidden', outline: 'none' }}
            onContextMenu={(e) => e.preventDefault()}
            tabIndex={0} // Make focusable for keyboard events (copy/paste)
            onCopy={handleCopy}
            onPaste={handlePaste}
        >
            {gridContent}
            {contextMenuState.visible && (
                <ContextMenu
                    x={contextMenuState.x}
                    y={contextMenuState.y}
                    items={getContextMenuItems()}
                    onClose={() => setContextMenuState(prev => ({ ...prev, visible: false }))}
                />
            )}
        </div>
    );
};

export default GridView;
