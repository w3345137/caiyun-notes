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
const imageSrc = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#dbeafe"/><text x="120" y="66" text-anchor="middle" font-size="18" fill="#1d4ed8">fixture image</text></svg>');
const content = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'before live image' }] },
    { type: 'image', attrs: { src: imageSrc, width: 240 } },
    { type: 'paragraph', content: [{ type: 'text', text: 'after live image' }] },
  ],
});
(async () => {
  const parent = await pool.query(
    'SELECT n.owner_id, up.email, up.display_name FROM notes n JOIN user_profiles up ON up.id = n.owner_id WHERE n.id = $1',
    ['${parentId}']
  );
  if (!parent.rows.length) throw new Error('parent note not found');
  const owner = parent.rows[0];
  const noteId = 'codex-image-selection-' + Date.now();
  await pool.query(
    "INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at) VALUES ($1, $2, $3, $4, 'page', $5, 999997, 'doc', $6, NOW())",
    [noteId, 'Codex Image Selection ' + Date.now(), content, '${parentId}', owner.owner_id, '${rootNotebookId}']
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
  await page.waitForSelector('.resizable-image-wrapper img', { timeout: 30000 });
  await page.waitForTimeout(1200);

  const controlsCount = () => page.locator('button[title="删除图片"]').count();
  assert.equal(await controlsCount(), 0, 'image controls should be hidden before selecting the image');

  await page.locator('.resizable-image-wrapper img').click();
  await page.waitForTimeout(200);
  assert.equal(await controlsCount(), 1, 'image controls should appear after selecting the image');

  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'codex-outside-focus';
    button.textContent = 'outside';
    document.body.prepend(button);
  });
  await page.locator('#codex-outside-focus').click();
  await page.waitForTimeout(200);
  assert.equal(await controlsCount(), 0, 'image controls should hide when focus leaves the editor');

  await page.locator('.resizable-image-wrapper img').click();
  await page.waitForTimeout(200);
  assert.equal(await controlsCount(), 1, 'image controls should appear again after reselecting the image');

  await page.getByText('after live image').click();
  await page.waitForTimeout(200);
  assert.equal(await controlsCount(), 0, 'image controls should hide after selecting regular text');

  console.log(JSON.stringify({ success: true, noteId: setup.noteId }, null, 2));
} finally {
  if (browser) await browser.close();
  runRemote(cleanupCode(setup.noteId));
}
