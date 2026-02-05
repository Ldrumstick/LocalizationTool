import React from 'react';
import { useProjectStore } from '../../stores/project-store';
import { useEditorStore } from '../../stores/editor-store';
import { fileService } from '../../services/file-service';
import './FileList.css';

const FileList: React.FC = () => {
  const files = useProjectStore((state) => state.files);
  const selectedFileId = useEditorStore((state) => state.selectedFileId);
  const setSelectedFile = useEditorStore((state) => state.setSelectedFile);

  const handleFileClick = async (fileId: string) => {
    setSelectedFile(fileId);
    
    // 仅当文件未加载时才读取，避免覆盖内存中的脏数据
    const file = files[fileId];
    if (file && (!file.rows || file.rows.length === 0)) {
      await fileService.readFile(fileId);
    }
  };

  const fileList = Object.values(files);

  return (
    <div className="file-list">
      <div className="file-list-header">
        <h3>项目文件</h3>
      </div>
      <div className="file-list-content">
        {fileList.length === 0 ? (
          <p className="empty-message">请通过 File → Open Project 打开项目</p>
        ) : (
          <ul className="file-items">
            {fileList.map((file) => (
              <li
                key={file.id}
                className={`file-item ${selectedFileId === file.id ? 'active' : ''} ${
                  file.isIgnored ? 'ignored' : ''
                }`}
                onClick={() => handleFileClick(file.id)}
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
    </div>
  );
};

export default FileList;
