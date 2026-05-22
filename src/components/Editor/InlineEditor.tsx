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

interface UndoEntry {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const InlineEditor: React.FC<InlineEditorProps> = ({ row, col, value, onNavigate }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const pendingUndoEntryRef = useRef<UndoEntry | null>(null);
  const lastValueRef = useRef<string>('');
  const { tempValue, updateTempValue, exitEditMode, editMode, selectedFileId } = useEditorStore();
  const [localValue, setLocalValue] = useState(tempValue);
  const updateCell = useProjectStore((state) => state.updateCell);

  const createUndoEntry = (input: HTMLInputElement): UndoEntry => ({
    value: lastValueRef.current,
    selectionStart: input.selectionStart ?? lastValueRef.current.length,
    selectionEnd: input.selectionEnd ?? lastValueRef.current.length
  });

  const inferUndoEntry = (input: HTMLInputElement, nativeEvent: InputEvent): UndoEntry => {
    const currentValue = input.value;
    const prevValue = lastValueRef.current;
    const currentSelectionStart = input.selectionStart ?? currentValue.length;
    const currentSelectionEnd = input.selectionEnd ?? currentSelectionStart;
    const inputType = nativeEvent?.inputType;

    if (inputType?.startsWith('insert') || (!inputType && currentValue.length > prevValue.length)) {
      const insertedLength = nativeEvent.data?.length ?? Math.max(0, currentValue.length - prevValue.length);
      const selectionStart = Math.max(0, currentSelectionStart - insertedLength);
      const replacedLength = Math.max(0, prevValue.length + insertedLength - currentValue.length);
      return { value: prevValue, selectionStart, selectionEnd: selectionStart + replacedLength };
    }

    if (inputType === 'deleteContentBackward' || (!inputType && currentValue.length < prevValue.length)) {
      const deletedLength = Math.max(0, prevValue.length - currentValue.length);
      const selectionStart = currentSelectionStart + deletedLength;
      return { value: prevValue, selectionStart, selectionEnd: selectionStart };
    }

    if (inputType === 'deleteContentForward') {
      return { value: prevValue, selectionStart: currentSelectionStart, selectionEnd: currentSelectionEnd };
    }

    return { value: prevValue, selectionStart: currentSelectionStart, selectionEnd: currentSelectionEnd };
  };

  const restoreSelection = (selectionStart: number, selectionEnd: number) => {
    setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      const nextStart = Math.min(selectionStart, input.value.length);
      const nextEnd = Math.min(selectionEnd, input.value.length);
      input.setSelectionRange(nextStart, nextEnd);
    }, 0);
  };

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
      inputRef.current.setSelectionRange(initialValue.length, initialValue.length);
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
    // Use updateCell to ensure history entry is recorded for undo/redo.
    updateCell(selectedFileId, row, col, tempValue);
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
            const prevEntry = undoStackRef.current.pop();
            if (!prevEntry) return;
            lastValueRef.current = prevEntry.value;
            setLocalValue(prevEntry.value);
            updateTempValue(prevEntry.value);
            restoreSelection(prevEntry.selectionStart, prevEntry.selectionEnd);
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
        const inferredEntry = inferUndoEntry(e.currentTarget, nativeEvent);
        const pendingEntry = pendingUndoEntryRef.current;
        const shouldUsePendingEntry = pendingEntry && !(
          currentValue !== prevValue &&
          pendingEntry.selectionStart === e.currentTarget.selectionStart &&
          pendingEntry.selectionEnd === e.currentTarget.selectionEnd
        );
        undoStackRef.current.push(shouldUsePendingEntry ? pendingEntry : inferredEntry);
        pendingUndoEntryRef.current = null;
        if (undoStackRef.current.length > 100) {
          undoStackRef.current.shift();
        }
        lastValueRef.current = currentValue;
      }
    }
  };

  const handleBeforeInput = (e: React.FormEvent<HTMLInputElement>) => {
    if (!isComposingRef.current) {
      pendingUndoEntryRef.current = createUndoEntry(e.currentTarget);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="inline-editor"
      value={localValue}
      onChange={handleChange}
      onBeforeInput={handleBeforeInput}
      onInput={handleInput}
      onCompositionStart={handleCompositionStart}
      onCompositionUpdate={handleCompositionUpdate}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
};

export default InlineEditor;
