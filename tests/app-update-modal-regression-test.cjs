const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const modalPath = path.join(root, 'src/components/AppUpdateModal.tsx');
const appPath = path.join(root, 'src/App.tsx');

const modalSource = fs.readFileSync(modalPath, 'utf8');
const appSource = fs.readFileSync(appPath, 'utf8');

assert.match(
  modalSource,
  /role="progressbar"/,
  'update modal should expose a progressbar while downloading',
);

assert.match(
  modalSource,
  /aria-valuenow=\{state\.progressPercent \?\? undefined\}/,
  'update modal progressbar should reflect current download percent',
);

assert.match(
  modalSource,
  /立即更新/,
  'update modal should provide an explicit update action',
);

assert.match(
  modalSource,
  /稍后/,
  'update modal should let users postpone an available update',
);

assert.match(
  modalSource,
  /正在安装/,
  'update modal should show installation status after download finishes',
);

assert.match(
  appSource,
  /<AppUpdateModal[\s\S]*onStartUpdate=\{handleStartAppUpdate\}/,
  'App should render the update modal and wire the install action',
);

assert.match(
  appSource,
  /reduceDownloadEvent/,
  'App should update modal progress from updater download events',
);

assert.doesNotMatch(
  appSource,
  /toast\(`发现新版本/,
  'App should no longer auto-download via toast-only update UX',
);

console.log('app update modal regression tests passed');
