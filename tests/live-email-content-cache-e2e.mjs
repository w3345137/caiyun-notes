import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const host = process.env.CLOUDNOTES_HOST || 'https://notes.binapp.top';
const server = process.env.CLOUDNOTES_SSH || 'root@146.56.198.95';
const accountEmail = process.env.EMAIL_E2E_ACCOUNT || 'cloudnotes_bin@126.com';
const targetKeyword = process.env.EMAIL_E2E_TARGET || 'openai';

function runRemote(code) {
  const encoded = Buffer.from(code, 'utf8').toString('base64');
  return execFileSync('ssh', [server, `cd /cloudnotes/backend && node -e 'eval(Buffer.from("${encoded}", "base64").toString())'`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const setupCode = String.raw`
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'notesapp',
  user: process.env.DB_USER || 'notesapp_user',
  password: process.env.DB_PASSWORD || '',
});
function signJwt(user, ttlSeconds = 3600) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    email: user.email,
    display_name: user.display_name || user.email.split('@')[0],
    role: 'authenticated',
    iat: now,
    exp: now + ttlSeconds,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + sig;
}
(async () => {
  const accountEmail = '${accountEmail.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}';
  const targetKeyword = '${targetKeyword.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}';
  const { rows: accountRows } = await pool.query(
    "SELECT ea.*, up.email AS user_email, up.display_name AS user_display_name FROM email_accounts ea JOIN user_profiles up ON up.id = ea.user_id WHERE ea.email_address = $1 ORDER BY ea.updated_at DESC LIMIT 1",
    [accountEmail]
  );
  if (!accountRows.length) throw new Error('email account not found: ' + accountEmail);
  const account = accountRows[0];
  const { rows: conversationRows } = await pool.query(
    "SELECT c.*, n.title FROM email_conversations c LEFT JOIN notes n ON n.id = c.note_id WHERE c.account_id = $1 AND (c.other_addr ILIKE $2 OR c.other_name ILIKE $2 OR c.last_subject ILIKE $2 OR n.title ILIKE $2) ORDER BY c.last_email_date DESC LIMIT 1",
    [account.id, '%' + targetKeyword + '%']
  );
  if (!conversationRows.length) throw new Error('email conversation not found for keyword: ' + targetKeyword);
  const conversation = conversationRows[0];
  if (!conversation.note_id) throw new Error('conversation has no note_id: ' + conversation.other_addr);
  const { rows: sectionRows } = await pool.query(
    "SELECT id, parent_id, root_notebook_id, title FROM notes WHERE id = $1 LIMIT 1",
    [account.note_id]
  );
  if (!sectionRows.length) throw new Error('email account section note not found: ' + account.note_id);
  const section = sectionRows[0];
  const { rows: siblingRows } = await pool.query(
    "SELECT id, title FROM notes WHERE parent_id = $1 AND id <> $2 AND type = 'page' ORDER BY updated_at DESC LIMIT 1",
    [account.note_id, conversation.note_id]
  );
  if (!siblingRows.length) throw new Error('sibling email page not found');
  console.log(JSON.stringify({
    token: signJwt({ id: account.user_id, email: account.user_email, display_name: account.user_display_name }),
    userId: account.user_id,
    accountId: account.id,
    accountEmail: account.email_address,
    targetId: conversation.note_id,
    targetTitle: conversation.title || conversation.other_name || conversation.other_addr,
    otherAddr: conversation.other_addr,
    siblingTitle: siblingRows[0].title,
    expandedNodes: [section.root_notebook_id || section.parent_id, section.parent_id, section.id].filter(Boolean),
  }));
  await pool.end();
})().catch(async (error) => {
  console.error(error.stack || error.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
`;

function clickSidebarTitle(page, title) {
  return page.evaluate((text) => {
    const elements = [...document.querySelectorAll('button, div, span')];
    const match = elements.find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0
        && rect.height > 0
        && rect.left < 760
        && !el.closest('.ProseMirror')
        && (el.textContent || '').trim() === text;
    });
    if (!match) throw new Error(`sidebar title not found: ${text}`);
    match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, title);
}

async function waitForEmailBodies(page) {
  await page.waitForFunction(() => (
    document.querySelectorAll('.email-text-body, .email-html-body').length > 0
    && !document.body.innerText.includes('正在加载邮件内容')
  ), null, { timeout: 45000 });
  await page.waitForTimeout(500);
}

const setupRaw = runRemote(setupCode);
const setupJson = setupRaw.split('\n').map((line) => line.trim()).find((line) => line.startsWith('{'));
assert.ok(setupJson, `setup did not return JSON: ${setupRaw}`);
const setup = JSON.parse(setupJson);

const treeResponse = await fetch(`${host}/api/notes-query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${setup.token}`,
  },
  body: JSON.stringify({ action: 'loadFullTree', userId: setup.userId }),
});
const tree = await treeResponse.json();
assert.equal(tree.success, true, `loadFullTree failed: ${JSON.stringify(tree).slice(0, 300)}`);

