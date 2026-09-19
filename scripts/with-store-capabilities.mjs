/**
 * 商店版构建包装器（Microsoft Store / Mac App Store 等商店渠道通用）。
 *
 * Tauri 2 在编译期无条件加载 src-tauri/capabilities/ 目录下的所有权限文件，
 * 而商店版用 --no-default-features 裁剪掉 tauri-plugin-updater 后，
 * default.json 里的 "updater:default" 权限会失去来源、导致构建失败。
 *
 * 本脚本在构建期间临时从 default.json 中过滤 updater:* 权限，
 * 构建结束（无论成败）后恢复原文件，工作区不留改动。
 *
 * 用法（额外参数透传给 cargo，跟在 --no-default-features 之后）：
 *   node scripts/with-store-capabilities.mjs [--config <配置叠加层>] [--features frontend-hot-update]
 * 不传 --config 时默认 src-tauri/tauri.msstore.conf.json（Microsoft Store）；
 * Mac App Store 版传 --config src-tauri/tauri.appstore.conf.json。
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const capPath = join(root, 'src-tauri', 'capabilities', 'default.json');
const backupPath = capPath + '.store-backup';

// 从透传参数中提取 --config <path>，其余参数原样传给 cargo
const passthrough = process.argv.slice(2);
let configPath = 'src-tauri/tauri.msstore.conf.json';
const configIndex = passthrough.indexOf('--config');
if (configIndex !== -1) {
  configPath = passthrough[configIndex + 1];
  passthrough.splice(configIndex, 2);
}
const tag = basename(configPath).match(/^tauri\.(\w+)\.conf\.json$/)?.[1] ?? 'store';

const original = readFileSync(capPath, 'utf8');
const parsed = JSON.parse(original);
const removed = parsed.permissions.filter(
  (p) => typeof p === 'string' && p.startsWith('updater:')
);
parsed.permissions = parsed.permissions.filter(
  (p) => !(typeof p === 'string' && p.startsWith('updater:'))
);
parsed.description = `(${tag} build) updater permissions stripped`;

console.log(`[${tag}] 临时移除权限: ${removed.join(', ') || '(无)'}`);

writeFileSync(backupPath, original);
writeFileSync(capPath, JSON.stringify(parsed, null, 2) + '\n');

let status = 1;
try {
  const args = [
    'tauri',
    'build',
    '--config',
    configPath,
    '--',
    '--no-default-features',
    ...passthrough,
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
  console.log(`[${tag}] capabilities/default.json 已恢复`);
}

process.exit(status);
