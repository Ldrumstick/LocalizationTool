import React, { useEffect } from 'react';
import FileList from './components/FileList/FileList';
import Editor from './components/Editor/Editor';
import FunctionPanel from './components/FunctionPanel/FunctionPanel';
import { useAutoSave } from './hooks/use-auto-save';
import { fileService } from './services/file-service';
import './App.css';

function App() {
    // 启用自动保存 (默认 30s)
    useAutoSave(30000);

    // 监听原生菜单事件
    useEffect(() => {
        // 保存
        window.electronAPI.onSaveTrigger(async () => {
            console.log('Menu触发保存');
            try {
                await fileService.saveAllDirtyFiles();
            } catch (err) {
                console.error('保存失败', err);
            }
        });

        // 打开项目
        window.electronAPI.onOpenProjectTrigger(async () => {
            try {
                await fileService.openProject();
            } catch (err) {
                console.error('打开项目失败', err);
            }
        });

        return () => {
            window.electronAPI.removeMenuListeners();
        };
    }, []);

    return (
        <div className="app">
            <div className="app-container">
                {/* 第一列：文件列表 */}
                <div className="file-list-panel">
                    <FileList />
                </div>

                {/* 第二列：编辑区域 */}
                <div className="editor-panel">
                    <Editor />
                </div>

                {/* 第三列：功能面板 */}
                <div className="function-panel">
                    <FunctionPanel />
                </div>
            </div>
        </div>
    );
}

export default App;
