import React, { useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../../stores/editor-store';
import { useHistoryStore } from '../../stores/history-store';
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
  const undoStackRef = useRef<string[]>([]);
  const lastValueRef = useRef<string>('');
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
    const initialValue = useEditorStore.getState().tempValue || value;
    setLocalValue(initialValue);
    lastValueRef.current = initialValue;
    
    // 自动聚焦
    if (inputRef.current) {
      inputRef.current.focus();
      // 将光标移到末尾
      inputRef.current.setSelectionRange(tempValue.length, tempValue.length);
    }
    return undefined;
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

  const handleCompositionStart = (_e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = true;
  };

  const handleCompositionUpdate = (_e: React.CompositionEvent<HTMLInputElement>) => {
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

    // Undo: Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (undoStackRef.current.length > 0) {
            e.preventDefault();
            const prevValue = undoStackRef.current.pop() ?? '';
            lastValueRef.current = prevValue;
            setLocalValue(prevValue);
            updateTempValue(prevValue);
            return;
        }
        // 如果当前内容与原始值一致（无修改），或者是空（Replace模式刚开始），且想撤销上一步操作
        // 则退出编辑模式，并触发全局 Undo
        const store = useEditorStore.getState();
        if (localValue === store.originalValue) {
            e.preventDefault();
            exitEditMode(false); // Cancel edit
            // Use setTimeout to ensure edit mode is exited before undoing (state sync)
            setTimeout(() => {
                useHistoryStore.getState().undo();
            }, 0);
            return;
        }
        // 否则，允许浏览器原生撤销（撤销文本修改）
        return;
    }

    // Redo: Ctrl+Shift+Z or Ctrl+Y
    if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
    ) {
        const store = useEditorStore.getState();
        if (localValue === store.originalValue) {
            e.preventDefault();
            exitEditMode(false);
            setTimeout(() => {
                useHistoryStore.getState().redo();
            }, 0);
            return;
        }
         // 否则，允许浏览器原生重做
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

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const nativeEvent = e.nativeEvent as InputEvent;
    if (!isComposingRef.current && nativeEvent?.inputType !== 'historyUndo') {
      const currentValue = e.currentTarget.value;
      const prevValue = lastValueRef.current;
      if (currentValue !== prevValue) {
        undoStackRef.current.push(prevValue);
        if (undoStackRef.current.length > 100) {
          undoStackRef.current.shift();
        }
        lastValueRef.current = currentValue;
      }
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="inline-editor"
      value={localValue}
      onChange={handleChange}
      onInput={handleInput}
      onCompositionStart={handleCompositionStart}
      onCompositionUpdate={handleCompositionUpdate}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
    />
  );
};

export default InlineEditor;
