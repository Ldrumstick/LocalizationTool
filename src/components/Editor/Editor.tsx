import React from 'react';
import { useProjectStore } from '../../stores/project-store';

import { useEditorStore } from '../../stores/editor-store';
import RichtextEditor from './RichtextEditor';
import GridView from './GridView';
import './Editor.css';

const Editor: React.FC = () => {
  const selectedFileId = useEditorStore((state) => state.selectedFileId);
  const selectedCell = useEditorStore((state) => state.selectedCell);
  const projectFiles = useProjectStore((state) => state.files);

  const currentFile = selectedFileId ? projectFiles[selectedFileId] : null;

  return (
    <div className="editor">
      <div className="editor-table">
        {currentFile ? (
          <GridView headers={currentFile.headers} rows={currentFile.rows} />
        ) : (
          <div className="table-placeholder">
            <p>表格编辑区域</p>
            <span>请在左侧选择一个文件进行编辑</span>
          </div>
        )}
      </div>
      
      <div className="editor-richtext">
        <div className="editor-richtext-header">
          {selectedCell 
            ? `编辑单元格 [Row: ${selectedCell.row + 1}, Col: ${selectedCell.col + 1}]`
            : '富文本编辑器'
          }
        </div>
        <div className="richtext-editor-wrapper">
          {selectedCell ? (
            <RichtextEditor />
          ) : (
            <div className="richtext-placeholder">
              <span>点击上方单元格开始编辑内容</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default Editor;
