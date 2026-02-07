import React from 'react';

interface FileConflictModalProps {
    fileName: string;
    onReload: () => void;
    onKeepLocal: () => void;
}

const FileConflictModal: React.FC<FileConflictModalProps> = ({ fileName, onReload, onKeepLocal }) => {
    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                backgroundColor: 'white', padding: '24px', borderRadius: '8px',
                width: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
                <h3 style={{ marginTop: 0, color: '#d93025', fontSize: '18px', marginBottom: '12px' }}>
                    发现外部更改
                </h3>
                <p style={{ margin: '0 0 20px 0', fontSize: '14px', lineHeight: '1.5', color: '#333' }}>
                    文件 <strong>{fileName}</strong> 已被外部程序修改，但您有未保存的本地更改。
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                     <button 
                        onClick={onKeepLocal} 
                        style={{ 
                            padding: '8px 16px', 
                            border: '1px solid #ddd', 
                            background: 'white', 
                            borderRadius: '4px', 
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#333'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#bbb'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#ddd'}
                    >
                        保留本地 (Keep Local)
                    </button>
                    <button 
                        onClick={onReload} 
                        style={{ 
                            padding: '8px 16px', 
                            border: 'none', 
                            background: '#d93025', 
                            color: 'white', 
                            borderRadius: '4px', 
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    >
                        重新加载 (Reload)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FileConflictModal;
