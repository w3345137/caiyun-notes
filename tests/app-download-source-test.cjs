const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sidebar = fs.readFileSync(path.join(root, 'src/components/Sidebar.tsx'), 'utf8');
const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/build-release.yml'), 'utf8');

assert.ok(
  !sidebar.includes('pan.baidu.com') && !sidebar.includes('提取码'),
  'App download modal should not point users to the old Baidu Netdisk package',
);
assert.match(
  sidebar,
  /https:\/\/gitee\.com\/binbin3344\/cloudnote\/tree\/master\/updates/,
  'App download modal should point users to the Gitee updates directory',
);
assert.match(
  releaseWorkflow,
  /GITEE_BASE_URL="https:\/\/gitee\.com\/binbin3344\/cloudnote\/raw\/master\/updates"/,
  'Release workflow should generate the primary update manifest with Gitee package URLs',
);
assert.match(
  releaseWorkflow,
  /SERVER_BASE_URL="https:\/\/notes\.binapp\.top\/updates"/,
  'Release workflow should generate the server fallback manifest with server package URLs',
);
assert.match(
  releaseWorkflow,
  /latest-server\.json/,
  'Release workflow should keep a separate server fallback latest manifest',
);

console.log('app download source tests passed');
