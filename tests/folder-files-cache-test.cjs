const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/lib/folderFilesCache.ts');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-folder-cache-'));

execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  [
    source,
    '--target',
    'ES2020',
    '--module',
    'CommonJS',
    '--outDir',
    outDir,
    '--skipLibCheck',
    '--esModuleInterop',
  ],
  { stdio: 'inherit' },
);

const cache = require(path.join(outDir, 'folderFilesCache.js'));

(async () => {
  cache.clearFolderFilesCache();
  const key = cache.getFolderFilesCacheKey('onedrive', 'note-1');
  cache.setFolderFilesCache(key, [{ id: 'file-1' }], 1000);

  assert.deepStrictEqual(
    cache.getFreshFolderFilesFromCache(key, 1000 + cache.FOLDER_FILES_CACHE_TTL_MS - 1),
    [{ id: 'file-1' }],
    'fresh folder files should be returned from cache',
  );

  assert.strictEqual(
    cache.getFreshFolderFilesFromCache(key, 1000 + cache.FOLDER_FILES_CACHE_TTL_MS + 1),
    null,
    'expired folder files should not be reused',
  );

  let loadCount = 0;
  await cache.getOrLoadFolderFiles(key, async () => {
    loadCount += 1;
    return [{ id: 'fresh-file' }];
  }, { now: 2000, force: true });

  await cache.getOrLoadFolderFiles(key, async () => {
    loadCount += 1;
    return [{ id: 'should-not-load' }];
  }, { now: 2001 });

  assert.strictEqual(loadCount, 1, 'fresh cache should prevent a second list request');

  cache.clearFolderFilesCache();
  let concurrentLoadCount = 0;
  await Promise.all([
    cache.getOrLoadFolderFiles(key, async () => {
      concurrentLoadCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return [{ id: 'shared' }];
    }, { now: 3000 }),
    cache.getOrLoadFolderFiles(key, async () => {
      concurrentLoadCount += 1;
      return [{ id: 'duplicate' }];
    }, { now: 3000 }),
  ]);

  assert.strictEqual(concurrentLoadCount, 1, 'in-flight list requests should be shared');
})();
