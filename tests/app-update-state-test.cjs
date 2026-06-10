const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/lib/appUpdateState.ts');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-app-update-state-'));

execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  [
    source,
    '--target',
    'ES2020',
    '--module',
    'CommonJS',
    '--outDir',
    outDir,
    '--skipLibCheck',
    '--esModuleInterop',
  ],
  { stdio: 'inherit' },
);

const {
  createIdleUpdateState,
  createAvailableUpdateState,
  createDownloadingUpdateState,
  createErrorUpdateState,
  reduceDownloadEvent,
  formatBytes,
} = require(path.join(outDir, 'appUpdateState.js'));

const available = createAvailableUpdateState({
  version: '2.5.1',
  currentVersion: '2.5.0',
  date: '2026-06-10T08:00:00Z',
  body: '修复更新体验',
});

assert.equal(available.phase, 'available');
assert.equal(available.update.version, '2.5.1');
assert.equal(available.progressPercent, 0);

let state = createDownloadingUpdateState(available.update);
state = reduceDownloadEvent(state, { event: 'Started', data: { contentLength: 1000 } });
assert.equal(state.phase, 'downloading');
assert.equal(state.totalBytes, 1000);
assert.equal(state.downloadedBytes, 0);
assert.equal(state.progressPercent, 0);

state = reduceDownloadEvent(state, { event: 'Progress', data: { chunkLength: 250 } });
assert.equal(state.downloadedBytes, 250);
assert.equal(state.progressPercent, 25);

state = reduceDownloadEvent(state, { event: 'Progress', data: { chunkLength: 900 } });
assert.equal(state.downloadedBytes, 1000);
assert.equal(state.progressPercent, 99, 'downloading state should stay below 100 until the plugin emits Finished');

state = reduceDownloadEvent(state, { event: 'Finished' });
assert.equal(state.phase, 'installing');
assert.equal(state.progressPercent, 100);
assert.equal(state.downloadedBytes, 1000);

const unknownLength = reduceDownloadEvent(
  createDownloadingUpdateState(available.update),
  { event: 'Progress', data: { chunkLength: 2048 } },
);
assert.equal(unknownLength.totalBytes, null);
assert.equal(unknownLength.downloadedBytes, 2048);
assert.equal(unknownLength.progressPercent, null);

const error = createErrorUpdateState(available.update, '自动同步未完成，已取消更新');
assert.equal(error.phase, 'error');
assert.equal(error.error, '自动同步未完成，已取消更新');
assert.equal(error.update.version, '2.5.1');

assert.equal(createIdleUpdateState().phase, 'idle');
assert.equal(formatBytes(0), '0 B');
assert.equal(formatBytes(1024), '1 KB');
assert.equal(formatBytes(1024 * 1024 * 5.5), '5.5 MB');

console.log('app update state tests passed');
