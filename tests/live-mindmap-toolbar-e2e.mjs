import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const host = process.env.CLOUDNOTES_HOST || 'https://notes.binapp.top';
const server = process.env.CLOUDNOTES_SSH || 'root@146.56.198.95';
const parentId = process.env.TABLE_CURSOR_PARENT_ID || '1774704745852-ygq6sd3h2';
const rootNotebookId = process.env.TABLE_CURSOR_ROOT_NOTEBOOK_ID || '1774663093409-hvxvqnl4h';

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
const cell = (text) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }] });
const mindmapData = {
  data: { text: '中心主题', uid: 'root', expand: true },
  children: [
    { data: { text: '分支 A', uid: 'a' }, children: [] },
    { data: { text: '分支 B', uid: 'b' }, children: [] },
  ],
};
const content = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'mindmap toolbar regression fixture' }] },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('A1'), cell('B1'), cell('C1')] },
        { type: 'tableRow', content: [cell('A2'), cell('B2'), cell('C2')] },
      ],
    },
    { type: 'mindmap', attrs: { content: JSON.stringify(mindmapData) } },
  ],
});
(async () => {
  const parent = await pool.query(
    'SELECT n.owner_id, up.email, up.display_name FROM notes n JOIN user_profiles up ON up.id = n.owner_id WHERE n.id = $1',
    ['${parentId}']
  );
  if (!parent.rows.length) throw new Error('parent note not found');
  const owner = parent.rows[0];
  const noteId = 'codex-mindmap-toolbar-' + Date.now();
  await pool.query(
    "INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at) VALUES ($1, $2, $3, $4, 'page', $5, 999998, 'doc', $6, NOW())",
    [noteId, 'Codex Mindmap Toolbar ' + Date.now(), content, '${parentId}', owner.owner_id, '${rootNotebookId}']
  );
  console.log(JSON.stringify({
    token: signJwt({ id: owner.owner_id, email: owner.email, display_name: owner.display_name }),
    userId: owner.owner_id,
    noteId,
    parentId: '${parentId}',
    rootNotebookId: '${rootNotebookId}',
  }));
  await pool.end();
})().catch(async (error) => {
  console.error(error.stack || error.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
`;

const cleanupCode = (noteId) => String.raw`
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'notesapp',
  user: process.env.DB_USER || 'notesapp_user',
  password: process.env.DB_PASSWORD || '',
});
(async () => {
  const noteId = '${noteId}';
  await pool.query('DELETE FROM collab_documents WHERE note_id = $1', [noteId]);
  await pool.query('DELETE FROM notes WHERE id = $1', [noteId]);
  await pool.end();
})().catch(async (error) => {
  console.error(error.stack || error.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
`;

const setupRaw = runRemote(setupCode);
const setupJson = setupRaw.split('\n').map((line) => line.trim()).find((line) => line.startsWith('{'));
assert.ok(setupJson, `setup did not return JSON: ${setupRaw}`);
const setup = JSON.parse(setupJson);

let browser;
try {
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
    selectedNoteId: setup.noteId,
    expandedNodes: [setup.rootNotebookId, setup.parentId],
    savedAt: new Date().toISOString(),
  };

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await page.addInitScript(({ token, snapshot }) => {
    localStorage.setItem('notesapp_token', token);
    localStorage.setItem('caiyun_notes_tree_snapshot_v1', JSON.stringify(snapshot));
  }, { token: setup.token, snapshot });

  await page.goto(host, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ProseMirror[contenteditable="true"] td', { timeout: 30000 });
  await page.waitForSelector('.mindmap-container', { timeout: 30000 });
  await page.waitForTimeout(1200);

  const isMindmapToolbarVisible = () => page.evaluate(() => (
    [...document.querySelectorAll('button[title="新增节点"]')]
      .some((button) => button instanceof HTMLElement && button.offsetParent !== null)
  ));

  await page.locator('.ProseMirror td').nth(1).click();
  await page.waitForTimeout(500);
  assert.equal(await isMindmapToolbarVisible(), false, 'mindmap toolbar must stay hidden while a table cell is selected');

  await page.locator('.mindmap-container').click({ position: { x: 120, y: 80 } });
  await page.waitForTimeout(500);
  assert.equal(await isMindmapToolbarVisible(), true, 'mindmap toolbar should appear after selecting the mindmap');

  await page.locator('.ProseMirror td').nth(2).click();
  await page.waitForTimeout(500);
  assert.equal(await isMindmapToolbarVisible(), false, 'mindmap toolbar must hide again after returning to the table');

  console.log(JSON.stringify({ success: true, noteId: setup.noteId }, null, 2));
} finally {
  if (browser) await browser.close();
  runRemote(cleanupCode(setup.noteId));
}
