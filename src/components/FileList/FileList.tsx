import React from 'react';
import { useProjectStore } from '../../stores/project-store';
import { useEditorStore } from '../../stores/editor-store';
import { fileService } from '../../services/file-service';
import './FileList.css';

const FileList: React.FC = () => {
  const files = useProjectStore((state) => state.files);
  const toggleIgnoreFile = useProjectStore((state) => state.toggleIgnoreFile);
  const selectedFileId = useEditorStore((state) => state.selectedFileId);
  const setSelectedFile = useEditorStore((state) => state.setSelectedFile);

  const groups = useProjectStore((state) => state.groups);
  const addGroup = useProjectStore((state) => state.addGroup);
  const deleteGroup = useProjectStore((state) => state.deleteGroup);
  const renameGroup = useProjectStore((state) => state.renameGroup);
  const addFileToGroup = useProjectStore((state) => state.addFileToGroup);
  const removeFileFromGroup = useProjectStore((state) => state.removeFileFromGroup);

  const [showIgnored, setShowIgnored] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{
    visible: boolean;
    x: number;
    y: number;
    targetId: string;
    type: 'file' | 'group';
  } | null>(null);

  // Rename States
  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null);
  const [editingValue, setEditingValue] = React.useState('');

  // Grouping Logic
  const organizedFiles = React.useMemo(() => {
    const grouped: Record<string, string[]> = {}; // groupId -> fileIds
    const ungrouped: string[] = [];

    // Initialize groups
    Object.keys(groups).forEach(gId => grouped[gId] = []);

    // Distribute files
    Object.values(files).forEach(file => {
      if (file.isIgnored && !showIgnored) return;

      // Find which group this file belongs to
      const groupEntry = Object.entries(groups).find(([_, g]) => g.fileIds.includes(file.id));
      if (groupEntry) {
        grouped[groupEntry[0]].push(file.id);
      } else {
        ungrouped.push(file.id);
      }
    });

    return { grouped, ungrouped };
  }, [files, groups, showIgnored]);

  const handleFileClick = async (fileId: string) => {
    const editorState = useEditorStore.getState();
    if (editorState.isEditing && editorState.selectedFileId && editorState.selectedFileId !== fileId) {
       // Auto-commit current edit if switching files
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

  const handleContextMenu = (e: React.MouseEvent, targetId: string, type: 'file' | 'group') => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetId,
      type,
    });
  };

  // Close context menu
  React.useEffect(() => {
    const handleClick = () => { if (contextMenu) setContextMenu(null); };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Rename Handlers
  const handleRenameGroupStart = () => {
    if (!contextMenu || contextMenu.type !== 'group') return;
    const group = groups[contextMenu.targetId];
    if (!group) return;
    
    setEditingGroupId(group.id);
    setEditingValue(group.name);
    setContextMenu(null);
  };

  const handleRenameSubmit = () => {
    if (editingGroupId && editingValue.trim()) {
      renameGroup(editingGroupId, editingValue.trim());
    }
    setEditingGroupId(null);
    setEditingValue('');
  };

  const handleRenameCancel = () => {
    setEditingGroupId(null);
    setEditingValue('');
  };

  return (
    <div className="file-list">
      <div className="file-list-header">
        <h3>项目文件</h3>
        <div className="header-actions">
            <button 
                className="icon-btn"
                onClick={() => addGroup('新分组')}
                title="新建分组"
            >
                📁+
            </button>
            <button 
                className={`icon-btn ${showIgnored ? 'active' : ''}`}
                onClick={() => setShowIgnored(!showIgnored)}
                title={showIgnored ? "隐藏已忽略文件" : "显示已忽略文件"}
            >
                {showIgnored ? '👁️' : '👁️‍🗨️'}
            </button>
        </div>
      </div>
      <div className="file-list-content">
        {Object.keys(files).length === 0 ? (
          <p className="empty-message">请打开项目</p>
        ) : (
          <div className="file-tree">
            {/* Render Groups */}
            {Object.keys(organizedFiles.grouped).map(groupId => {
                const group = groups[groupId];
                const fileIds = organizedFiles.grouped[groupId];
                const isRenaming = editingGroupId === groupId;

                return (
                    <div key={groupId} className="group-section">
                        <div 
                            className="group-header" 
                            onContextMenu={(e) => handleContextMenu(e, groupId, 'group')}
                        >
                            {isRenaming ? (
                                <input
                                    autoFocus
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onBlur={handleRenameSubmit}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleRenameSubmit();
                                        if (e.key === 'Escape') handleRenameCancel();
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <>
                                    <span className="group-icon">📂</span>
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={group.name}>
                                        {group.name}
                                    </span>
                                    <span className="group-count">{fileIds.length}</span>
                                </>
                            )}
                        </div>
                        <ul className="file-items">
                            {fileIds.map(fid => {
                                const file = files[fid];
                                if (!file) return null;
                                return (
                                    <li
                                        key={fid}
                                        className={`file-item ${selectedFileId === fid ? 'active' : ''} ${file.isIgnored ? 'ignored' : ''}`}
                                        onClick={() => handleFileClick(fid)}
                                        onContextMenu={(e) => handleContextMenu(e, fid, 'file')}
                                    >
                                        <span className="file-icon">📄</span>
                                        <span className="file-name">
                                            {file.fileName}
                                        </span>
                                        {file.isDirty && <span className="dirty-indicator" title="未保存"></span>}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                );
            })}

            {/* Render Ungrouped */}
            {organizedFiles.ungrouped.length > 0 && (
                <div className="group-section">
                     {Object.keys(groups).length > 0 && (
                        <div className="group-header" style={{ cursor: 'default' }}>
                             <span className="group-icon" style={{ opacity: 0.5 }}>📁</span>
                             <span style={{ opacity: 0.7 }}>末分组</span>
                        </div>
                    )}
                    <ul className="file-items">
                        {organizedFiles.ungrouped.map(fid => {
                            const file = files[fid];
                            if (!file) return null;
                            return (
                                <li
                                    key={fid}
                                    className={`file-item ${selectedFileId === fid ? 'active' : ''} ${file.isIgnored ? 'ignored' : ''}`}
                                    onClick={() => handleFileClick(fid)}
                                    onContextMenu={(e) => handleContextMenu(e, fid, 'file')}
                                    style={Object.keys(groups).length === 0 ? { marginLeft: 0 } : undefined}
                                >
                                    <span className="file-icon">📄</span>
                                    <span className="file-name">
                                        {file.fileName}
                                    </span>
                                    {file.isDirty && <span className="dirty-indicator" title="未保存"></span>}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
          </div>
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
            }}
        >
            {contextMenu.type === 'file' ? (
                <>
                     <div className="context-menu-item" onClick={() => { toggleIgnoreFile(contextMenu.targetId); setContextMenu(null); }}>
                        {files[contextMenu.targetId]?.isIgnored ? "还原文件" : "忽略文件"}
                    </div>
                    <div className="context-menu-divider" />
                    <div className="context-menu-label">添加到分组:</div>
                    {Object.values(groups).map(g => (
                        <div 
                            key={g.id} 
                            className="context-menu-item" 
                            onClick={() => { addFileToGroup(g.id, contextMenu.targetId); setContextMenu(null); }}
                        >
                            <span style={{ marginRight: 6 }}>📁</span> {g.name}
                        </div>
                    ))}
                    {Object.values(groups).some(g => g.fileIds.includes(contextMenu.targetId)) && (
                         <div 
                            className="context-menu-item" 
                            style={{ color: '#d9534f' }}
                            onClick={() => { 
                                const groupId = Object.values(groups).find(g => g.fileIds.includes(contextMenu.targetId as string))?.id;
                                if (groupId) removeFileFromGroup(groupId, contextMenu.targetId);
                                setContextMenu(null);
                            }}
                        >
                            移出分组
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div className="context-menu-item" onClick={handleRenameGroupStart}>重命名分组</div>
                    <div 
                        className="context-menu-item" 
                        style={{ color: '#d9534f' }}
                        onClick={() => { 
                           try {
                               if (window.confirm('确定要删除此分组吗？组内文件将变为未分组状态。')) {
                                   deleteGroup(contextMenu.targetId);
                               }
                           } catch (e) {
                               console.warn('Confirm dialog failed', e);
                               deleteGroup(contextMenu.targetId);
                           }
                           setContextMenu(null);
                        }}
                    >
                        删除分组
                    </div>
                </>
            )}
        </div>
      )}
    </div>
  );
};

export default FileList;
