import React from 'react';
import { useProjectStore } from '../../stores/project-store';
import { useEditorStore } from '../../stores/editor-store';
import { fileService } from '../../services/file-service';
import './FileList.css';

const FileList: React.FC = () => {
  const files = useProjectStore((state) => state.files);
  const toggleIgnoreFile = useProjectStore((state) => state.toggleIgnoreFile);
  const selectedFileId = useEditorStore((state) => state.selectedFileId);
  const setSelectedFile = useEditorStore((state) => state.setSelectedFile); // We won't set null here, just switch files

  const [showIgnored, setShowIgnored] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{
    visible: boolean;
    x: number;
    y: number;
    fileId: string;
  } | null>(null);

  const handleFileClick = async (fileId: string) => {
    const editorState = useEditorStore.getState();
    if (editorState.isEditing && editorState.selectedFileId && editorState.selectedFileId !== fileId) {
      if (editorState.editingLocation !== 'header') {
        const targetCell = editorState.editingCell ?? editorState.selectedCell;
        if (targetCell) {
          useProjectStore.getState().updateCell(
            editorState.selectedFileId,
            targetCell.row,
            targetCell.col,
            editorState.tempValue
          );
        }
      }
    }
    setSelectedFile(fileId);
    
    const file = files[fileId];
    if (file && (!file.rows || file.rows.length === 0)) {
      await fileService.readFile(fileId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      fileId,
    });
  };

  // Close context menu on click elsewhere
  React.useEffect(() => {
    const handleClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const fileList = Object.values(files);
  
  // Filtering logic
  const displayedFiles = fileList.filter(file => {
      if (file.isIgnored && !showIgnored) return false;
      return true;
  });

  return (
    <div className="file-list">
      <div className="file-list-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>项目文件</h3>
            <div 
                className="show-ignored-toggle"
                onClick={() => setShowIgnored(!showIgnored)}
                title={showIgnored ? "隐藏已忽略文件" : "显示已忽略文件"}
                style={{ cursor: 'pointer', fontSize: '12px', color: showIgnored ? '#007bff' : '#999', userSelect: 'none' }}
            >
                {showIgnored ? '隐藏已忽略' : '显示已忽略'}
            </div>
        </div>
      </div>
      <div className="file-list-content">
        {fileList.length === 0 ? (
          <p className="empty-message">请通过 File → Open Project 打开项目</p>
        ) : (
          <ul className="file-items">
            {displayedFiles.map((file) => (
              <li
                key={file.id}
                className={`file-item ${selectedFileId === file.id ? 'active' : ''} ${
                  file.isIgnored ? 'ignored' : ''
                }`}
                onClick={() => handleFileClick(file.id)}
                onContextMenu={(e) => handleContextMenu(e, file.id)}
              >
                <span className="file-name">
                  {file.fileName}
                  {file.isDirty && <span className="dirty-mark">*</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {/* Context Menu */}
      {contextMenu && contextMenu.visible && (
        <div
            className="file-context-menu"
            style={{
                position: 'fixed',
                top: contextMenu.y,
                left: contextMenu.x,
                zIndex: 1000,
                backgroundColor: 'white',
                border: '1px solid #ccc',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                padding: '4px 0',
                borderRadius: '4px',
                minWidth: '120px'
            }}
        >
            <div 
                className="context-menu-item"
                onClick={() => {
                   toggleIgnoreFile(contextMenu.fileId);
                   setContextMenu(null);
                }}
                style={{
                    padding: '6px 16px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    color: '#333'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f3f4'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                {files[contextMenu.fileId]?.isIgnored ? "还原文件" : "忽略文件"}
            </div>
        </div>
      )}
    </div>
  );
};

export default FileList;
