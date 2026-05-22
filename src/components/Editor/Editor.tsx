import React, { useCallback, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/project-store';

import { useEditorStore } from '../../stores/editor-store';
import { formatTextFileFormatLabel } from '../../utils/text-file-format';
import './Editor.css';
import GlideGridView from './GlideGridView';
import RichtextEditor from './RichtextEditor';
import EditorToolbar from './EditorToolbar';
import EditorContextMenu from './EditorContextMenu';
import EditorInputModal from './EditorInputModal';
import EditorColorPickerModal from './EditorColorPickerModal';

const Editor: React.FC = () => {
  const selectedFileId = useEditorStore((state) => state.selectedFileId);
  const selectedCell = useEditorStore((state) => state.selectedCell);
  const inputModal = useEditorStore((state) => state.inputModal);
  const setInputModal = useEditorStore((state) => state.setInputModal);
  const colorPickerModal = useEditorStore((state) => state.colorPickerModal);
  const setColorPickerModal = useEditorStore((state) => state.setColorPickerModal);
  const projectFiles = useProjectStore((state) => state.files);

  const currentFile = selectedFileId ? projectFiles[selectedFileId] : null;
  const currentFileFormatLabel = currentFile
    ? formatTextFileFormatLabel(currentFile)
    : '';

  // 编辑栏高度状态 (像素)
  const [editorHeight, setEditorHeight] = useState(220);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // 开始拖动
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = editorHeight;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [editorHeight]);

  // 拖动中
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;

    const deltaY = startY.current - e.clientY; // 向上拖动为正
    const newHeight = Math.max(100, Math.min(600, startHeight.current + deltaY));
    setEditorHeight(newHeight);
  }, []);

  // 结束拖动
  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleMouseMove]);

  return (
    <div className="editor" ref={containerRef}>
      <div className="editor-table">
        {currentFile ? (
          <GlideGridView headers={currentFile.headers} rows={currentFile.rows} />
        ) : (
          <div className="table-placeholder">
            <p>表格编辑区域</p>
            <span>请在左侧选择一个文件进行编辑</span>
          </div>
        )}
      </div>

      {/* 可拖动分隔条 */}
      <div
        className="editor-resizer"
        onMouseDown={handleMouseDown}
      >
        <div className="resizer-handle" />
      </div>

      <div className="editor-richtext" style={{ height: editorHeight }}>
        <div className="editor-richtext-header">
          <div className="editor-richtext-header-main">
            {selectedCell && currentFile
              ? `${currentFile.headers[selectedCell.col] || `Col ${selectedCell.col + 1}`} [Row: ${selectedCell.row + 1}, Col: ${selectedCell.col + 1}]`
              : '富文本编辑器'
            }
          </div>
          {currentFile && (
            <div className="editor-richtext-header-meta">
              <span className="editor-current-file-name" title={currentFile.fileName}>
                {currentFile.fileName}
              </span>
              <span className="editor-current-file-format" title={`当前文本格式：${currentFileFormatLabel}`}>
                {currentFileFormatLabel}
              </span>
            </div>
          )}
        </div>
        <div className="richtext-editor-wrapper">
          <EditorToolbar />
          {selectedCell ? (
            <RichtextEditor />
          ) : (
            <div className="richtext-placeholder">
              <span>点击上方单元格开始编辑内容</span>
            </div>
          )}
        </div>
      </div>
      <EditorContextMenu />
      {inputModal && (
        <EditorInputModal
          isOpen={inputModal.isOpen}
          title={inputModal.title}
          defaultValue={inputModal.defaultValue}
          onConfirm={(val) => {
            inputModal.onConfirm(val);
            setInputModal(null);
          }}
          onCancel={() => setInputModal(null)}
        />
      )}
      {colorPickerModal && (
        <EditorColorPickerModal
          isOpen={colorPickerModal.isOpen}
          defaultColor={colorPickerModal.defaultColor}
          onConfirm={(color) => {
            colorPickerModal.onConfirm(color);
            setColorPickerModal(null);
          }}
          onCancel={() => setColorPickerModal(null)}
        />
      )}
    </div>
  );
};


export default Editor;

