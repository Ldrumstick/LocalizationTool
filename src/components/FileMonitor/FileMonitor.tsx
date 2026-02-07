import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/project-store';
import FileConflictModal from './FileConflictModal';

const FileMonitor: React.FC = () => {
    // Actions are stable
    const { reloadFile, updateFileTimestamp } = useProjectStore();
    
    const [conflictFile, setConflictFile] = useState<{ id: string, name: string, data: any, timestamp: number } | null>(null);
    const [notification, setNotification] = useState<string | null>(null);

    useEffect(() => {
        const handleExternalChange = (data: any) => {
            const { fileId, fileName, lastModified, data: fileData } = data;
            
            // Access current state without subscription to avoid re-running effect
            const currentFiles = useProjectStore.getState().files;
            const file = currentFiles[fileId];

            if (!file) return;
            if (file.lastModified && Math.abs(file.lastModified - lastModified) < 2) {
               return;
            }

            // If file is dirty, show conflict modal
            if (file.isDirty) {
               setConflictFile({ id: fileId, name: fileName, data: fileData, timestamp: lastModified });
            } else {
               // If clean, auto-reload and notify
               // Ensure we are using the actions from the hook or store
               // Since we are inside useEffect, we can use the ones from closure or store.getState()
               useProjectStore.getState().reloadFile(fileId, fileData, lastModified);
               
               setNotification(`外部文件 ${fileName} 已更新，已自动同步`);
               setTimeout(() => setNotification(null), 3000);
            }
        };

        if (window.electronAPI && window.electronAPI.onFileChange) {
            window.electronAPI.onFileChange(handleExternalChange);
        }

        return () => {
             if (window.electronAPI && window.electronAPI.removeFileChangeListener) {
                window.electronAPI.removeFileChangeListener();
             }
        };
    }, []); 

    return (
        <>
            {conflictFile && (
                <FileConflictModal 
                    fileName={conflictFile.name}
                    onReload={() => {
                        reloadFile(conflictFile.id, conflictFile.data, conflictFile.timestamp);
                        setConflictFile(null);
                    }}
                    onKeepLocal={() => {
                        // Just update timestamp to ignore this change
                        updateFileTimestamp(conflictFile.id, conflictFile.timestamp);
                        setConflictFile(null);
                    }}
                />
            )}
            
            {notification && (
                <div style={{
                    position: 'fixed', bottom: '20px', right: '20px',
                    background: '#323232', color: 'white', padding: '12px 24px',
                    borderRadius: '4px', boxShadow: '0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23)',
                    zIndex: 2000, fontSize: '14px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    animation: 'fadeIn 0.3s ease'
                }}>
                    <span style={{ fontSize: '16px' }}>🔄</span>
                    {notification}
                </div>
            )}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </>
    );
};
export default FileMonitor;
