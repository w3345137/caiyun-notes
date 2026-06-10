import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const host = process.env.CLOUDNOTES_HOST || 'https://notes.binapp.top';
const server = process.env.CLOUDNOTES_SSH || 'root@146.56.198.95';
const targetTitle = process.env.FOLDER_CACHE_TARGET_TITLE || 'OA发文';

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
  const targetTitle = '${targetTitle.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}';
  const target = await pool.query(
    "SELECT n.id, n.title, n.parent_id, COALESCE(n.root_notebook_id, n.id) AS root_notebook_id, COALESCE(root.owner_id, n.owner_id) AS owner_id, up.email, up.display_name FROM notes n LEFT JOIN notes root ON root.id = n.root_notebook_id JOIN user_profiles up ON up.id = COALESCE(root.owner_id, n.owner_id) WHERE n.title = $1 ORDER BY n.updated_at DESC LIMIT 1",
    [targetTitle]
  );
  if (!target.rows.length) throw new Error('target note not found: ' + targetTitle);
  const note = target.rows[0];
  const sibling = await pool.query(
    "SELECT id, title FROM notes WHERE parent_id = $1 AND id <> $2 AND type = 'page' ORDER BY order_index ASC, updated_at DESC LIMIT 1",
    [note.parent_id, note.id]
  );
  if (!sibling.rows.length) throw new Error('sibling page not found for switching');
  console.log(JSON.stringify({
    token: signJwt({ id: note.owner_id, email: note.email, display_name: note.display_name }),
    userId: note.owner_id,
    targetId: note.id,
    targetTitle: note.title,
    siblingTitle: sibling.rows[0].title,
    expandedNodes: [note.root_notebook_id, note.parent_id].filter(Boolean),
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
        && rect.left < 720
        && !el.closest('.ProseMirror')
        && (el.textContent || '').trim() === text;
    });
    if (!match) throw new Error(`sidebar title not found: ${text}`);
    match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, title);
}

async function waitUntil(predicate, timeoutMs, message) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(message);
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const listRequests = [];
  page.on('request', (request) => {
    if (/\/api\/(onedrive|baidu|qiniu|anyshare)\/list\b/.test(request.url())) {
      listRequests.push(request.url());
    }
  });

  await page.addInitScript(({ token, snapshot }) => {
    localStorage.setItem('notesapp_token', token);
    localStorage.setItem('caiyun_notes_tree_snapshot_v1', JSON.stringify(snapshot));
  }, { token: setup.token, snapshot });

  await page.goto(host, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((title) => document.body.textContent.includes(title), setup.targetTitle, { timeout: 30000 });
  await page.waitForFunction(() => document.body.textContent.includes('附件文件夹'), null, { timeout: 30000 });
  await waitUntil(() => listRequests.length >= 1, 15000, 'initial selected folder page did not request attachment list');

  const initialListCount = listRequests.length;

  await clickSidebarTitle(page, setup.siblingTitle);
  await page.waitForTimeout(700);

  listRequests.length = 0;
  await clickSidebarTitle(page, setup.targetTitle);
  await page.waitForTimeout(1500);
  const switchBackListCount = listRequests.length;

  console.log(JSON.stringify({
    targetTitle: setup.targetTitle,
    siblingTitle: setup.siblingTitle,
    initialListCount,
    switchBackListCount,
  }));

  assert.equal(switchBackListCount, 0, 'switching back to the same folder page within cache TTL should not request attachment list again');
} finally {
  await browser.close();
}
