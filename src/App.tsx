import { useEffect, useRef, useState } from 'react';
import { useHistoryStore } from './stores/history-store';
import { useEditorStore } from './stores/editor-store';
import FileList from './components/FileList/FileList';
import Editor from './components/Editor/Editor';
import FunctionPanel from './components/FunctionPanel/FunctionPanel';
import FileMonitor from './components/FileMonitor/FileMonitor';
import UpdateModal, { UpdateState } from './components/UpdateModal/UpdateModal';
import { useAutoSave } from './hooks/use-auto-save';
import { fileService } from './services/file-service';
import { hasModKey, isEditableTarget, registerShortcut, runShortcutRules, ShortcutPriority } from './services/shortcut-service';
import './App.css';

function App() {
    useAutoSave(30000);
    const hasRestoredProjectRef = useRef(false);
    const setActiveTab = useEditorStore((state) => state.setActiveTab);

    const [activeWorkspacePanel, setActiveWorkspacePanel] = useState<'files' | 'search' | 'validation'>('files');
    const [isWorkspaceCollapsed, setIsWorkspaceCollapsed] = useState(false);
    const [updateModalOpen, setUpdateModalOpen] = useState(false);
    const [updateState, setUpdateState] = useState<UpdateState>({
        status: 'idle',
        currentVersion: '0.0.0',
        latestVersion: null,
        releaseNotes: null,
        downloadPercent: 0,
        isIgnored: false,
        error: null,
    });

    useEffect(() => {
        if (hasRestoredProjectRef.current) {
            return;
        }
        hasRestoredProjectRef.current = true;
        void fileService.reopenLastProject();
    }, []);

    useEffect(() => {
        window.electronAPI.onSaveTrigger(async () => {
            try {
                await fileService.saveAllDirtyFiles({ flushActiveEdit: true });
            } catch (err) {
                console.error('保存失败', err);
            }
        });

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

    useEffect(() => {
        let removeStateListener: (() => void) | undefined;
        let removeDialogListener: (() => void) | undefined;

        const bootstrap = async () => {
            try {
                const current = await window.electronAPI.getUpdateState();
                setUpdateState(current);
            } catch (error) {
                console.error('获取更新状态失败', error);
            }

            removeStateListener = window.electronAPI.onUpdateState((nextState) => {
                setUpdateState(nextState);
            });
            removeDialogListener = window.electronAPI.onShowUpdateDialog(() => {
                setUpdateModalOpen(true);
            });
        };

        void bootstrap();

        return () => {
            removeStateListener?.();
            removeDialogListener?.();
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (runShortcutRules(e, [
                {
                    match: (ev) => hasModKey(ev) && ev.key.toLowerCase() === 'f',
                    run: (ev) => {
                        ev.preventDefault();
                        window.dispatchEvent(new CustomEvent('shortcut:focus-search'));
                    }
                },
                {
                    match: (ev) => hasModKey(ev) && ev.key.toLowerCase() === 'h',
                    run: (ev) => {
                        ev.preventDefault();
                        window.dispatchEvent(new CustomEvent('shortcut:focus-replace'));
                    }
                }
            ])) return true;

            if (isEditableTarget(e.target)) return false;

            return runShortcutRules(e, [
                {
                    match: (ev) => hasModKey(ev) && ev.key.toLowerCase() === 'b',
                    run: (ev) => {
                        ev.preventDefault();
                        setIsWorkspaceCollapsed((value) => !value);
                    }
                },
                {
                    match: (ev) => hasModKey(ev) && ev.key.toLowerCase() === 'z' && !ev.shiftKey,
                    run: (ev) => {
                        ev.preventDefault();
                        useHistoryStore.getState().undo();
                    }
                },
                {
                    match: (ev) => (hasModKey(ev) && ev.key.toLowerCase() === 'z' && ev.shiftKey) || (hasModKey(ev) && ev.key.toLowerCase() === 'y'),
                    run: (ev) => {
                        ev.preventDefault();
                        useHistoryStore.getState().redo();
                    }
                }
            ]);
        };

        return registerShortcut(handleKeyDown, { priority: ShortcutPriority.app });
    }, []);

    const openWorkspacePanel = (panel: 'files' | 'search' | 'validation') => {
        if (!isWorkspaceCollapsed && activeWorkspacePanel === panel) {
            setIsWorkspaceCollapsed(true);
            return;
        }

        setActiveWorkspacePanel(panel);
        if (panel === 'search' || panel === 'validation') {
            setActiveTab(panel);
        }
        setIsWorkspaceCollapsed(false);
    };

    const handleCheckUpdate = async () => {
        try {
            await window.electronAPI.checkForUpdates({ manual: true });
        } catch (error) {
            console.error('检查更新失败', error);
        }
    };

    const handleDownloadUpdate = async () => {
        try {
            await window.electronAPI.downloadUpdate();
        } catch (error) {
            console.error('下载更新失败', error);
        }
    };

    const handleInstallUpdate = async () => {
        try {
            await window.electronAPI.installUpdate();
        } catch (error) {
            console.error('安装更新失败', error);
        }
    };

    const handleIgnoreUpdate = async () => {
        try {
            await window.electronAPI.ignoreLatestUpdate();
            setUpdateModalOpen(false);
        } catch (error) {
            console.error('忽略版本失败', error);
        }
    };

    return (
        <div className="app">
            <div className={`app-container ${isWorkspaceCollapsed ? 'workspace-collapsed' : ''}`}>
                <aside className="workspace-panel" aria-label="左侧工作面板">
                    <div className="workspace-icon-rail" aria-label="工作面板快捷入口">
                        <button
                            type="button"
                            className={`workspace-icon-button ${activeWorkspacePanel === 'files' ? 'active' : ''}`}
                            onClick={() => openWorkspacePanel('files')}
                            title="项目文件"
                            aria-label="项目文件"
                        >
                            <span aria-hidden="true">📄</span>
                        </button>
                        <button
                            type="button"
                            className={`workspace-icon-button ${activeWorkspacePanel === 'search' ? 'active' : ''}`}
                            onClick={() => openWorkspacePanel('search')}
                            title="查找"
                            aria-label="查找"
                        >
                            <span aria-hidden="true">🔍</span>
                        </button>
                        <button
                            type="button"
                            className={`workspace-icon-button ${activeWorkspacePanel === 'validation' ? 'active' : ''}`}
                            onClick={() => openWorkspacePanel('validation')}
                            title="校验"
                            aria-label="校验"
                        >
                            <span aria-hidden="true">✓</span>
                        </button>
                        <button
                            type="button"
                            className="workspace-icon-button workspace-toggle-button"
                            onClick={() => setIsWorkspaceCollapsed((value) => !value)}
                            title={isWorkspaceCollapsed ? '展开左侧面板 (Ctrl+B)' : '折叠左侧面板 (Ctrl+B)'}
                            aria-label={isWorkspaceCollapsed ? '展开左侧面板' : '折叠左侧面板'}
                        >
                            <span aria-hidden="true">{isWorkspaceCollapsed ? '›' : '‹'}</span>
                        </button>
                    </div>

                    <div className="workspace-content" aria-hidden={isWorkspaceCollapsed}>
                        <div className="workspace-section">
                            {activeWorkspacePanel === 'files' ? (
                                <FileList />
                            ) : (
                                <FunctionPanel showTabs={false} />
                            )}
                        </div>
                    </div>
                </aside>

                <div className="editor-panel">
                    <Editor />
                </div>
            </div>
            <FileMonitor />
            <UpdateModal
                open={updateModalOpen}
                state={updateState}
                onClose={() => setUpdateModalOpen(false)}
                onCheck={handleCheckUpdate}
                onDownload={handleDownloadUpdate}
                onInstall={handleInstallUpdate}
                onIgnore={handleIgnoreUpdate}
            />
        </div>
    );
}

export default App;
