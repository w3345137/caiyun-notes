import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const channelFlag = args.indexOf('--channel');
if (channelFlag < 0 || !['msstore', 'appstore'].includes(args[channelFlag + 1])) {
  throw new Error('Usage: build-store.mjs --channel msstore|appstore [--no-bundle] [--target triple]');
}
const channel = args[channelFlag + 1];
args.splice(channelFlag, 2);
const noBundle = args.indexOf('--no-bundle');
if (noBundle >= 0) args.splice(noBundle, 1);
const noHotUpdate = args.indexOf('--no-hotupdate');
if (noHotUpdate >= 0) args.splice(noHotUpdate, 1);
const targetFlag = args.indexOf('--target');
let target = null;
if (targetFlag >= 0) {
  target = args[targetFlag + 1];
  if (!target || target.startsWith('--')) throw new Error('--target requires a target triple');
  args.splice(targetFlag, 2);
}
// Store packages never include the native installer updater. Both Store
// candidates can opt into the signed frontend bundle channel; certification
// approval must be assessed separately for each store.
const distributionFeature = `${channel}-distribution`;
const features = noHotUpdate >= 0
  ? distributionFeature
  : `${distributionFeature},frontend-hot-update`;
const command = [
  'tauri', 'build', '--config', `src-tauri/tauri.${channel}.conf.json`,
  ...(noBundle >= 0 ? ['--no-bundle'] : []),
  ...(target ? ['--target', target] : []),
  '--', '--no-default-features',
  ...(features ? ['--features', features] : []),
  ...args,
];
const result = spawnSync('npx', command, { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
