const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const tauriConf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const cargoToml = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
const libRs = fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8');
const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/build-release.yml'), 'utf8');

const defaultCapability = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/capabilities/default.json'), 'utf8'));
const remoteCapability = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/capabilities/remote-notes.json'), 'utf8'));
const p7UpdaterPubkey = 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEMxNzI5OEQ3M0M5MjYyQzEKUldUQllwSTgxNWh5d1JKQ3p3dFJOcTNxRmdIZHBNY2F0WDJaVVczRWh5SHR1b0ZVL2Y4eVNkUEcK';

assert.equal(packageJson.version, '2.5.1', 'desktop app package version should be bumped to 2.5.1');
assert.equal(tauriConf.version, '2.5.1', 'Tauri bundle version should be bumped to 2.5.1');
assert.equal(
  tauriConf.plugins.updater.pubkey,
  p7UpdaterPubkey,
  'desktop updater public key must stay compatible with installed p7 clients',
);
assert.match(cargoToml, /^version = "2\.5\.1"/m, 'Cargo package version should be bumped to 2.5.1');
assert.match(cargoToml, /tauri-plugin-store = "2"/, 'Tauri Store plugin should be included for future local settings/cache needs');
assert.match(cargoToml, /tauri-plugin-notification = "2"/, 'Tauri Notification plugin should be included for future desktop notifications');
assert.match(libRs, /tauri_plugin_store::Builder::default\(\)\.build\(\)/, 'Tauri Store plugin should be registered in the desktop shell');
assert.match(libRs, /tauri_plugin_notification::init\(\)/, 'Tauri Notification plugin should be registered in the desktop shell');
assert.ok(packageJson.dependencies['@tauri-apps/plugin-dialog'], 'Dialog JS package should be available to remote web code');
assert.ok(packageJson.dependencies['@tauri-apps/plugin-fs'], 'Filesystem JS package should be available to remote web code');
assert.ok(packageJson.dependencies['@tauri-apps/plugin-clipboard-manager'], 'Clipboard JS package should be available to remote web code');
assert.ok(packageJson.dependencies['@tauri-apps/plugin-notification'], 'Notification JS package should be available to remote web code');
assert.match(
  releaseWorkflow,
  /TAURI_SIGNING_PRIVATE_KEY_PASSWORD:\s*\$\{\{\s*secrets\.TAURI_SIGNING_PRIVATE_KEY_PASSWORD\s*\}\}/,
  'Release workflow should pass the updater private key password when the signing key is encrypted',
);
assert.match(
  releaseWorkflow,
  /GITEE_BASE_URL="https:\/\/gitee\.com\/binbin3344\/cloudnote\/raw\/master\/updates"/,
  'Release workflow should generate update manifests whose package URLs use Gitee as the primary source',
);
assert.match(
  releaseWorkflow,
  /SERVER_BASE_URL="https:\/\/notes\.binapp\.top\/updates"/,
  'Release workflow should generate a server fallback manifest whose package URLs use the server update mirror',
);
assert.match(
  releaseWorkflow,
  /latest-server\.json/,
  'Release workflow should keep server fallback latest.json separate from the Gitee primary latest.json',
);
assert.match(
  releaseWorkflow,
  /GITEE_USERNAME:\s*\$\{\{\s*secrets\.GITEE_USERNAME\s*\}\}/,
  'Release workflow should support publishing update files to Gitee',
);
assert.match(
  releaseWorkflow,
  /git clone --depth 1 "https:\/\/\$\{GITEE_USERNAME\}:\$\{GITEE_TOKEN\}@gitee\.com\/binbin3344\/cloudnote\.git" gitee-publish/,
  'Release workflow should clone Gitee master before publishing updates to avoid non-fast-forward failures',
);
assert.match(
  releaseWorkflow,
  /git push origin HEAD:master/,
  'Release workflow should push the updates directory to the Gitee master branch used by the updater endpoint',
);

for (const [name, capability] of [['default', defaultCapability], ['remote-notes', remoteCapability]]) {
  const permissions = capability.permissions;
  for (const permission of [
    'updater:default',
    'store:default',
    'dialog:default',
    'process:default',
    'process:allow-restart',
    'process:allow-exit',
    'clipboard-manager:default',
    'clipboard-manager:allow-read-text',
    'clipboard-manager:allow-write-text',
    'clipboard-manager:allow-read-image',
    'clipboard-manager:allow-write-image',
    'clipboard-manager:allow-write-html',
    'clipboard-manager:allow-clear',
    'notification:default',
    'shell:default',
    'shell:allow-open',
  ]) {
    assert.ok(
      permissions.includes(permission),
      `${name} capability should include ${permission}`,
    );
  }

  assert.ok(
    !permissions.includes('shell:allow-execute') && !permissions.includes('shell:allow-spawn'),
    `${name} capability should not allow arbitrary command execution`,
  );

  const fsScope = permissions.find((permission) => permission.identifier === 'fs:scope');
  assert.ok(fsScope, `${name} capability should keep an explicit filesystem scope`);
  assert.deepStrictEqual(
    fsScope.allow.map((entry) => entry.path).sort(),
    ['$APPCONFIG/**', '$APPDATA/**', '$APPLOCALDATA/**'],
    `${name} capability should limit file access to app-owned directories`,
  );
}

console.log('tauri future capabilities tests passed');
