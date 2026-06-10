export type AppUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'relaunching'
  | 'error';

export interface AppUpdateInfo {
  version: string;
  currentVersion?: string;
  date?: string;
  body?: string;
}

export interface AppUpdateState {
  phase: AppUpdatePhase;
  update: AppUpdateInfo | null;
  downloadedBytes: number;
  totalBytes: number | null;
  progressPercent: number | null;
  error: string | null;
}

export type AppUpdaterDownloadEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

export function createIdleUpdateState(): AppUpdateState {
  return {
    phase: 'idle',
    update: null,
    downloadedBytes: 0,
    totalBytes: null,
    progressPercent: 0,
    error: null,
  };
}

export function createCheckingUpdateState(): AppUpdateState {
  return {
    ...createIdleUpdateState(),
    phase: 'checking',
  };
}

export function createAvailableUpdateState(update: AppUpdateInfo): AppUpdateState {
  return {
    phase: 'available',
    update,
    downloadedBytes: 0,
    totalBytes: null,
    progressPercent: 0,
    error: null,
  };
}

export function createDownloadingUpdateState(update: AppUpdateInfo | null): AppUpdateState {
  return {
    phase: 'downloading',
    update,
    downloadedBytes: 0,
    totalBytes: null,
    progressPercent: 0,
    error: null,
  };
}

export function createInstallingUpdateState(state: AppUpdateState): AppUpdateState {
  return {
    ...state,
    phase: 'installing',
    downloadedBytes: state.totalBytes ?? state.downloadedBytes,
    progressPercent: 100,
    error: null,
  };
}

export function createRelaunchingUpdateState(state: AppUpdateState): AppUpdateState {
  return {
    ...state,
    phase: 'relaunching',
    progressPercent: 100,
    error: null,
  };
}

export function createErrorUpdateState(update: AppUpdateInfo | null, error: string): AppUpdateState {
  return {
    phase: 'error',
    update,
    downloadedBytes: 0,
    totalBytes: null,
    progressPercent: 0,
    error,
  };
}

export function reduceDownloadEvent(state: AppUpdateState, event: AppUpdaterDownloadEvent): AppUpdateState {
  if (event.event === 'Started') {
    const totalBytes = typeof event.data.contentLength === 'number' && event.data.contentLength > 0
      ? event.data.contentLength
      : null;
    return {
      ...state,
      phase: 'downloading',
      downloadedBytes: 0,
      totalBytes,
      progressPercent: totalBytes ? 0 : null,
      error: null,
    };
  }

  if (event.event === 'Progress') {
    const downloadedBytes = Math.max(0, state.downloadedBytes + Math.max(0, event.data.chunkLength || 0));
    const clampedDownloadedBytes = state.totalBytes ? Math.min(downloadedBytes, state.totalBytes) : downloadedBytes;
    const progressPercent = state.totalBytes
      ? Math.min(99, Math.floor((clampedDownloadedBytes / state.totalBytes) * 100))
      : null;

    return {
      ...state,
      phase: 'downloading',
      downloadedBytes: clampedDownloadedBytes,
      progressPercent,
      error: null,
    };
  }

  return createInstallingUpdateState(state);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const displayValue = value >= 10 || unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${displayValue} ${units[unitIndex]}`;
}
