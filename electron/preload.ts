import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 项目管理
    openProject: (path: string) => ipcRenderer.invoke('project:open', path),

    // 文件操作
    readFile: (fileId: string) => ipcRenderer.invoke('file:read', fileId),
    saveFile: (data: any) => ipcRenderer.invoke('file:save', data),

    // 文件监控
    onFileChange: (callback: (data: any) => void) => {
        ipcRenderer.on('file:external-change', (_event, data) => callback(data));
    },

    // 移除监听器
    removeFileChangeListener: () => {
        ipcRenderer.removeAllListeners('file:external-change');
    },

    // 搜索
    searchProject: (params: any) => ipcRenderer.invoke('project:search', params),

    // 菜单事件监听
    onSaveTrigger: (callback: () => void) => ipcRenderer.on('menu:trigger-save', () => callback()),
    onOpenProjectTrigger: (callback: () => void) => ipcRenderer.on('menu:open-project', () => callback()),
    
    // 移除监听器
    removeMenuListeners: () => {
        ipcRenderer.removeAllListeners('menu:trigger-save');
        ipcRenderer.removeAllListeners('menu:open-project');
    },

    // 索引
    buildProjectIndex: (projectPath: string) => ipcRenderer.invoke('project:build-index', projectPath),
});

// 类型定义（供 TypeScript 使用）
export interface ElectronAPI {
    openProject: (path: string) => Promise<any>;
    readFile: (fileId: string) => Promise<any>;
    saveFile: (params: { filePath: string; content: string; encoding: string }) => Promise<{ success: boolean; error?: string; lastModified?: number }>;
    onFileChange: (callback: (data: any) => void) => void;
    removeFileChangeListener: () => void;
    searchProject: (params: any) => Promise<any>;
    buildProjectIndex: (projectPath: string) => Promise<Record<string, string[]>>;
    onSaveTrigger: (callback: () => void) => void;
    onOpenProjectTrigger: (callback: () => void) => void;
    removeMenuListeners: () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
