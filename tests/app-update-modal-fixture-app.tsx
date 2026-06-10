import React from 'react';
import { createRoot } from 'react-dom/client';
/* eslint-disable react-refresh/only-export-components */
import '../src/App.css';
import { AppUpdateModal } from '../src/components/AppUpdateModal';
import {
  AppUpdateState,
  createAvailableUpdateState,
  createDownloadingUpdateState,
  createErrorUpdateState,
  reduceDownloadEvent,
} from '../src/lib/appUpdateState';

declare global {
  interface Window {
    updateStartClicks?: number;
    updateDismissClicks?: number;
  }
}

const updateInfo = {
  version: '2.5.1',
  currentVersion: '2.5.0',
  body: '更新弹窗与下载进度条验证',
};

function stateFromQuery(): AppUpdateState {
  const params = new URLSearchParams(window.location.search);
  const phase = params.get('phase') || 'available';

  if (phase === 'downloading') {
    let state = createDownloadingUpdateState(updateInfo);
    state = reduceDownloadEvent(state, { event: 'Started', data: { contentLength: 1000 } });
    state = reduceDownloadEvent(state, { event: 'Progress', data: { chunkLength: 420 } });
    return state;
  }

  if (phase === 'installing') {
    let state = createDownloadingUpdateState(updateInfo);
    state = reduceDownloadEvent(state, { event: 'Started', data: { contentLength: 1000 } });
    return reduceDownloadEvent(state, { event: 'Finished' });
  }

  if (phase === 'error') {
    return createErrorUpdateState(updateInfo, '自动同步未完成，已取消更新');
  }

  return createAvailableUpdateState(updateInfo);
}

function Fixture() {
  return (
    <AppUpdateModal
      state={stateFromQuery()}
      onStartUpdate={() => {
        window.updateStartClicks = (window.updateStartClicks || 0) + 1;
      }}
      onDismiss={() => {
        window.updateDismissClicks = (window.updateDismissClicks || 0) + 1;
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
