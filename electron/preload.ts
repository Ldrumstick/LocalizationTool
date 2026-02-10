import { contextBridge, ipcRenderer } from 'electron';

// 鏆撮湶瀹夊叏鐨?API 缁欐覆鏌撹繘绋?
contextBridge.exposeInMainWorld('electronAPI', {
    // 椤圭洰绠＄悊
    openProject: (path: string) => ipcRenderer.invoke('project:open', path),

    // 鏂囦欢鎿嶄綔
    readFile: (fileId: string) => ipcRenderer.invoke('file:read', fileId),
    saveFile: (data: any) => ipcRenderer.invoke('file:save', data),

    // 鏂囦欢鐩戞帶
    onFileChange: (callback: (data: any) => void) => {
        ipcRenderer.on('file:external-change', (_event, data) => callback(data));
    },

    // 绉婚櫎鐩戝惉鍣?
    removeFileChangeListener: () => {
        ipcRenderer.removeAllListeners('file:external-change');
    },

    // 鎼滅储
    searchProject: (params: any) => ipcRenderer.invoke('project:search', params),
    searchProjectStreamStart: (params: any) => ipcRenderer.send('project:search-stream:start', params),
    searchProjectStreamCancel: (requestId: string) => ipcRenderer.send('project:search-stream:cancel', { requestId }),
    onSearchProjectChunk: (callback: (data: any) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('project:search-stream:chunk', handler);
        return () => ipcRenderer.off('project:search-stream:chunk', handler);
    },
    onSearchProjectDone: (callback: (data: any) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('project:search-stream:done', handler);
        return () => ipcRenderer.off('project:search-stream:done', handler);
    },

    // 鑿滃崟浜嬩欢鐩戝惉
    onSaveTrigger: (callback: () => void) => ipcRenderer.on('menu:trigger-save', () => callback()),
    onOpenProjectTrigger: (callback: () => void) => ipcRenderer.on('menu:open-project', () => callback()),
    
    // 绉婚櫎鐩戝惉鍣?
    removeMenuListeners: () => {
        ipcRenderer.removeAllListeners('menu:trigger-save');
        ipcRenderer.removeAllListeners('menu:open-project');
    },

    // 绱㈠紩
    buildProjectIndex: (projectPath: string) => ipcRenderer.invoke('project:build-index', projectPath),

    // 閰嶇疆绠＄悊
    readConfig: (projectPath: string) => ipcRenderer.invoke('config:read', projectPath),
    saveConfig: (params: { projectPath: string; config: any }) => ipcRenderer.invoke('config:save', params),
});

// 绫诲瀷瀹氫箟锛堜緵 TypeScript 浣跨敤锛?
export interface ElectronAPI {
    openProject: (path: string) => Promise<any>;
    readFile: (fileId: string) => Promise<any>;
    saveFile: (params: { filePath: string; content: string; encoding: string }) => Promise<{ success: boolean; error?: string; lastModified?: number }>;
    onFileChange: (callback: (data: any) => void) => void;
    removeFileChangeListener: () => void;
    searchProject: (params: any) => Promise<any>;
    searchProjectStreamStart: (params: any) => void;
    searchProjectStreamCancel: (requestId: string) => void;
    onSearchProjectChunk: (callback: (data: any) => void) => () => void;
    onSearchProjectDone: (callback: (data: any) => void) => () => void;
    buildProjectIndex: (projectPath: string) => Promise<Record<string, string[]>>;
    onSaveTrigger: (callback: () => void) => void;
    onOpenProjectTrigger: (callback: () => void) => void;
    removeMenuListeners: () => void;
    readConfig: (projectPath: string) => Promise<any>;
    saveConfig: (params: { projectPath: string; config: any }) => Promise<{ success: boolean }>;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

