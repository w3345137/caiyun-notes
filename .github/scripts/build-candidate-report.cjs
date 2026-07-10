#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function findExactly(files, predicate, description) {
  const matches = files.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected one ${description}, got: ${matches.map((file) => path.basename(file)).join(', ') || 'none'}`);
  }
  return matches[0];
}

function buildCandidateReport({ candidateDir, tauriConfigPath, tag }) {
  const files = fs.readdirSync(candidateDir)
    .map((name) => path.join(candidateDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
  const version = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8')).version;
  const name = (filePath) => path.basename(filePath);
  const ends = (suffix) => (filePath) => name(filePath).endsWith(suffix);
  const includes = (value) => (filePath) => name(filePath).toLowerCase().includes(value.toLowerCase());
  const and = (...predicates) => (filePath) => predicates.every((predicate) => predicate(filePath));
  const not = (predicate) => (filePath) => !predicate(filePath);

  const updater = {
    'darwin-aarch64': findExactly(files, and(includes('aarch64'), ends('.app.tar.gz')), 'macOS arm64 updater'),
    'darwin-x86_64': findExactly(files, and(ends('.app.tar.gz'), not(includes('aarch64'))), 'macOS x64 updater'),
    'windows-x86_64': findExactly(files, ends('x64-setup.exe'), 'Windows x64 updater'),
    'linux-x86_64': findExactly(files, ends('_amd64.AppImage'), 'Linux x64 updater'),
  };
  const manual = {
    'darwin-aarch64': findExactly(files, and(includes('aarch64'), ends('.dmg')), 'macOS arm64 DMG'),
    'darwin-x86_64': findExactly(files, and(ends('.dmg'), not(includes('aarch64'))), 'macOS x64 DMG'),
    'windows-x86_64': updater['windows-x86_64'],
    'linux-x86_64': findExactly(files, ends('_amd64.deb'), 'Linux x64 DEB'),
  };
  const publishUpdater = {
    'darwin-aarch64': `_${version}_aarch64.app.tar.gz`,
    'darwin-x86_64': `_${version}_x64.app.tar.gz`,
    'windows-x86_64': `_${version}_x64-setup.exe`,
    'linux-x86_64': `_${version}_amd64.AppImage`,
  };
  const publishManual = {
    'darwin-aarch64': `_${version}_aarch64.dmg`,
    'darwin-x86_64': `_${version}_x64.dmg`,
    'windows-x86_64': `_${version}_x64-setup.exe`,
    'linux-x86_64': `_${version}_amd64.deb`,
  };

  const report = { tag, version, expected_sha256: {}, updater: {}, manual: {} };
  for (const [platform, packagePath] of Object.entries(updater)) {
    const signaturePath = `${packagePath}.sig`;
    if (!fs.existsSync(signaturePath) || !fs.readFileSync(signaturePath, 'utf8').trim()) {
      throw new Error(`Missing updater signature for ${name(packagePath)}`);
    }
    report.expected_sha256[name(packagePath)] = sha256(packagePath);
    report.updater[platform] = {
      package: name(packagePath),
      signatureFile: name(signaturePath),
      publishName: publishUpdater[platform],
    };
  }
  for (const [platform, packagePath] of Object.entries(manual)) {
    report.expected_sha256[name(packagePath)] = sha256(packagePath);
    report.manual[platform] = { package: name(packagePath), publishName: publishManual[platform] };
  }
  return report;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (require.main === module) {
  const candidateDir = path.resolve(readArg('--candidate') || 'candidate');
  const tauriConfigPath = path.resolve(readArg('--tauri-config') || 'src-tauri/tauri.conf.json');
  const output = path.resolve(readArg('--output') || 'candidate-report.json');
  const tag = readArg('--tag');
  if (!tag) throw new Error('--tag is required');
  const report = buildCandidateReport({ candidateDir, tauriConfigPath, tag });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

module.exports = { buildCandidateReport };
