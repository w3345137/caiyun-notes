import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Download, RefreshCw } from 'lucide-react';
import { AppUpdateState, formatBytes } from '../lib/appUpdateState';

interface AppUpdateModalProps {
  state: AppUpdateState;
  onStartUpdate: () => void;
  onDismiss: () => void;
}

const isWorkingPhase = (phase: AppUpdateState['phase']) =>
  phase === 'downloading' || phase === 'installing' || phase === 'relaunching';

const APP_RELEASE_BY_VERSION: Record<string, string> = {
  '2.5.0': 'p7',
  '2.5.1': 'p8',
};

function normalizeVersion(version?: string) {
  return version?.replace(/^v/i, '').trim();
}

function releaseLabelFromBody(body?: string) {
  const match = body?.match(/\bp\d+(?:\.\d+)?\b/i);
  return match?.[0]?.toLowerCase();
}

function releaseLabelFromVersion(version?: string) {
  const normalized = normalizeVersion(version);
  return normalized ? APP_RELEASE_BY_VERSION[normalized] : undefined;
}

function formatVersion(version?: string) {
  const normalized = normalizeVersion(version);
  return normalized ? `v${normalized}` : undefined;
}

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  state,
  onStartUpdate,
  onDismiss,
}) => {
  if (state.phase === 'idle' || state.phase === 'checking') return null;

  const update = state.update;
  const isWorking = isWorkingPhase(state.phase);
  const canDismiss = !isWorking;
  const progressWidth = state.progressPercent === null ? 34 : Math.max(4, state.progressPercent);
  const nextReleaseLabel = releaseLabelFromBody(update?.body) || releaseLabelFromVersion(update?.version);
  const currentReleaseLabel = releaseLabelFromVersion(update?.currentVersion);
  const nextVersionText = formatVersion(update?.version);
  const currentVersionText = formatVersion(update?.currentVersion);
  const releaseTitle = currentReleaseLabel && nextReleaseLabel
    ? `${currentReleaseLabel} → ${nextReleaseLabel}`
    : nextReleaseLabel || nextVersionText || '新版本';
  const versionDetail = currentVersionText && nextVersionText
    ? `客户端版本 ${currentVersionText} → ${nextVersionText}`
    : nextVersionText
      ? `客户端版本 ${nextVersionText}`
      : '客户端版本';
  const bytesText = state.totalBytes
    ? `${formatBytes(state.downloadedBytes)} / ${formatBytes(state.totalBytes)}`
    : state.downloadedBytes > 0
      ? `已下载 ${formatBytes(state.downloadedBytes)}`
      : '';

  const phaseTitle = (() => {
    if (state.phase === 'downloading') return '正在下载更新';
    if (state.phase === 'installing') return '正在安装';
    if (state.phase === 'relaunching') return '正在重启';
    if (state.phase === 'error') return '更新失败';
    return '发现新版本';
  })();

  const phaseDescription = (() => {
    if (state.phase === 'downloading') return '下载完成后会自动安装，安装完成后重启应用。';
    if (state.phase === 'installing') return '更新包已下载完成，正在安装。';
    if (state.phase === 'relaunching') return '安装完成，正在重启应用。';
    if (state.phase === 'error') return state.error || '更新过程中出现问题，可以稍后重试。';
    return '可以继续使用当前版本，也可以立即下载并安装更新。';
  })();

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] px-4">
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-title"
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${
            state.phase === 'error'
              ? 'bg-red-50 text-red-600'
              : isWorking
                ? 'bg-blue-50 text-blue-600'
                : 'bg-emerald-50 text-emerald-600'
          }`}>
            {state.phase === 'error' ? (
              <AlertTriangle className="h-5 w-5" />
            ) : isWorking ? (
              <RefreshCw className={`h-5 w-5 ${state.phase !== 'relaunching' ? 'animate-spin' : ''}`} />
            ) : (
              <Download className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="app-update-title" className="text-base font-semibold text-slate-900">
              {phaseTitle}
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              <span className="font-semibold text-slate-700">{releaseTitle}</span>
              <span className="mx-2 text-slate-300">|</span>
              {versionDetail}
            </p>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className={`text-sm leading-6 ${state.phase === 'error' ? 'text-red-600' : 'text-slate-600'}`}>
            {phaseDescription}
          </p>

          {update?.body && state.phase !== 'error' && (
            <div className="mt-3 max-h-24 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
              {update.body}
            </div>
          )}

          {isWorking && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span>{state.progressPercent === null ? '正在下载' : `${state.progressPercent}%`}</span>
                {bytesText && <span>{bytesText}</span>}
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={state.progressPercent ?? undefined}
              >
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300 ${
                    state.progressPercent === null ? 'animate-pulse' : ''
                  }`}
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
            {state.phase === 'error' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
            ) : state.phase === 'available' ? (
              <Clock className="h-4 w-4 shrink-0 text-slate-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-500" />
            )}
            <span className="truncate">
              {state.phase === 'available' ? '更新前会先确保自动同步队列完成' : '请不要关闭应用'}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
              >
                稍后
              </button>
            )}
            {(state.phase === 'available' || state.phase === 'error') && (
              <button
                type="button"
                onClick={onStartUpdate}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                立即更新
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
