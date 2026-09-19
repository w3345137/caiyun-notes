/**
 * Microsoft Store 版构建包装器。
 *
 * Tauri 2 在编译期无条件加载 src-tauri/capabilities/ 目录下的所有权限文件，
 * 而商店版用 --no-default-features 裁剪掉 tauri-plugin-updater 后，
 * default.json 里的 "updater:default" 权限会失去来源、导致构建失败。
 *
 * 本脚本在构建期间临时从 default.json 中过滤 updater:* 权限，
 * 构建结束（无论成败）后恢复原文件，工作区不留改动。
 *
 * 用法（额外参数透传给 cargo，跟在 --no-default-features 之后）：
 *   node scripts/with-msstore-capabilities.mjs --features frontend-hot-update
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const capPath = join(root, 'src-tauri', 'capabilities', 'default.json');
const backupPath = capPath + '.msstore-backup';

const original = readFileSync(capPath, 'utf8');
const parsed = JSON.parse(original);
const removed = parsed.permissions.filter(
  (p) => typeof p === 'string' && p.startsWith('updater:')
);
parsed.permissions = parsed.permissions.filter(
  (p) => !(typeof p === 'string' && p.startsWith('updater:'))
);
parsed.description = '(msstore build) updater permissions stripped';

console.log(`[msstore] 临时移除权限: ${removed.join(', ') || '(无)'}`);

writeFileSync(backupPath, original);
writeFileSync(capPath, JSON.stringify(parsed, null, 2) + '\n');

let status = 1;
try {
  const args = [
    'tauri',
    'build',
    '--config',
    'src-tauri/tauri.msstore.conf.json',
    '--',
    '--no-default-features',
    ...process.argv.slice(2),
  ];
  const result = spawnSync('npx', args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  status = result.status ?? 1;
} finally {
  writeFileSync(capPath, readFileSync(backupPath, 'utf8'));
  unlinkSync(backupPath);
  console.log('[msstore] capabilities/default.json 已恢复');
}

process.exit(status);
