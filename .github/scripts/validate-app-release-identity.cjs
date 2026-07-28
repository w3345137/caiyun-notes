#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

function releaseLabelFromVersion(version) {
  const normalized = String(version || '').trim().replace(/^v/i, '').split('-')[0];
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (major === 10 && minor === 0 && patch === 0) return 'p10';
  if (major === 10 && minor === 1 && patch === 0) return 'p11';
  if (major === 10 && minor === 2) return `p${12 + patch}`;
  return null;
}

function validateReleaseIdentity({
  root = process.cwd(),
  expectedLabel = process.env.NOTES_EXPECT_RELEASE_LABEL,
} = {}) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const distManifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/app-dist-manifest.json'), 'utf8'));
  const releaseReadmePath = fs.existsSync(path.join(root, 'scripts/app-shell-public-README.md'))
    ? path.join(root, 'scripts/app-shell-public-README.md')
    : path.join(root, 'README.md');
  const readme = fs.readFileSync(releaseReadmePath, 'utf8');
  const versions = [
    String(packageJson.version || ''),
    String(tauriConfig.version || ''),
    String(distManifest.appVersion || ''),
  ];
  if (new Set(versions).size !== 1) {
    throw new Error(`release versions disagree: ${versions.join(', ')}`);
  }
  const releaseLabel = releaseLabelFromVersion(versions[0]);
  if (!releaseLabel) {
    throw new Error(`unregistered App version line: ${versions[0]}`);
  }
  const normalizedExpected = String(expectedLabel || '').trim().toLowerCase();
  if (!/^p\d+$/.test(normalizedExpected)) {
    throw new Error(`invalid release tag: ${expectedLabel || 'missing'}`);
  }
  if (releaseLabel !== normalizedExpected) {
    throw new Error(`release tag ${normalizedExpected} does not match ${versions[0]} (${releaseLabel})`);
  }
  if (!readme.includes(`桌面发布标签：\`${releaseLabel}\``)) {
    throw new Error(`README is missing release label ${releaseLabel}`);
  }
  if (!readme.includes(`Tauri SemVer：\`${versions[0]}\``)) {
    throw new Error(`README is missing App version ${versions[0]}`);
  }
  return { version: versions[0], releaseLabel };
}

if (require.main === module) {
  const result = validateReleaseIdentity();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

module.exports = {
  releaseLabelFromVersion,
  validateReleaseIdentity,
};
