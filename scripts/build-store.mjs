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
// Store packages may only execute code reviewed and delivered by the Store.
// Keep the Microsoft distribution identity, but never compile the frontend ZIP
// updater or the native self-updater into this build.
const features = channel === 'msstore' ? 'msstore-distribution' : '';
const command = [
  'tauri', 'build', '--config', `src-tauri/tauri.${channel}.conf.json`,
  ...(noBundle >= 0 ? ['--no-bundle'] : []),
  '--', '--no-default-features',
  ...(features ? ['--features', features] : []),
  ...args,
];
const result = spawnSync('npx', command, { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
