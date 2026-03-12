import { contextBridge, ipcRenderer } from 'electron';
import type { TextFileFormat } from '../src/types';

type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';

type UpdateState = {
    status: UpdateStatus;
    currentVersion: string;
    latestVersion: string | null;
    releaseNotes: string | null;
    downloadPercent: number;
    isIgnored: boolean;
    error: string | null;
};

contextBridge.exposeInMainWorld('electronAPI', {
    openProject: (path?: string) => ipcRenderer.invoke('project:open', path),

    readFile: (fileId: string) => ipcRenderer.invoke('file:read', fileId),
    saveFile: (data: any) => ipcRenderer.invoke('file:save', data),

    onFileChange: (callback: (data: any) => void) => {
        ipcRenderer.on('file:external-change', (_event, data) => callback(data));
    },
    removeFileChangeListener: () => {
        ipcRenderer.removeAllListeners('file:external-change');
    },

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

    onSaveTrigger: (callback: () => void) => ipcRenderer.on('menu:trigger-save', () => callback()),
    onOpenProjectTrigger: (callback: () => void) => ipcRenderer.on('menu:open-project', () => callback()),
    removeMenuListeners: () => {
        ipcRenderer.removeAllListeners('menu:trigger-save');
        ipcRenderer.removeAllListeners('menu:open-project');
    },

    buildProjectIndex: (projectPath: string) => ipcRenderer.invoke('project:build-index', projectPath),

    readConfig: (projectPath: string) => ipcRenderer.invoke('config:read', projectPath),
    saveConfig: (params: { projectPath: string; config: any }) => ipcRenderer.invoke('config:save', params),

    getUpdateState: () => ipcRenderer.invoke('update:get-state'),
    checkForUpdates: (payload?: { manual?: boolean }) => ipcRenderer.invoke('update:check', payload),
    downloadUpdate: () => ipcRenderer.invoke('update:download'),
    installUpdate: () => ipcRenderer.invoke('update:install'),
    ignoreLatestUpdate: () => ipcRenderer.invoke('update:ignore-latest'),
    onUpdateState: (callback: (data: UpdateState) => void) => {
        const handler = (_event: any, data: UpdateState) => callback(data);
        ipcRenderer.on('update:state', handler);
        return () => ipcRenderer.off('update:state', handler);
    },
    onShowUpdateDialog: (callback: (payload: { reason: 'auto' | 'manual' }) => void) => {
        const handler = (_event: any, payload: { reason: 'auto' | 'manual' }) => callback(payload);
        ipcRenderer.on('update:show-dialog', handler);
        return () => ipcRenderer.off('update:show-dialog', handler);
    },
});

export interface ElectronAPI {
    openProject: (path?: string) => Promise<any>;
    readFile: (fileId: string) => Promise<any>;
    saveFile: (params: { filePath: string; content: string; format: TextFileFormat }) => Promise<{ success: boolean; error?: string; lastModified?: number }>;
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
    getUpdateState: () => Promise<UpdateState>;
    checkForUpdates: (payload?: { manual?: boolean }) => Promise<UpdateState>;
    downloadUpdate: () => Promise<UpdateState>;
    installUpdate: () => Promise<{ ok: boolean }>;
    ignoreLatestUpdate: () => Promise<UpdateState>;
    onUpdateState: (callback: (data: UpdateState) => void) => () => void;
    onShowUpdateDialog: (callback: (payload: { reason: 'auto' | 'manual' }) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
