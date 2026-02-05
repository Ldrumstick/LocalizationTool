import React, { memo, useRef } from 'react';
import { FixedSizeList, areEqual } from 'react-window';
import { useEditorStore } from '../../stores/editor-store';
import { useProjectStore } from '../../stores/project-store';
import './RowHeaders.css';

interface RowHeadersProps {
  height: number;
  rowCount: number;
  rowHeight: number;
  listRef: React.RefObject<FixedSizeList>;
  onScroll?: (props: { scrollOffset: number; scrollUpdateWasRequested: boolean }) => void;
  onRowContextMenu: (rowIndex: number, e: React.MouseEvent) => void;
}

const RowHeader = memo(({ index, style, data }: any) => {
  const { isSelected, onRowClick, onRowContextMenu } = data;
  
  // Highlighting logic handled by parent passing data or checking store?
  // Checking store for every row might be expensive if not careful.
  // But RowHeaders are fewer cells.
  // Let's pass the selection function or check store inside.
  // However, `data` is passed by react-window.
  // We'll trust the parent to pass necessary callback or store access inside memo?
  // No, memo compares props.
  // Let's use internal store access for selection state to avoiding passing huge data struct?
  // Store selector:
  const isRowSelected = useEditorStore((state) => {
     if (!state.selectedRange) {
        if (!state.selectedCell) return false;
        return state.selectedCell.row === index; 
     }
     const { start, end } = state.selectedRange;
     const min = Math.min(start.row, end.row);
     const max = Math.max(start.row, end.row);
     // For full row selection, we usually assume col spans all.
     // But here we just highlight row header if *any* part of row is selected?
     // Or only if *full* row is selected?
     // Design said "Click Row Header -> Select Full Row".
     // So if selectedRange covers full width, or just row inclusion.
     // Let's highlight if row is within selected range.
     return index >= min && index <= max;
  });

  return (
    <div
      style={style}
      className={`row-header-cell ${isRowSelected ? 'selected' : ''}`}
      onClick={(e) => onRowClick(index, e)}
      onContextMenu={(e) => onRowContextMenu(index, e)}
    >
      {index + 1}
    </div>
  );
}, areEqual);


const RowHeaders: React.FC<RowHeadersProps> = ({ 
  height, 
  rowCount, 
  rowHeight, 
  listRef,
  onScroll,
  onRowContextMenu
}) => {
  const setSelectedRange = useEditorStore((state) => state.setSelectedRange);
  const setSelectedCell = useEditorStore((state) => state.setSelectedCell);
  const selectedFileId = useEditorStore((state) => state.selectedFileId);
  // We need column count to select full row
  // But files are in projectStore
  const file = useProjectStore((state) => selectedFileId ? state.files[selectedFileId] : undefined);
  const colCount = file?.headers.length || 0;

  const handleRowClick = (rowIndex: number, e: React.MouseEvent) => {
    // If shift key, extend selection
    if (e.shiftKey && colCount > 0) {
        // We need a store access to get the current anchor (selectedCell)
        // But we can't access store state inside callback without hook?
        // Actually we can use useEditorStore.getState() for transient updates,
        // but passing props or using the hook variables is better.
        // We have `setSelectedCell` from hook. Do we have `selectedCell`?
        // We need to fetch current state.
        const currentSelectedCell = useEditorStore.getState().selectedCell;
        
        if (currentSelectedCell) {
            const startRow = Math.min(currentSelectedCell.row, rowIndex);
            const endRow = Math.max(currentSelectedCell.row, rowIndex);
            
            // Keep the anchor cell as is (or update? usually anchor stays)
            // But we need to update range
            setSelectedRange(
                { row: startRow, col: 0 },
                { row: endRow, col: colCount - 1 }
            );
            return;
        }
    }

    if (colCount > 0) {
       setSelectedCell(rowIndex, 0);
       setSelectedRange(
         { row: rowIndex, col: 0 },
         { row: rowIndex, col: colCount - 1 }
       );
    }
  };

  const itemData = {
    onRowClick: handleRowClick,
    onRowContextMenu: onRowContextMenu
  };

  return (
    <FixedSizeList
      height={height}
      itemCount={rowCount}
      itemSize={rowHeight}
      width={50}
      ref={listRef}
      itemData={itemData}
      onScroll={onScroll}
      className="row-headers-list"
      style={{ overflow: 'hidden' }} // Hide scrollbar, controlled by Grid
    >
      {RowHeader}
    </FixedSizeList>
  );
};

export default RowHeaders;
