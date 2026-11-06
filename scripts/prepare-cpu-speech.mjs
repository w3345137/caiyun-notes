import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function prepareCpuSpeech(target) {
  if (!['x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc', 'x86_64-apple-darwin', 'aarch64-apple-darwin'].includes(target)) {
    throw new Error(`Unsupported speech runtime target: ${target}`);
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const directory = path.join(root, 'src-tauri/speech-cpu');
  const windows = target.includes('windows');
  const env = { ...process.env };
  if (windows) env.RUSTFLAGS = `${env.RUSTFLAGS || ''} -C target-feature=+crt-static`.trim();
  execFileSync('cargo', ['build', '--locked', '--release', '--target', target], { cwd: directory, stdio: 'inherit', env });
  const suffix = windows ? '.exe' : '';
  const binary = path.join(directory, 'target', target, 'release', `CaiyunQwenCpu${suffix}`);
  const stage = path.join(root, 'src-tauri/target/speech-cpu-stage', target);
  mkdirSync(stage, { recursive: true });
  cpSync(binary, path.join(stage, `CaiyunQwenCpu-${target}${suffix}`));

  // Keep third-party notices with the actual pinned dependency graph.
  const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1'], { cwd: directory, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
  const notices = metadata.packages.map(pkg => {
    const packageRoot = path.dirname(pkg.manifest_path);
    const licenses = readdirSync(packageRoot).filter(name => /^(licen[cs]e|copying|notice)s?([._-].*)?$/i.test(name));
    return `${pkg.name} ${pkg.version} (${pkg.license || 'see upstream'})\n${pkg.repository || ''}\n`
      + licenses.map(name => {
        try { return `${name}\n${readFileSync(path.join(packageRoot, name), 'utf8')}`; }
        catch {
          try { return readdirSync(path.join(packageRoot, name)).map(file => `${name}/${file}\n${readFileSync(path.join(packageRoot, name, file), 'utf8')}`).join('\n'); }
          catch { return ''; }
        }
      }).join('\n');
  }).join('\n\n---\n\n');
  const notice = path.join(stage, 'SpeechCpuThirdPartyNotices.txt');
  writeFileSync(notice, notices);
  return { binary, externalBin: path.join(stage, 'CaiyunQwenCpu'), resources: { [notice]: 'SpeechCpuThirdPartyNotices.txt' } };
}
