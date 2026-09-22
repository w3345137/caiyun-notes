const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const buildStore = fs.readFileSync(path.join(root, 'scripts/build-store.mjs'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8');
const disabled = fs.readFileSync(path.join(root, 'src-tauri/src/frontend_bundle_disabled.rs'), 'utf8');
const storeConfig = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.msstore.conf.json'), 'utf8'));
const distRoot = path.join(root, 'dist');

assert.match(buildStore, /channel === 'msstore' \? 'msstore-distribution' : ''/,
  'Microsoft Store build must enable only the Store distribution identity');
assert.doesNotMatch(buildStore, /frontend-hot-update,msstore-distribution/,
  'Microsoft Store build must not compile the frontend ZIP updater');
assert.match(lib, /cfg\(not\(feature = "frontend-hot-update"\)\)/,
  'the frontend downloader must have a compile-time disabled implementation');
assert.match(disabled, /status:\s*"upToDate"/,
  'the compatibility command should be a local no-op in Store builds');
assert.doesNotMatch(disabled, /https?:|reqwest|ZipArchive|download/i,
  'the Store compatibility implementation must contain no downloader');
assert.equal(storeConfig.plugins?.updater, null,
  'Microsoft Store config must remove inherited native updater endpoints');

const forbiddenFrontendMarkers = [
  '下载 App',
  'Windows x64',
  'macOS Apple Silicon',
  'app-frontend/latest.json',
  'check_frontend_bundle_update',
  'updates/latest.json',
];
const frontendFiles = [];
const collectFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(filePath);
    else frontendFiles.push(filePath);
  }
};
collectFiles(distRoot);
for (const filePath of frontendFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const marker of forbiddenFrontendMarkers) {
    assert.equal(source.includes(marker), false,
      `Microsoft Store frontend must not contain executable download marker ${marker}: ${path.relative(root, filePath)}`);
  }
}

console.log('Microsoft Store compliance source checks passed');
