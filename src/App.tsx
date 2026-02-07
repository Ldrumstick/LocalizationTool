import { useEffect } from 'react';
import { useHistoryStore } from './stores/history-store';
import FileList from './components/FileList/FileList';
import Editor from './components/Editor/Editor';
import FunctionPanel from './components/FunctionPanel/FunctionPanel';
import FileMonitor from './components/FileMonitor/FileMonitor';
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

    // 全局快捷键监听 (Undo/Redo)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 如果是在输入框或编辑器中，交由原生/组件处理
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            // Undo: Ctrl+Z / Cmd+Z
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                useHistoryStore.getState().undo();
            }

            // Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y
            if (
                ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) ||
                ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
            ) {
                e.preventDefault();
                useHistoryStore.getState().redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
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
            <FileMonitor />
        </div>
    );
}

export default App;
