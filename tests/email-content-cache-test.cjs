const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/lib/emailContentCache.ts');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-email-cache-'));

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

const cache = require(path.join(outDir, 'emailContentCache.js'));

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(key, value);
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

cache.clearEmailContentCache();

const normalized = cache.normalizeEmailContentPayload({
  html: '<img src="logo.png" width="1200"><p>HTML body</p>',
  text: 'Readable text\r\nline 2',
});

assert.deepStrictEqual(
  normalized,
  { body: '<img src="logo.png" width="1200"><p>HTML body</p>', isHtml: true },
  'email body normalization should prefer HTML when available so images and tables remain readable',
);

assert.deepStrictEqual(
  cache.normalizeEmailContentPayload({
    attachments: [{ filename: '方案.pdf', contentType: 'application/pdf', size: 1234 }],
    text: [
      'OpenAI [https://cdn.openai.com/API/logo-assets/openai-logo-email-header-2.png]',
      '',
      '输入此临时验证码以继续：',
      '123456',
      '',
      '帮助中心',
      '[https://u20216706.ct.sendgrid.net/ls/click?upn=' + 'x'.repeat(150) + ']',
    ].join('\n'),
  }),
  {
    body: 'OpenAI\n\n输入此临时验证码以继续：\n123456\n\n帮助中心',
    isHtml: false,
    attachments: [{ filename: '方案.pdf', contentType: 'application/pdf', size: 1234 }],
  },
  'plain text email display should remove template image URLs and tracking-only links while preserving attachment metadata',
);

assert.deepStrictEqual(
  cache.normalizeEmailContentPayload({ html: '<p>Only HTML</p>' }),
  { body: '<p>Only HTML</p>', isHtml: true },
  'HTML should remain available as fallback when plain text is absent',
);

const storage = new MemoryStorage();
const key = cache.getEmailContentCacheKey('account-1', 'INBOX', 42);
const otherKey = cache.getEmailContentCacheKey('account-1', 'Sent', 42);

assert.notStrictEqual(key, otherKey, 'cache key should include folder and uid');

cache.setCachedEmailContent(key, { body: 'cached body', isHtml: false, attachments: [{ filename: '附件.docx', size: 20 }] }, 1000, storage);

assert.deepStrictEqual(
  cache.getCachedEmailContent(key, 1000 + cache.EMAIL_CONTENT_CACHE_TTL_MS - 1, storage),
  { body: 'cached body', isHtml: false, attachments: [{ filename: '附件.docx', size: 20 }], cachedAt: 1000 },
  'fresh cached email content should be reused',
);

assert.strictEqual(
  cache.getCachedEmailContent(key, 1000 + cache.EMAIL_CONTENT_CACHE_TTL_MS + 1, storage),
  null,
  'expired cached email content should not be reused',
);

cache.clearEmailContentCache(storage);

const threadKey = cache.getEmailThreadCacheKey('account-1', 'other@example.com');
cache.setCachedEmailThread(threadKey, [{ id: 'mail-1', uid: 1 }], 2000, storage);

assert.deepStrictEqual(
  cache.getCachedEmailThread(threadKey, 2000 + cache.EMAIL_THREAD_CACHE_TTL_MS - 1, storage),
  { emails: [{ id: 'mail-1', uid: 1 }], cachedAt: 2000 },
  'fresh cached email thread lists should be reused after page switches',
);

assert.strictEqual(
  cache.getCachedEmailThread(threadKey, 2000 + cache.EMAIL_THREAD_CACHE_TTL_MS + 1, storage),
  null,
  'expired cached email thread lists should not be reused',
);

cache.clearEmailThreadCache(storage);
