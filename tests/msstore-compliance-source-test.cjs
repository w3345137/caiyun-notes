const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const buildStore = fs.readFileSync(path.join(root, 'scripts/build-store.mjs'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8');
const disabled = fs.readFileSync(path.join(root, 'src-tauri/src/frontend_bundle_disabled.rs'), 'utf8');
const storeConfig = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.msstore.conf.json'), 'utf8'));
const distRoot = process.env.MSSTORE_FRONTEND_DIST || null;

assert.match(buildStore, /distributionFeature = `\$\{channel\}-distribution`/,
  'Microsoft Store build must retain its Store distribution identity');
assert.match(buildStore, /`\$\{distributionFeature\},frontend-hot-update`/,
  'Microsoft Store build must include the signed frontend bundle channel by default');
assert.match(lib, /cfg\(not\(feature = "frontend-hot-update"\)\)/,
  'the frontend downloader must have a compile-time disabled implementation');
assert.match(disabled, /status:\s*"upToDate"/,
  'the compatibility command should be a local no-op in Store builds');
assert.doesNotMatch(disabled, /https?:|reqwest|ZipArchive|download/i,
  'the Store compatibility implementation must contain no downloader');
assert.equal(storeConfig.plugins?.updater, null,
  'Microsoft Store config must remove inherited native updater endpoints');
assert.match(lib, /on_web_resource_request/, 'signed frontend resources must use the native response override');
assert.match(lib, /#\[cfg\(any\(target_os = "macos", target_os = "windows"\)\)\][\s\S]*?api\.prevent_close\(\);\s*let _ = window\.hide\(\)/,
  'closing the Windows main window must hide it without terminating the app');
assert.match(lib, /fn install_windows_tray[\s\S]*?"show" => show_main_window\(app\)/,
  'Windows must provide a tray action to reopen the hidden main window');
assert.match(lib, /tauri_plugin_single_instance::init\(\|app,[\s\S]*?show_main_window\(app\)/,
  'launching the app a second time must reopen the existing main window');

const forbiddenFrontendMarkers = [
  '下载 App',
  'Windows x64',
  'macOS Apple Silicon',
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
if (distRoot) {
  assert.ok(fs.existsSync(distRoot), 'explicit Microsoft Store frontend artifact is missing');
  collectFiles(distRoot);
  assert.ok(frontendFiles.length > 0, 'explicit Microsoft Store frontend artifact is empty');
  assert.ok(frontendFiles.some((filePath) => fs.readFileSync(filePath, 'utf8').includes('cloudnotes_bin@126.com')),
    'bundled public support page must include the customer-service address');
}
for (const filePath of frontendFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const marker of forbiddenFrontendMarkers) {
    assert.equal(source.includes(marker), false,
      `Microsoft Store frontend must not contain executable download marker ${marker}: ${path.relative(root, filePath)}`);
  }
}

console.log(`Microsoft Store compliance source checks passed${distRoot ? ' (artifact scanned)' : ' (artifact scan requires MSSTORE_FRONTEND_DIST)'}`);
