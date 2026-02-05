import React, { useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { useProjectStore } from '../../stores/project-store';
import './InlineEditor.css';

interface InlineEditorProps {
  row: number;
  col: number;
  value: string;
  onNavigate: (direction: 'up' | 'down' | 'left' | 'right' | 'enter' | 'tab' | 'shift-tab') => void;
}

const InlineEditor: React.FC<InlineEditorProps> = ({ row, col, value, onNavigate }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const { tempValue, updateTempValue, exitEditMode, editMode, selectedFileId } = useEditorStore();
  const [localValue, setLocalValue] = useState(tempValue);
  const updateFile = useProjectStore((state) => state.updateFile);
  const files = useProjectStore((state) => state.files);

  useEffect(() => {
    // 初始化 tempValue 和 originalValue
    const storeState = useEditorStore.getState();
    const shouldInit = editMode === 'append' && storeState.tempValue === '';
    if (shouldInit) {
      updateTempValue(value);
      useEditorStore.setState({ originalValue: value });
    }
    setLocalValue(useEditorStore.getState().tempValue || value);
    
    // 自动聚焦
    if (inputRef.current) {
      inputRef.current.focus();
      // 将光标移到末尾
      inputRef.current.setSelectionRange(tempValue.length, tempValue.length);
    }
  }, []);

  useEffect(() => {
    if (!isComposingRef.current) {
      setLocalValue(tempValue);
    }
  }, [tempValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    if (!isComposingRef.current) {
      updateTempValue(e.target.value);
    }
  };

  const handleCompositionStart = (e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = true;
  };

  const handleCompositionUpdate = (e: React.CompositionEvent<HTMLInputElement>) => {
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    setLocalValue(e.currentTarget.value);
    updateTempValue(e.currentTarget.value);
  };

  const confirmEdit = () => {
    if (!selectedFileId) return;
    
    const file = files[selectedFileId];
    if (!file) return;

    // 更新单元格内容到 projectStore
    const newRows = [...file.rows];
    const newCells = [...newRows[row].cells];
    newCells[col] = tempValue;
    newRows[row] = { ...newRows[row], cells: newCells };

    updateFile(selectedFileId, { rows: newRows, isDirty: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 左右键在编辑模式下用于移动光标，不阻止
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      return;
    }

    // 处理导航键
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmEdit();
      exitEditMode(true);
      onNavigate('enter');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      confirmEdit();
      exitEditMode(true);
      onNavigate(e.shiftKey ? 'shift-tab' : 'tab');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      exitEditMode(false); // 取消编辑，不保存
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      confirmEdit();
      exitEditMode(true);
      onNavigate('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      confirmEdit();
      exitEditMode(true);
      onNavigate('down');
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="inline-editor"
      value={localValue}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionUpdate={handleCompositionUpdate}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
    />
  );
};

export default InlineEditor;
