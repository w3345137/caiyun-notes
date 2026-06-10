const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/extensions/FolderBlock.tsx'), 'utf8');

assert(
  !source.includes('window.prompt('),
  'folder attachment rename must use an in-app modal instead of window.prompt for Tauri compatibility',
);

assert(
  source.includes('重命名文件') && source.includes('不允许修改扩展名'),
  'folder attachment rename UI should explain the no-extension-change rule',
);

console.log('folder rename UI tests passed');
