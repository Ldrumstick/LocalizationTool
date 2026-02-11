import React from 'react';
import './UpdateModal.css';

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

interface UpdateModalProps {
    open: boolean;
    state: UpdateState;
    onClose: () => void;
    onCheck: () => void;
    onDownload: () => void;
    onInstall: () => void;
    onIgnore: () => void;
}

function statusText(state: UpdateState): string {
    switch (state.status) {
    case 'checking':
        return '正在检查更新...';
    case 'available':
        return `发现新版本 ${state.latestVersion ?? ''}`.trim();
    case 'not-available':
        return '当前已是最新版本';
    case 'downloading':
        return `正在下载更新 ${state.downloadPercent.toFixed(1)}%`;
    case 'downloaded':
        return '更新已下载完成，点击立即安装';
    case 'error':
        return state.error || '更新失败';
    default:
        return '可手动检查并更新到最新版本';
    }
}

const UpdateModal: React.FC<UpdateModalProps> = ({
    open,
    state,
    onClose,
    onCheck,
    onDownload,
    onInstall,
    onIgnore,
}) => {
    if (!open) return null;

    const canDownload = state.status === 'available';
    const canInstall = state.status === 'downloaded';
    const canCheck = state.status === 'idle' || state.status === 'not-available' || state.status === 'error';
    const busy = state.status === 'checking' || state.status === 'downloading';

    return (
        <div className="update-modal-backdrop" role="presentation" onClick={onClose}>
            <div className="update-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <h3>版本更新</h3>
                <div className="update-meta">
                    <div><span>当前版本</span><strong>{state.currentVersion}</strong></div>
                    <div><span>最新版本</span><strong>{state.latestVersion || '-'}</strong></div>
                </div>
                <p className="update-status">{statusText(state)}</p>

                {state.status === 'downloading' && (
                    <div className="update-progress">
                        <div className="update-progress-bar" style={{ width: `${Math.max(0, Math.min(100, state.downloadPercent))}%` }} />
                    </div>
                )}

                {state.releaseNotes && (
                    <div className="update-notes">
                        <div className="update-notes-title">更新内容</div>
                        <pre>{state.releaseNotes}</pre>
                    </div>
                )}

                <div className="update-actions">
                    {canCheck && <button onClick={onCheck}>检查更新</button>}
                    {canDownload && <button className="primary" onClick={onDownload}>更新并安装</button>}
                    {canInstall && <button className="primary" onClick={onInstall}>立即安装</button>}
                    {state.status === 'available' && <button onClick={onIgnore}>忽略此版本</button>}
                    <button onClick={onClose} disabled={busy}>稍后</button>
                </div>
            </div>
        </div>
    );
};

export default UpdateModal;