const snapshot = {
  userId: setup.userId,
  notes: tree.data,
  selectedNoteId: setup.targetId,
  expandedNodes: setup.expandedNodes,
  savedAt: new Date().toISOString(),
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const messageRequests = [];
  const threadRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/email/message/')) {
      messageRequests.push(request.url());
    }
    if (request.url().includes('/api/email/thread/')) {
      threadRequests.push(request.url());
    }
  });

  await page.addInitScript(({ token, snapshot }) => {
    localStorage.setItem('notesapp_token', token);
    localStorage.setItem('caiyun_notes_tree_snapshot_v1', JSON.stringify(snapshot));
    if (!sessionStorage.getItem('email_content_cache_e2e_initialized')) {
      for (const key of Object.keys(localStorage)) {
        if (
          key.startsWith('caiyun_email_content_cache_v1:')
          || key.startsWith('caiyun_email_content_cache_v2:')
          || key.startsWith('caiyun_email_content_cache_v3:')
          || key.startsWith('caiyun_email_thread_cache_v1:')
        ) {
          localStorage.removeItem(key);
        }
      }
      localStorage.removeItem('caiyun_email_content_cache_index_v1');
      localStorage.removeItem('caiyun_email_content_cache_index_v2');
      localStorage.removeItem('caiyun_email_content_cache_index_v3');
      localStorage.removeItem('caiyun_email_thread_cache_index_v1');
      sessionStorage.setItem('email_content_cache_e2e_initialized', '1');
    }
  }, { token: setup.token, snapshot });

  await page.goto(host, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((title) => document.body.innerText.includes(title), setup.targetTitle, { timeout: 30000 });
  await waitForEmailBodies(page);

  const firstLoadMessageRequestCount = messageRequests.length;
  const firstLoadThreadRequestCount = threadRequests.length;
  const firstMetrics = await page.evaluate(() => {
    const bodies = [...document.querySelectorAll('.email-text-body, .email-html-body')];
    const bubbles = [...document.querySelectorAll('.email-message-bubble')];
    const bodyRects = bodies.map((node) => node.getBoundingClientRect());
    const bubbleRects = bubbles.map((node) => node.getBoundingClientRect());
    return {
      hasClickPrompt: document.body.innerText.includes('点击查看邮件内容'),
      hasLoading: document.body.innerText.includes('正在加载邮件内容'),
      hasVerificationCopy: document.body.innerText.includes('验证码') || document.body.innerText.includes('verification code'),
      bodyCount: bodies.length,
      textBodyCount: document.querySelectorAll('.email-text-body').length,
      htmlBodyCount: document.querySelectorAll('.email-html-body').length,
      maxBodyWidth: Math.round(Math.max(...bodyRects.map((rect) => rect.width))),
      maxBubbleWidth: Math.round(Math.max(...bubbleRects.map((rect) => rect.width))),
      hugeImageCount: [...document.querySelectorAll('.email-html-body img')].filter((img) => img.getBoundingClientRect().width > 500).length,
      localCacheEntryCount: Object.keys(localStorage).filter((key) => key.startsWith('caiyun_email_content_cache_v3:')).length,
      localThreadCacheEntryCount: Object.keys(localStorage).filter((key) => key.startsWith('caiyun_email_thread_cache_v1:')).length,
    };
  });

  assert.equal(firstMetrics.hasClickPrompt, false, 'email content should be expanded by default');
  assert.equal(firstMetrics.hasLoading, false, 'email content should finish loading');
  assert.equal(firstMetrics.hasVerificationCopy, true, 'OpenAI thread should display readable verification text');
  assert.ok(firstMetrics.bodyCount > 0, 'email body elements should be rendered');
  assert.ok(firstMetrics.htmlBodyCount > 0, 'HTML bodies should be preferred so images and tables remain readable');
  assert.ok(
    firstMetrics.maxBubbleWidth > 650 && firstMetrics.maxBubbleWidth < 850,
    'email message bubble should use about 75% of the available content width',
  );
  assert.equal(firstMetrics.hugeImageCount, 0, 'HTML fallback should not render oversized images');
  assert.ok(firstMetrics.localCacheEntryCount > 0, 'email bodies should be persisted to localStorage');
  assert.ok(firstMetrics.localThreadCacheEntryCount > 0, 'email thread lists should be persisted to localStorage');
  assert.ok(firstLoadThreadRequestCount > 0, 'fresh first load should fetch the email thread list');
  assert.ok(firstLoadMessageRequestCount > 0, 'fresh first load should fetch message bodies');

  await page.screenshot({ path: '/tmp/cloudnotes-email-content-cache-e2e.png', fullPage: false });

  await clickSidebarTitle(page, setup.siblingTitle);
  await page.waitForFunction((title) => document.body.innerText.includes(title), setup.siblingTitle, { timeout: 30000 });

  messageRequests.length = 0;
  threadRequests.length = 0;
  await clickSidebarTitle(page, setup.targetTitle);
  await page.waitForFunction((title) => document.body.innerText.includes(title), setup.targetTitle, { timeout: 30000 });
  await waitForEmailBodies(page);
  const switchBackMessageRequestCount = messageRequests.length;
  const switchBackThreadRequestCount = threadRequests.length;
  assert.equal(switchBackThreadRequestCount, 0, 'switching back should reuse cached email thread lists');
  assert.equal(switchBackMessageRequestCount, 0, 'switching back should reuse cached message bodies');

  messageRequests.length = 0;
  threadRequests.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction((title) => document.body.innerText.includes(title), setup.targetTitle, { timeout: 30000 });
  await waitForEmailBodies(page);
  const reloadMessageRequestCount = messageRequests.length;
  const reloadThreadRequestCount = threadRequests.length;
  assert.equal(reloadThreadRequestCount, 0, 'page reload should reuse persisted email thread cache');
  assert.equal(reloadMessageRequestCount, 0, 'page reload should reuse persisted message body cache');

  console.log(JSON.stringify({
    accountEmail: setup.accountEmail,
    targetTitle: setup.targetTitle,
    firstLoadThreadRequestCount,
    firstLoadMessageRequestCount,
    switchBackThreadRequestCount,
    switchBackMessageRequestCount,
    reloadThreadRequestCount,
    reloadMessageRequestCount,
    ...firstMetrics,
  }));
} finally {
  await browser.close();
}
