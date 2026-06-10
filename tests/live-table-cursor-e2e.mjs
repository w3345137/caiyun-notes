import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const host = process.env.CLOUDNOTES_HOST || 'https://notes.binapp.top';
const server = process.env.CLOUDNOTES_SSH || 'root@146.56.198.95';
const sourceNoteId = process.env.TABLE_CURSOR_SOURCE_NOTE_ID || '1774704753239-j50iqcxvv';
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
(async () => {
  const sourceId = process.env.SOURCE_NOTE_ID || '${sourceNoteId}';
  const parentId = process.env.PARENT_ID || '${parentId}';
  const rootNotebookId = process.env.ROOT_NOTEBOOK_ID || '${rootNotebookId}';
  const source = await pool.query(
    'SELECT COALESCE(cd.snapshot_content, n.content) AS content FROM notes n LEFT JOIN collab_documents cd ON cd.note_id = n.id WHERE n.id = $1',
    [sourceId]
  );
  if (!source.rows.length) throw new Error('source note not found');
  const parent = await pool.query(
    'SELECT n.owner_id, up.email, up.display_name FROM notes n JOIN user_profiles up ON up.id = n.owner_id WHERE n.id = $1',
    [parentId]
  );
  if (!parent.rows.length) throw new Error('parent note not found');
  const owner = parent.rows[0];
  const noteId = 'codex-table-cursor-' + Date.now();
  await pool.query(
    "INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at) VALUES ($1, $2, $3, $4, 'page', $5, 999999, 'doc', $6, NOW())",
    [noteId, 'Codex Table Cursor ' + Date.now(), source.rows[0].content, parentId, owner.owner_id, rootNotebookId]
  );
  console.log(JSON.stringify({
    token: signJwt({ id: owner.owner_id, email: owner.email, display_name: owner.display_name }),
    userId: owner.owner_id,
    noteId,
    parentId,
    rootNotebookId,
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
  assert.ok(tree.data.some((note) => note.id === setup.noteId), 'temporary note should be present in tree');

  const snapshot = {
    userId: setup.userId,
    notes: tree.data,
    selectedNoteId: setup.noteId,
    expandedNodes: [setup.rootNotebookId, setup.parentId],
    savedAt: new Date().toISOString(),
  };

  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const consoleMessages = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/TextSelection|tiptap error|editor view|PAGE_LOCKED|Forbidden/i.test(text)) {
      consoleMessages.push(`${message.type()}: ${text}`);
    }
  });

  await page.addInitScript(({ token, snapshot }) => {
    localStorage.setItem('notesapp_token', token);
    localStorage.setItem('caiyun_notes_tree_snapshot_v1', JSON.stringify(snapshot));
  }, { token: setup.token, snapshot });

  await page.goto(host, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((noteId) => document.body.textContent.includes(noteId) || document.body.textContent.includes('Codex Table Cursor'), setup.noteId, { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('.ProseMirror[contenteditable="true"] td', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('.ProseMirror td').length > 8);
  await page.waitForTimeout(1200);

  const targetIndex = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.ProseMirror td')];
    const empty = cells.findIndex((cell, index) => index > 2 && (cell.textContent || '').trim().length === 0);
    if (empty > 0) return empty;
    const nonEmpty = cells.findIndex((cell, index) => index > 2 && (cell.textContent || '').trim().length > 0);
    return nonEmpty > 0 ? nonEmpty : 1;
  });
  const marker = `CUR${Date.now().toString(36)}`;
  await page.evaluate((marker) => {
    window.__tableCursorMarker = marker;
  }, marker);

  const before = await page.evaluate((index) => {
    const cells = [...document.querySelectorAll('.ProseMirror td')];
    return {
      first: cells[0]?.textContent || '',
      target: cells[index]?.textContent || '',
      targetIndex: index,
    };
  }, targetIndex);

  const targetCell = page.locator('.ProseMirror td').nth(targetIndex);
  await targetCell.scrollIntoViewIfNeeded();
  const targetBox = await targetCell.boundingBox();
  assert.ok(targetBox, 'target table cell should be visible');
  await targetCell.click({
    position: {
      x: Math.max(4, Math.min(targetBox.width - 8, targetBox.width - 12)),
      y: Math.max(4, Math.min(targetBox.height - 8, targetBox.height - 12)),
    },
  });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');

  await page.keyboard.type(marker, { delay: 10 });
  await page.waitForTimeout(1500);

  const after = await page.evaluate((index) => {
    const cells = [...document.querySelectorAll('.ProseMirror td')];
    const selection = window.getSelection();
    const anchorElement = selection?.anchorNode?.nodeType === Node.TEXT_NODE
      ? selection.anchorNode.parentElement
      : selection?.anchorNode;
    const anchorCell = anchorElement?.closest?.('td') || null;
    return {
      first: cells[0]?.textContent || '',
      target: cells[index]?.textContent || '',
      targetIndex: index,
      cellWithMarkerIndex: cells.findIndex((cell) => (cell.textContent || '').includes(window.__tableCursorMarker || '')),
      anchorCellIndex: anchorCell ? cells.indexOf(anchorCell) : -1,
      anchorText: anchorCell?.textContent || '',
      activeTag: document.activeElement?.tagName || '',
      activeClass: document.activeElement?.className || '',
      bodyIncludesMarker: document.body.textContent.includes(window.__tableCursorMarker || ''),
      bodyTextStart: document.body.textContent.slice(0, 300),
    };
  }, targetIndex);

  assert.equal(after.first, before.first, `typing changed the first cell; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  assert.ok(after.target.includes(marker), `marker missing from target cell; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  assert.equal(after.anchorCellIndex, targetIndex, `cursor left the edited cell; before=${JSON.stringify(before)} after=${JSON.stringify(after)} console=${consoleMessages.join('\n')}`);
  assert.equal(consoleMessages.length, 0, `unexpected selection/editor console warnings:\n${consoleMessages.join('\n')}`);

  console.log(JSON.stringify({
    success: true,
    noteId: setup.noteId,
    targetIndex,
    beforeTarget: before.target.slice(0, 60),
    afterTarget: after.target.slice(0, 100),
  }, null, 2));
} finally {
  if (browser) await browser.close();
  runRemote(cleanupCode(setup.noteId));
}
