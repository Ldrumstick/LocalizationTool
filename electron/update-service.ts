import { app, ipcMain } from 'electron';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion: string | null;
  releaseNotes: string | null;
  downloadPercent: number;
  isIgnored: boolean;
  error: string | null;
};

type UpdateDialogReason = 'auto' | 'manual';

type WindowGetter = () => Electron.BrowserWindow | null;

type UpdateStoreSchema = {
  ignoredVersion?: string;
};

const updateStore = new Store<UpdateStoreSchema>({
  name: 'updater-preferences',
});

let getMainWindow: WindowGetter = () => null;
let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseNotes: null,
  downloadPercent: 0,
  isIgnored: false,
  error: null,
};

let initialized = false;
let installAfterDownload = false;

function normalizeReleaseNotes(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const merged = raw
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'note' in item) {
          const note = (item as { note?: unknown }).note;
          return typeof note === 'string' ? note : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
    return merged || null;
  }
  return null;
}

function currentIgnoredVersion(): string | null {
  return updateStore.get('ignoredVersion') || null;
}

function isVersionIgnored(version: string | null): boolean {
  if (!version) return false;
  return version === currentIgnoredVersion();
}

function sendToRenderer(channel: string, payload?: unknown): void {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function setState(patch: Partial<UpdateState>): void {
  state = {
    ...state,
    ...patch,
    currentVersion: app.getVersion(),
  };
  sendToRenderer('update:state', state);
}

function showUpdateDialog(reason: UpdateDialogReason): void {
  sendToRenderer('update:show-dialog', { reason });
}

function ensureUpdaterAvailable(manual: boolean): boolean {
  if (app.isPackaged) return true;
  const message = '自动更新仅在打包后的应用中可用';
  setState({
    status: 'error',
    error: message,
  });
  if (manual) {
    showUpdateDialog('manual');
  }
  return false;
}

export async function checkForUpdates(manual = false): Promise<UpdateState> {
  if (!ensureUpdaterAvailable(manual)) {
    return state;
  }
  setState({
    status: 'checking',
    error: null,
    downloadPercent: 0,
  });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : '检查更新失败';
    setState({
      status: 'error',
      error: message,
    });
    if (manual) {
      showUpdateDialog('manual');
    }
  }
  return state;
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!ensureUpdaterAvailable(true)) {
    return state;
  }
  try {
    installAfterDownload = true;
    setState({
      status: 'downloading',
      error: null,
    });
    await autoUpdater.downloadUpdate();
  } catch (error) {
    installAfterDownload = false;
    const message = error instanceof Error ? error.message : '下载更新失败';
    setState({
      status: 'error',
      error: message,
    });
  }
  return state;
}

export function installUpdate(): void {
  if (!app.isPackaged) return;
  installAfterDownload = false;
  autoUpdater.quitAndInstall();
}

export function ignoreCurrentLatestVersion(): UpdateState {
  if (state.latestVersion) {
    updateStore.set('ignoredVersion', state.latestVersion);
    setState({
      isIgnored: true,
    });
  }
  return state;
}

export function getUpdateState(): UpdateState {
  return state;
}

function bindUpdaterEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    setState({
      status: 'checking',
      error: null,
    });
  });

  autoUpdater.on('update-available', (info) => {
    const latestVersion = info.version || null;
    const ignored = isVersionIgnored(latestVersion);
    setState({
      status: 'available',
      latestVersion,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      downloadPercent: 0,
      isIgnored: ignored,
      error: null,
    });
    if (!ignored) {
      showUpdateDialog('auto');
    }
  });

  autoUpdater.on('update-not-available', () => {
    setState({
      status: 'not-available',
      latestVersion: null,
      releaseNotes: null,
      downloadPercent: 0,
      isIgnored: false,
      error: null,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    setState({
      status: 'downloading',
      downloadPercent: Number(progress.percent.toFixed(2)),
      error: null,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    setState({
      status: 'downloaded',
      downloadPercent: 100,
      error: null,
    });
    if (installAfterDownload) {
      installUpdate();
      return;
    }
    showUpdateDialog('auto');
  });

  autoUpdater.on('error', (error) => {
    const message = error?.message || '更新服务出现错误';
    setState({
      status: 'error',
      error: message,
    });
  });
}

function registerUpdaterIpcHandlers(): void {
  ipcMain.handle('update:get-state', () => getUpdateState());
  ipcMain.handle('update:check', async (_event, payload?: { manual?: boolean }) => {
    return checkForUpdates(Boolean(payload?.manual));
  });
  ipcMain.handle('update:download', async () => downloadUpdate());
  ipcMain.handle('update:install', () => {
    installUpdate();
    return { ok: true };
  });
  ipcMain.handle('update:ignore-latest', () => ignoreCurrentLatestVersion());
}

export function initializeUpdateService(windowGetter: WindowGetter): void {
  getMainWindow = windowGetter;
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  bindUpdaterEvents();
  registerUpdaterIpcHandlers();
}
