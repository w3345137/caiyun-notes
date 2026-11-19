#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MANIFEST_NAME = 'app-dist-manifest.json';

function listFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return listFiles(path.join(directory, entry.name), relative);
      return relative === MANIFEST_NAME ? [] : [relative];
    })
    .sort();
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeEntryAsset(value) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) {
    throw new Error(`App entry cannot reference an external asset: ${value}`);
  }
  const clean = value.split(/[?#]/, 1)[0].replace(/^\.\//, '').replace(/^\//, '');
  if (!clean || clean.includes('..') || path.isAbsolute(clean)) throw new Error(`Invalid app entry asset: ${value}`);
  return clean;
}

function readEntryAssets(indexHtml) {
  if (/placeholder|open the server app|loading remote/i.test(indexHtml)) {
    throw new Error('App dist contains a placeholder entry');
  }
  const moduleScripts = Array.from(indexHtml.matchAll(/<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi));
  if (moduleScripts.length === 0) throw new Error('App dist is missing a module entry');
  const assets = [
    ...moduleScripts.map((match) => match[1]),
    ...Array.from(indexHtml.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)).map((match) => match[1]),
  ];
  return Array.from(new Set(assets.map(normalizeEntryAsset).filter((asset) => asset !== 'logo.png'))).sort();
}

function generateDistManifest({ distDir, appVersion, gitCommit }) {
  const resolvedDist = path.resolve(distDir);
  const indexPath = path.join(resolvedDist, 'index.html');
  if (!fs.existsSync(indexPath)) throw new Error('App dist is missing index.html');
  const filePaths = listFiles(resolvedDist);
  if (filePaths.some((file) => file.endsWith('.map'))) throw new Error('App dist must not contain source map files');
  if (filePaths.some((file) => file.endsWith('.html') && !['index.html', 'plugin-runtime/v1.html'].includes(file))) {
    throw new Error('App dist must not contain debug HTML files');
  }
  const entryAssets = readEntryAssets(fs.readFileSync(indexPath, 'utf8'));
  for (const asset of entryAssets) {
    if (!fs.existsSync(path.join(resolvedDist, asset))) throw new Error(`App entry asset is missing: ${asset}`);
  }
  return {
    schemaVersion: 1,
    appVersion,
    gitCommit,
    entryAssets,
    files: filePaths.map((relativePath) => {
      const filePath = path.join(resolvedDist, relativePath);
      return {
        path: relativePath,
        size: fs.statSync(filePath).size,
        sha256: sha256(filePath),
      };
    }),
  };
}

function verifyDistManifest({ distDir, manifest }) {
  const resolvedDist = path.resolve(distDir);
  const actualFiles = listFiles(resolvedDist);
  const expectedFiles = manifest.files.map((file) => file.path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('App dist file list does not match manifest');
  }
  for (const expected of manifest.files) {
    const filePath = path.join(resolvedDist, expected.path);
    if (fs.statSync(filePath).size !== expected.size) throw new Error(`App dist size mismatch: ${expected.path}`);
    if (sha256(filePath) !== expected.sha256) throw new Error(`App dist hash mismatch: ${expected.path}`);
  }
  return true;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..');
  const distDir = path.resolve(readArg('--dist') || path.join(projectRoot, 'dist'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const gitCommit = readArg('--commit') || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  const manifest = generateDistManifest({ distDir, appVersion: packageJson.version, gitCommit });
  const outputPath = path.join(distDir, MANIFEST_NAME);
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  verifyDistManifest({ distDir, manifest });
  process.stdout.write(`${outputPath}\n`);
}

module.exports = { generateDistManifest, verifyDistManifest, MANIFEST_NAME };
