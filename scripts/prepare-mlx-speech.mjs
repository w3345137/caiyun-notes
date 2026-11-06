import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function prepareMlxSpeech() {
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Local Qwen builds require an Apple silicon Mac.');
}

const root = fileURLToPath(new URL('..', import.meta.url));
const packageDirectory = path.join(root, 'src-tauri', 'speech-sidecar');
const buildDirectory = path.resolve(process.env.CAIYUN_QWEN_BUILD_DIR || path.join(root, 'src-tauri', 'target', 'qwen-sidecar'));
const productDirectory = path.join(buildDirectory, 'Build', 'Products', 'Release');
execFileSync('xcodebuild', [
  '-scmProvider', 'system', '-scheme', 'CaiyunQwen',
  '-configuration', 'Release', '-destination', 'platform=macOS,arch=arm64',
  '-derivedDataPath', buildDirectory, 'CODE_SIGNING_ALLOWED=NO', 'build',
], { cwd: packageDirectory, stdio: 'inherit' });

const stage = path.join(buildDirectory, 'stage');
mkdirSync(stage, { recursive: true });
cpSync(realpathSync(path.join(productDirectory, 'CaiyunQwen')), path.join(stage, 'CaiyunQwen-aarch64-apple-darwin'));
const resources = Object.fromEntries(readdirSync(productDirectory)
  .filter(name => name.endsWith('.bundle') || name.endsWith('.metallib'))
  .map(name => [path.join(productDirectory, name), name]));
const checkouts = path.join(buildDirectory, 'SourcePackages', 'checkouts');
const notices = [];
for (const checkout of readdirSync(checkouts)) {
  const directory = path.join(checkouts, checkout);
  for (const file of readdirSync(directory).filter(name => /^(license|notice)(\..*)?$/i.test(name))) {
    notices.push(`
--- ${checkout}/${file} ---

${readFileSync(path.join(directory, file), 'utf8')}`);
  }
}
const noticePath = path.join(stage, 'SpeechThirdPartyNotices.txt');
writeFileSync(noticePath, notices.join('\n'));
resources[noticePath] = 'SpeechThirdPartyNotices.txt';

return { externalBin: [path.join(stage, 'CaiyunQwen')], resources, macOS: { minimumSystemVersion: '14.0' } };
}
