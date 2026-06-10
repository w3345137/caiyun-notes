/**
 * NotesApp v2.5 核心后端 (彻底去 Supabase 版)
 * 特性：本地密码校验 (bcrypt)、本地签发 JWT、全链路 Debug 日志
 * 安全：.env 配置、CORS 限制、请求体限制、权限检查、SQL 参数化
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const fs = require('fs');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const emailService = require('./emailService');
const { Server: HocuspocusServer } = require('@hocuspocus/server');
const Y = require('yjs');
const { collabTransformer, EMPTY_DOC } = require('./collabSchema');
const oneNoteProbe = require('./onenoteProbe');
const coursewareOss = require('./coursewareOss');
const {
  maskAnyShareAccount,
  normalizeAnyShareBaseUrl,
  listAnyShareDocLibs,
  createAnyShareDir,
  uploadAnyShareFile,
  downloadAnyShareFile,
  deleteAnyShareFile,
} = require('./anyshareProvider');
const {
  createNotebookApiToken,
  hashNotebookApiToken,
  parseTiptapDoc,
  tiptapDocToMarkdown,
  collectAttachmentReferences,
  extractTextFromBuffer,
} = require('./notebookApiUtils');
const {
  buildEmailNotebookId,
  buildEmailAccountSectionId,
  buildEmailThreadPageContent,
  buildEmailThreadPageId,
  buildEmailThreadTitle,
  buildEmailAccountContent,
  normalizeEmailAddress,
} = require('./emailNotebookUtils');
const jiangsuOrgNotebook = require('./jiangsuOrgNotebook');
const { ORG_PLAN_NOTEBOOK_ID, isProtectedOrgNoteContent } = require('./jiangsuOrgNotebookUtils');
const { replaceFileNameInPath, validateAttachmentRename } = require('./attachmentRenameUtils');
    // OneDrive MIME 类型辅助
    function getMimeType(fileName) {
      const ext = (fileName.split('.').pop() || '').toLowerCase();
      const map = { jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',zip:'application/zip',mp3:'audio/mpeg',mp4:'video/mp4',rar:'application/x-rar-compressed',json:'application/json',csv:'text/csv' };
      return map[ext] || 'application/octet-stream';
    }
    function getCategory(mimeType) {
      if (mimeType.startsWith('image/')) return 'image';
      if (mimeType.startsWith('video/')) return 'video';
      if (mimeType.startsWith('audio/')) return 'audio';
      if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('spreadsheet') || mimeType.includes('presentation')) return 'document';
      return 'other';
    }

const PORT = process.env.PORT || 3010;
const HOST = process.env.HOST || '0.0.0.0';
const COLLAB_PORT = parseInt(process.env.COLLAB_PORT || '3012', 10);
const COLLAB_HOST = process.env.COLLAB_HOST || '127.0.0.1';
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[SECURITY] JWT_SECRET 未设置，使用随机临时密钥（仅限开发环境）');
  return require('crypto').randomBytes(64).toString('hex');
})();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '767493611@qq.com';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const MAX_BODY_SIZE = 10 * 1024 * 1024;
const AUTH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const NOTEBOOK_API_DEFAULT_EXPIRES_DAYS = 365;
const PROVIDER_GRAPH_ENDPOINTS = {
  '世纪互联': 'https://microsoftgraph.chinacloudapi.cn/v1.0',
  international: 'https://graph.microsoft.com/v1.0',
};

// ================= SSE 广播管理 =================
const sseClients = new Map();

function sseAddClient(userId, res) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);
  console.log(`[SSE] 用户 ${userId.substring(0, 8)}... 连接，当前连接数: ${sseClients.get(userId).size}`);
}

function sseRemoveClient(userId, res) {
  if (sseClients.has(userId)) {
    sseClients.get(userId).delete(res);
    if (sseClients.get(userId).size === 0) sseClients.delete(userId);
  }
}

async function sseBroadcast(notebookId, event, excludeUserId) {
  const recipientIds = new Set();
  const ownerResult = await pool.query('SELECT owner_id FROM notes WHERE id = $1', [notebookId]);
  if (ownerResult.rows.length) recipientIds.add(ownerResult.rows[0].owner_id);
  const shareResult = await pool.query('SELECT user_id FROM note_shares WHERE notebook_id = $1', [notebookId]);
  shareResult.rows.forEach(r => recipientIds.add(r.user_id));
  if (excludeUserId) recipientIds.delete(excludeUserId);
  const data = `data: ${JSON.stringify(event)}\n\n`;
  let sent = 0;
  for (const uid of recipientIds) {
    const clients = sseClients.get(uid);
    if (!clients) continue;
    for (const clientRes of clients) {
      try { clientRes.write(data); sent++; } catch (e) {}
    }
  }
  console.log(`[SSE] 广播 ${event.type} 给 ${sent} 个连接`);
}

// ================= 邮件服务配置 =================
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.126.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }
};

if (!SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
  console.warn('[SECURITY] SMTP_USER 或 SMTP_PASS 未设置，邮件功能将不可用');
}

const mailTransporter = nodemailer.createTransport(SMTP_CONFIG);

// 验证码存储（内存 Map，key=email_purpose，value={ code, expires, attempts }）
const verificationCodes = new Map();
const CODE_TTL = 5 * 60 * 1000; // 验证码有效期 5 分钟
const CODE_MAX_ATTEMPTS = 5; // 最多验证 5 次
const CODE_COOLDOWN = 60 * 1000; // 同一邮箱 60 秒内只能发送一次
const SEND_COOLDOWNS = new Map(); // 发送冷却记录

if (!process.env.DB_PASSWORD) {
  console.warn('[SECURITY] DB_PASSWORD 未设置，将使用默认值（仅限开发环境）');
}
const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'notesapp',
  user: process.env.DB_USER || 'notesapp_user',
  password: process.env.DB_PASSWORD || '',
});

async function ensureCollabTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collab_documents (
      note_id TEXT PRIMARY KEY,
      y_state BYTEA NOT NULL,
      snapshot_content TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_collab_documents_updated_at ON collab_documents(updated_at)');
}

async function ensureAnyShareTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS anyshare_accounts (
      user_id TEXT PRIMARY KEY,
      base_url TEXT NOT NULL,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      root_docid TEXT NOT NULL,
      root_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureNotebookApiTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notebook_api_tokens (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL,
      creator_user_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '智能体 API',
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notebook_api_tokens_notebook_id ON notebook_api_tokens(notebook_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notebook_api_tokens_creator_user_id ON notebook_api_tokens(creator_user_id)');
}

async function ensureEmailTables() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      email_address TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      imap_host TEXT NOT NULL,
      imap_port INTEGER DEFAULT 993,
      imap_ssl BOOLEAN DEFAULT true,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER DEFAULT 465,
      smtp_ssl BOOLEAN DEFAULT true,
      encrypted_password TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT,
      note_id TEXT,
      last_sync_uid BIGINT DEFAULT 0,
      last_sync_at TIMESTAMPTZ,
      sync_enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, email_address)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_index (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
      uid BIGINT NOT NULL,
      folder TEXT NOT NULL DEFAULT 'INBOX',
      message_id TEXT,
      from_addr TEXT,
      from_name TEXT,
      to_list TEXT,
      cc_list TEXT,
      subject TEXT,
      date TIMESTAMPTZ,
      has_attachments BOOLEAN DEFAULT false,
      is_read BOOLEAN DEFAULT false,
      is_starred BOOLEAN DEFAULT false,
      size INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(account_id, uid, folder)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
      other_addr TEXT NOT NULL,
      other_name TEXT DEFAULT '',
      last_email_date TIMESTAMPTZ,
      last_subject TEXT DEFAULT '',
      unread_count INTEGER DEFAULT 0,
      total_count INTEGER DEFAULT 0,
      note_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(account_id, other_addr)
    )
  `);
  await pool.query('ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS auth_tag TEXT');
  await pool.query('ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS note_id TEXT');
  await pool.query('ALTER TABLE email_conversations ADD COLUMN IF NOT EXISTS note_id TEXT');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_email_accounts_note_id ON email_accounts(note_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_email_index_account ON email_index(account_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_email_index_from ON email_index(from_addr)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_email_index_date ON email_index(date DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_email_conversations_account ON email_conversations(account_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_email_conversations_note_id ON email_conversations(note_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_email_conversations_date ON email_conversations(last_email_date DESC)');
  await pool.query('ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_type_check');
  await pool.query(`
    ALTER TABLE notes ADD CONSTRAINT notes_type_check
    CHECK ((type)::text = ANY (ARRAY['notebook','email_notebook','section','email_account','page']))
  `);

  const duplicates = await pool.query(`
    SELECT owner_id
    FROM notes
    WHERE type = 'email_notebook' AND parent_id IS NULL
    GROUP BY owner_id
    HAVING COUNT(*) > 1
    LIMIT 1
  `);
  if (!duplicates.rows.length) {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_one_email_notebook_per_owner
      ON notes(owner_id)
      WHERE type = 'email_notebook' AND parent_id IS NULL
    `);
  } else {
    console.warn('[Email] 检测到重复邮箱笔记本，跳过唯一索引创建');
  }
}

async function ensureUserEmailNotebook(userId, requestedNotebookId = null) {
  if (requestedNotebookId) {
    const { rows } = await pool.query(
      `SELECT id
       FROM notes
       WHERE id = $1 AND owner_id = $2 AND type = 'email_notebook'
       LIMIT 1`,
      [requestedNotebookId, userId]
    );
    if (!rows.length) {
      const err = new Error('邮箱笔记本不存在或无权限');
      err.statusCode = 403;
      throw err;
    }
    return requestedNotebookId;
  }

  const existing = await pool.query(
    `SELECT id
     FROM notes
     WHERE owner_id = $1 AND type = 'email_notebook' AND parent_id IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId]
  );
  if (existing.rows.length) return existing.rows[0].id;

  const notebookId = buildEmailNotebookId(userId);
  await pool.query(
    `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at, created_at)
     VALUES ($1, '邮箱管理', '', NULL, 'email_notebook', $2, 0, 'mail', $1, NOW(), NOW())
     ON CONFLICT(id) DO UPDATE SET
       title = EXCLUDED.title,
       type = 'email_notebook',
       parent_id = NULL,
       root_notebook_id = EXCLUDED.root_notebook_id,
       icon = 'mail',
       updated_at = NOW()`,
    [notebookId, userId]
  );
  return notebookId;
}

async function upsertEmailAccountSection(userId, notebookId, account) {
  const sectionId = buildEmailAccountSectionId(account.id);
  const title = account.display_name || account.email_address;
  const content = buildEmailAccountContent(account);
  await pool.query(
    `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at, created_at)
     VALUES ($1, $2, $3, $4, 'email_account', $5, 0, 'mail', $4, NOW(), NOW())
     ON CONFLICT(id) DO UPDATE SET
       title = EXCLUDED.title,
       content = EXCLUDED.content,
       parent_id = EXCLUDED.parent_id,
       type = 'email_account',
       root_notebook_id = EXCLUDED.root_notebook_id,
       icon = 'mail',
       updated_at = NOW()`,
    [sectionId, title, content, notebookId, userId]
  );
  await pool.query('UPDATE email_accounts SET note_id = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3', [sectionId, account.id, userId]);
  return sectionId;
}

async function upsertEmailConversationPages(accountId) {
  const { rows: accountRows } = await pool.query(
    `SELECT id, user_id, email_address, display_name, note_id
     FROM email_accounts
     WHERE id = $1`,
    [accountId]
  );
  if (!accountRows.length) return { pages: 0 };

  const account = accountRows[0];
  let sectionId = account.note_id || buildEmailAccountSectionId(account.id);
  let section = await pool.query(
    `SELECT id, parent_id, root_notebook_id
     FROM notes
     WHERE id = $1 AND owner_id = $2 AND type = 'email_account'`,
    [sectionId, account.user_id]
  );

  if (!section.rows.length) {
    const notebookId = await ensureUserEmailNotebook(account.user_id);
    sectionId = await upsertEmailAccountSection(account.user_id, notebookId, account);
    section = await pool.query(
      `SELECT id, parent_id, root_notebook_id
       FROM notes
       WHERE id = $1 AND owner_id = $2 AND type = 'email_account'`,
      [sectionId, account.user_id]
    );
  }

  const rootNotebookId = section.rows[0]?.root_notebook_id || section.rows[0]?.parent_id;
  const { rows: conversations } = await pool.query(
    `SELECT *
     FROM email_conversations
     WHERE account_id = $1
     ORDER BY last_email_date DESC NULLS LAST, updated_at DESC`,
    [account.id]
  );

  let order = 0;
  const pageIds = [];
  for (const conversation of conversations) {
    const otherAddr = normalizeEmailAddress(conversation.other_addr);
    if (!otherAddr) continue;
    const pageId = conversation.note_id || buildEmailThreadPageId(account.id, otherAddr);
    pageIds.push(pageId);
    const content = buildEmailThreadPageContent({
      accountId: account.id,
      otherAddr,
      otherName: conversation.other_name,
      myEmail: account.email_address,
      conversationId: conversation.id,
    });
    await pool.query(
      `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at, created_at)
       VALUES ($1, $2, $3, $4, 'page', $5, $6, 'mail', $7, NOW(), NOW())
       ON CONFLICT(id) DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         parent_id = EXCLUDED.parent_id,
         type = 'page',
         order_index = EXCLUDED.order_index,
         icon = 'mail',
         root_notebook_id = EXCLUDED.root_notebook_id,
         updated_at = NOW()`,
      [pageId, buildEmailThreadTitle(conversation), content, sectionId, account.user_id, order, rootNotebookId]
    );
    await pool.query('UPDATE email_conversations SET note_id = $1, updated_at = NOW() WHERE id = $2', [pageId, conversation.id]);
    order += 1;
  }

  if (pageIds.length > 0) {
    await pool.query(
      `DELETE FROM notes
       WHERE parent_id = $1 AND type = 'page' AND NOT (id = ANY($2::text[]))`,
      [sectionId, pageIds]
    );
  } else {
    await pool.query(
      `DELETE FROM notes
       WHERE parent_id = $1 AND type = 'page'`,
      [sectionId]
    );
  }

  return { pages: order };
}

async function syncEmailAccountWithPages(accountId, accountConfig, options = {}) {
  const result = await emailService.syncEmails(pool, accountId, accountConfig, options);
  const pageResult = await upsertEmailConversationPages(accountId);
  return { ...result, pages: pageResult.pages };
}

async function getNotebookRootInfo(noteId) {
  const { rows } = await pool.query(
    `SELECT
       n.id,
       n.title,
       n.type,
       n.owner_id,
       n.root_notebook_id,
       root.id AS root_id,
       root.owner_id AS root_owner_id,
       root.title AS root_title
     FROM notes n
     LEFT JOIN notes root ON root.id = COALESCE(n.root_notebook_id, n.id)
     WHERE n.id = $1`,
    [noteId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    note: row,
    rootId: row.root_notebook_id || row.id,
    rootOwnerId: row.root_owner_id || row.owner_id,
    rootTitle: row.root_title || row.title,
  };
}

async function getNotebookOwnerIdForNote(noteId) {
  const info = await getNotebookRootInfo(noteId);
  return info?.rootOwnerId || null;
}

async function getNotebookAccessLevelForUser(targetUserId, noteId) {
  if (!targetUserId || !noteId) return { access: 'none', isOwner: false, rootId: null };
  const info = await getNotebookRootInfo(noteId);
  if (!info) return { access: 'none', isOwner: false, rootId: null };
  if (info.note.owner_id === targetUserId || info.rootOwnerId === targetUserId) {
    return { access: 'edit', isOwner: true, rootId: info.rootId };
  }
  const { rows } = await pool.query(
    'SELECT permission FROM note_shares WHERE notebook_id = $1 AND user_id = $2 LIMIT 1',
    [info.rootId, targetUserId]
  );
  if (!rows.length) return { access: 'none', isOwner: false, rootId: info.rootId };
  return { access: rows[0].permission === 'edit' ? 'edit' : 'view', isOwner: false, rootId: info.rootId };
}

function isAnyShareDocidSafe(docid) {
  return typeof docid === 'string' && docid.startsWith('gns://') && !docid.includes('..');
}

function isOdPathSafe(path) {
  if (!path) return false;
  if (!String(path).startsWith('/彩云笔记/')) return false;
  if (String(path).includes('..')) return false;
  if (String(path).includes('//')) return false;
  return true;
}

function getOneDriveGraphEndpoint(cloudType) {
  return PROVIDER_GRAPH_ENDPOINTS[cloudType] || PROVIDER_GRAPH_ENDPOINTS.international;
}

async function refreshOneDriveTokenForAccount(account) {
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (account.access_token && expiresAt && expiresAt > Date.now() + 5 * 60 * 1000) {
    return account.access_token;
  }
  if (!account.refresh_token) throw new Error('OneDrive refresh token 不存在');

  const authBase = account.cloud_type === '世纪互联'
    ? 'https://login.chinacloudapi.cn'
    : 'https://login.microsoftonline.com';
  const tokenPath = account.tenant_id && account.cloud_type === '世纪互联'
    ? `/${account.tenant_id}/oauth2/v2.0/token`
    : '/common/oauth2/v2.0/token';
  const tokenResp = await fetch(`${authBase}${tokenPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: account.client_id,
      client_secret: account.client_secret,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const tokenData = await tokenResp.json();
  if (!tokenResp.ok || tokenData.error) {
    throw new Error(tokenData.error_description || tokenData.error || 'OneDrive token 刷新失败');
  }
  const nextExpiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;
  await pool.query(
    `UPDATE onedrive_accounts SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW() WHERE user_id = $4`,
    [tokenData.access_token, tokenData.refresh_token || account.refresh_token, nextExpiresAt, account.user_id]
  );
  return tokenData.access_token;
}

async function downloadOneDriveAttachmentBuffer(att) {
  if (!isOdPathSafe(att.onedrive_path)) throw new Error('非法 OneDrive 路径');
  const { rows } = await pool.query('SELECT * FROM onedrive_accounts WHERE user_id = $1', [att.user_id]);
  if (!rows.length) throw new Error('附件所有者未绑定 OneDrive 账号');
  const account = rows[0];
  const accessToken = await refreshOneDriveTokenForAccount(account);
  const graphEp = getOneDriveGraphEndpoint(account.cloud_type);
  const drivePrefix = account.drive_id ? `drives/${account.drive_id}/root` : 'me/drive';
  const dlResp = await fetch(`${graphEp}/${drivePrefix}:${encodeURIComponent(att.onedrive_path)}:/content`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!dlResp.ok) {
    const errText = await dlResp.text();
    throw new Error(`OneDrive 下载失败 (${dlResp.status}): ${errText}`);
  }
  return Buffer.from(await dlResp.arrayBuffer());
}

async function downloadAnyShareAttachmentBuffer(att) {
  const docid = att.onedrive_file_id || att.onedrive_path;
  if (!isAnyShareDocidSafe(docid)) throw new Error('非法 AnyShare docid');
  const { rows } = await pool.query('SELECT * FROM anyshare_accounts WHERE user_id = $1', [att.user_id]);
  if (!rows.length) throw new Error('附件所有者未绑定 AnyShare');
  const result = await downloadAnyShareFile(rows[0], docid);
  return result.buffer;
}

async function downloadAttachmentBuffer(att) {
  if (att.storage_provider === 'anyshare') return downloadAnyShareAttachmentBuffer(att);
  if (!att.storage_provider || att.storage_provider === 'onedrive') return downloadOneDriveAttachmentBuffer(att);
  throw new Error(`notebook API 暂不支持读取 ${att.storage_provider} 附件内容`);
}

async function authenticateNotebookApiRequest(req) {
  const headerToken = (req.headers['authorization'] || '').split(' ')[1];
  const apiKey = req.headers['x-notebook-api-key'] || headerToken;
  if (!apiKey || !String(apiKey).startsWith('cynb_')) {
    return { ok: false, code: 401, error: 'Missing notebook API key' };
  }
  const tokenHash = hashNotebookApiToken(String(apiKey));
  const { rows } = await pool.query(
    `SELECT * FROM notebook_api_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [tokenHash]
  );
  if (!rows.length) return { ok: false, code: 401, error: 'Invalid notebook API key' };
  const tokenRow = rows[0];
  const access = await getNotebookAccessLevelForUser(tokenRow.creator_user_id, tokenRow.notebook_id);
  if (access.access === 'none') {
    return { ok: false, code: 403, error: 'TOKEN_ACCESS_REVOKED' };
  }
  await pool.query('UPDATE notebook_api_tokens SET last_used_at = NOW() WHERE id = $1', [tokenRow.id]).catch(() => {});
  return { ok: true, token: tokenRow, access };
}

function isNotebookApiRoute(url) {
  return url.includes('/notebook-api/v1/');
}

function notebookApiPath(reqUrl) {
  const pathname = new URL(reqUrl, 'http://localhost').pathname;
  return pathname.replace(/^\/api/, '');
}

async function loadNotebookApiNote(notebookId, noteId) {
  const { rows } = await pool.query(
    `SELECT n.*, cd.snapshot_content
     FROM notes n
     LEFT JOIN collab_documents cd ON cd.note_id = n.id
     WHERE n.id = $1
       AND (n.id = $2 OR n.root_notebook_id = $2)
     LIMIT 1`,
    [noteId, notebookId]
  );
  return rows[0] || null;
}

function sanitizeAttachment(att) {
  return {
    id: att.id,
    note_id: att.note_id,
    file_name: att.file_name,
    file_size: att.file_size,
    mime_type: att.mime_type,
    category: att.category,
    storage_provider: att.storage_provider || 'onedrive',
    created_at: att.created_at,
  };
}

async function handleNotebookApiReadRequest(req, res) {
  const auth = await authenticateNotebookApiRequest(req);
  if (!auth.ok) return end(res, auth.code, { success: false, error: auth.error });

  const path = notebookApiPath(req.url);
  const urlObj = new URL(req.url, 'http://localhost');
  const notebookId = auth.token.notebook_id;

  if (path === '/notebook-api/v1/notebook' && req.method === 'GET') {
    const { rows } = await pool.query(
      'SELECT id, title, type, icon, owner_id, updated_at, cloud_provider FROM notes WHERE id = $1',
      [notebookId]
    );
    if (!rows.length) return end(res, 404, { success: false, error: 'Notebook not found' });
    return end(res, 200, {
      success: true,
      data: {
        ...rows[0],
        capabilities: {
          read_tree: true,
          read_notes: true,
          download_attachments: true,
          extract_attachment_text: true,
          write: false,
        },
      },
    });
  }

  if (path === '/notebook-api/v1/tree' && req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT id, title, parent_id, type, order_index, icon, root_notebook_id, updated_at, cloud_provider
       FROM notes
       WHERE id = $1 OR root_notebook_id = $1
       ORDER BY order_index ASC, updated_at DESC`,
      [notebookId]
    );
    return end(res, 200, { success: true, data: rows });
  }

  if (path === '/notebook-api/v1/changes' && req.method === 'GET') {
    const since = urlObj.searchParams.get('since');
    if (!since) return end(res, 400, { success: false, error: 'Missing since' });
    const { rows } = await pool.query(
      `SELECT id, title, parent_id, type, order_index, icon, root_notebook_id, updated_at
       FROM notes
       WHERE (id = $1 OR root_notebook_id = $1) AND updated_at > $2
       ORDER BY updated_at ASC`,
      [notebookId, since]
    );
    return end(res, 200, { success: true, data: rows });
  }

  const noteMatch = path.match(/^\/notebook-api\/v1\/notes\/([^/]+)$/);
  if (noteMatch && req.method === 'GET') {
    const noteId = decodeURIComponent(noteMatch[1]);
    const note = await loadNotebookApiNote(notebookId, noteId);
    if (!note) return end(res, 404, { success: false, error: 'Note not found' });
    const documentJson = parseTiptapDoc(note.snapshot_content || note.content);
    const { rows: attachments } = await pool.query(
      `SELECT id, note_id, file_name, file_size, mime_type, category, storage_provider, created_at
       FROM attachments WHERE note_id = $1 ORDER BY created_at DESC`,
      [noteId]
    );
    return end(res, 200, {
      success: true,
      data: {
        id: note.id,
        title: note.title,
        type: note.type,
        parent_id: note.parent_id,
        root_notebook_id: note.root_notebook_id,
        updated_at: note.updated_at,
        markdown: tiptapDocToMarkdown(documentJson),
        document_json: documentJson,
        attachment_refs: collectAttachmentReferences(documentJson),
        attachments: attachments.map(sanitizeAttachment),
      },
    });
  }

  const attachmentMatch = path.match(/^\/notebook-api\/v1\/attachments\/([^/]+)(?:\/(download|text))?$/);
  if (attachmentMatch && req.method === 'GET') {
    const attachmentId = decodeURIComponent(attachmentMatch[1]);
    const mode = attachmentMatch[2] || 'metadata';
    const { rows } = await pool.query(
      `SELECT a.*
       FROM attachments a
       JOIN notes n ON n.id = a.note_id
       WHERE a.id = $1 AND (n.id = $2 OR n.root_notebook_id = $2)
       LIMIT 1`,
      [attachmentId, notebookId]
    );
    if (!rows.length) return end(res, 404, { success: false, error: 'Attachment not found' });
    const att = rows[0];
    if (mode === 'metadata') return end(res, 200, { success: true, data: sanitizeAttachment(att) });

    const buffer = await downloadAttachmentBuffer(att);
    if (mode === 'text') {
      const extracted = await extractTextFromBuffer(buffer, att.mime_type, att.file_name);
      return end(res, extracted.supported ? 200 : 415, {
        success: extracted.supported,
        attachment: sanitizeAttachment(att),
        ...extracted,
      });
    }

    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.file_name)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.writeHead(200);
    return res.end(buffer);
  }

  return end(res, 404, { success: false, error: 'Notebook API endpoint not found' });
}

function noteIdFromDocumentName(documentName) {
  if (!documentName || !documentName.startsWith('note:')) return null;
  return documentName.slice('note:'.length);
}

async function getUserProfile(userId) {
  if (!userId) return null;
  const { rows } = await pool.query('SELECT id, email, display_name FROM user_profiles WHERE id = $1', [userId]);
  return rows[0] || null;
}

async function getCollabAccess(noteId, userId) {
  if (!noteId || !userId) return { canRead: false, canWrite: false, permission: 'none' };
  const { rows } = await pool.query(
    `SELECT
       n.id,
       n.title,
       n.type,
       n.owner_id,
       n.root_notebook_id,
       n.is_locked,
       n.locked_by,
       n.locked_by_name,
       root.owner_id AS root_owner_id
     FROM notes n
     LEFT JOIN notes root ON root.id = COALESCE(n.root_notebook_id, n.id)
     WHERE n.id = $1`,
    [noteId]
  );
  if (!rows.length) return { canRead: false, canWrite: false, permission: 'none' };

  const note = rows[0];
  const rootId = note.root_notebook_id || note.id;
  let permission = 'none';
  let isOwner = note.owner_id === userId || note.root_owner_id === userId;

  if (isOwner) {
    permission = 'owner';
  } else {
    const share = await pool.query(
      'SELECT permission FROM note_shares WHERE notebook_id = $1 AND user_id = $2 LIMIT 1',
      [rootId, userId]
    );
    if (share.rows.length) permission = share.rows[0].permission === 'edit' ? 'edit' : 'view';
  }

  const canRead = permission !== 'none';
  const lockedByOther = !!(note.is_locked && note.locked_by && note.locked_by !== userId);
  const canWrite = canRead && permission !== 'view' && !lockedByOther;
  return {
    canRead,
    canWrite,
    permission,
    isOwner,
    note,
    lockedByOther,
    lockedBy: note.locked_by || null,
    lockedByName: note.locked_by_name || null,
  };
}

function parseNoteContent(content) {
  if (!content || typeof content !== 'string') return EMPTY_DOC;
  try {
    const parsed = JSON.parse(content);
    return parsed?.type === 'doc' ? parsed : EMPTY_DOC;
  } catch (_) {
    return EMPTY_DOC;
  }
}

async function loadCollabDocument(documentName, document) {
  const noteId = noteIdFromDocumentName(documentName);
  if (!noteId) return;

  const existing = await pool.query('SELECT y_state FROM collab_documents WHERE note_id = $1', [noteId]);
  if (existing.rows.length && existing.rows[0].y_state) {
    Y.applyUpdate(document, new Uint8Array(existing.rows[0].y_state));
    return;
  }

  const note = await pool.query('SELECT content FROM notes WHERE id = $1', [noteId]);
  const tiptapDoc = parseNoteContent(note.rows[0]?.content);
  let ydoc;
  try {
    ydoc = collabTransformer.toYdoc(tiptapDoc, 'default');
  } catch (e) {
    console.warn('[Collab] 初始内容迁移失败，使用空文档:', noteId, e.message);
    ydoc = collabTransformer.toYdoc(EMPTY_DOC, 'default');
  }
  const state = Y.encodeStateAsUpdate(ydoc);
  Y.applyUpdate(document, state);
  await pool.query(
    `INSERT INTO collab_documents (note_id, y_state, snapshot_content, schema_version, updated_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (note_id) DO NOTHING`,
    [noteId, Buffer.from(state), JSON.stringify(tiptapDoc)]
  );
}

async function storeCollabDocument(documentName, document) {
  const noteId = noteIdFromDocumentName(documentName);
  if (!noteId) return;
  const state = Buffer.from(Y.encodeStateAsUpdate(document));
  let snapshot = null;
  try {
    snapshot = JSON.stringify(collabTransformer.fromYdoc(document, 'default'));
  } catch (e) {
    console.warn('[Collab] 快照转换失败，仅保存 Yjs 状态:', noteId, e.message);
  }

  await pool.query(
    `INSERT INTO collab_documents (note_id, y_state, snapshot_content, schema_version, updated_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (note_id) DO UPDATE SET
       y_state = EXCLUDED.y_state,
       snapshot_content = EXCLUDED.snapshot_content,
       updated_at = NOW()`,
    [noteId, state, snapshot]
  );

  if (snapshot) {
    await pool.query('UPDATE notes SET content = $1, updated_at = NOW() WHERE id = $2', [snapshot, noteId]);
  } else {
    await pool.query('UPDATE notes SET updated_at = NOW() WHERE id = $1', [noteId]);
  }
}

const collabServer = new HocuspocusServer({
  port: COLLAB_PORT,
  address: COLLAB_HOST,
  quiet: true,
  debounce: 1200,
  maxDebounce: 10000,
  async onAuthenticate({ token, documentName, connectionConfig }) {
    const userId = parseUserId(token);
    const noteId = noteIdFromDocumentName(documentName);
    if (!userId || !noteId) throw new Error('Unauthorized');
    const access = await getCollabAccess(noteId, userId);
    if (!access.canRead) throw new Error('Forbidden');
    connectionConfig.readOnly = !access.canWrite;
    const profile = await getUserProfile(userId);
    return {
      userId,
      noteId,
      permission: access.permission,
      canWrite: access.canWrite,
      displayName: profile?.display_name || profile?.email || userId.slice(0, 8),
    };
  },
  async beforeSync({ type, documentName, context }) {
    // y-protocol sync type 2 is a document update. Re-check dynamically so a
    // lock acquired after connection immediately makes old write sessions read-only.
    if (type !== 2) return;
    const noteId = noteIdFromDocumentName(documentName);
    const access = await getCollabAccess(noteId, context.userId);
    if (!access.canWrite) throw new Error('Readonly');
  },
  async onLoadDocument({ documentName, document }) {
    await loadCollabDocument(documentName, document);
  },
  async onStoreDocument({ documentName, document }) {
    await storeCollabDocument(documentName, document);
  },
});

// CORS 白名单
const ALLOWED_ORIGINS = CORS_ORIGIN === '*' ? null : CORS_ORIGIN.split(',').map(s => s.trim());

// 启动后端
const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const reqId = Math.random().toString(36).substring(2, 8);

  // 1. 设置 Header + CORS
  const origin = req.headers['origin'] || '';
  if (ALLOWED_ORIGINS) {
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    // 非 白名单 origin 不设置 CORS header
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Notebook-Api-Key, apikey, x-supabase-api-version, X-Client-Info');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return end(res, 200, {});

  // ================= SSE 端点 =================
  if ((req.url === '/api/events' || req.url === '/events' || req.url.startsWith('/api/events?') || req.url.startsWith('/events?')) && req.method === 'GET') {
    const sseToken = (req.headers['authorization'] || '').split(' ')[1] || new URL(req.url, 'http://localhost').searchParams.get('token');
    const sseUserId = parseUserId(sseToken);
    if (!sseUserId) return end(res, 401, { error: 'Unauthorized' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    sseAddClient(sseUserId, res);

    const heartbeat = setInterval(() => {
      try { res.write(':heartbeat\n\n'); } catch (e) { clearInterval(heartbeat); }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseRemoveClient(sseUserId, res);
      console.log(`[SSE] 用户 ${sseUserId.substring(0, 8)}... 断开`);
    });
    return;
  }

  // 2. 解析 Body（带大小限制）
  // multipart 上传需要保留原始请求流，交给对应处理器读取。
  let body;
  try {
    const contentType = req.headers['content-type'] || '';
    const isMultipartUpload = req.url === '/upload-image'
      && req.method === 'POST'
      && contentType.startsWith('multipart/form-data');
    body = isMultipartUpload ? {} : await getBody(req);
  } catch (e) {
    return end(res, 413, { error: 'Request body too large' });
  }

  const token = (req.headers['authorization'] || '').split(' ')[1];
  const userId = parseUserId(token);

  console.log(`[REQ #${reqId}] ${req.method} ${req.url} | User: ${userId ? userId.substring(0, 8) + '...' : 'Anon'}`);

  try {
    if (isNotebookApiRoute(req.url)) {
      return await handleNotebookApiReadRequest(req, res);
    }

    // ================= 3. 认证模块 (100% 本地) =================
    if (req.url.includes('/auth/v1/refresh') && req.method === 'POST') {
      if (!userId) {
        return end(res, 401, { error: 'Unauthorized' });
      }

      const { rows } = await pool.query('SELECT id, email, display_name FROM user_profiles WHERE id = $1', [userId]);
      if (!rows.length) {
        return end(res, 401, { error: 'Unauthorized' });
      }

      const refreshedToken = signJWT(rows[0]);
      return end(res, 200, {
        access_token: refreshedToken,
        token_type: 'bearer',
        expires_in: AUTH_TOKEN_TTL_SECONDS,
        user: {
          id: rows[0].id,
          email: rows[0].email,
          display_name: rows[0].display_name || rows[0].email.split('@')[0]
        }
      });
    }

    if (req.url.includes('/auth/v1/token') && req.method === 'POST') {
      const { email, password, grant_type } = body;

      if (grant_type === 'signup') {
        // 注册新用户（需要邮箱验证码）
        if (!email || !password) return end(res, 400, { error: 'Missing email or password' });
        if (password.length < 6) return end(res, 400, { error: 'Password too short (min 6)' });

        // 验证 verifyToken（邮箱验证码已通过）
        const verifiedKey = `verified_${email}_register`;
        const verifiedRecord = verificationCodes.get(verifiedKey);
        if (!verifiedRecord || verifiedRecord.token !== body.verifyToken || Date.now() > verifiedRecord.expires) {
          return end(res, 400, { error: '请先完成邮箱验证' });
        }
        verificationCodes.delete(verifiedKey);

        const existing = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [email]);
        if (existing.rows.length > 0) return end(res, 409, { error: 'User already exists' });

        const password_hash = await bcrypt.hash(password, 10);
        const display_name = body.display_name || email.split('@')[0];
        const insertResult = await pool.query(
          'INSERT INTO user_profiles (id, email, password_hash, display_name) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id, email, display_name',
          [email, password_hash, display_name]
        );
        const newUser = insertResult.rows[0];
        const newToken = signJWT(newUser);

        return end(res, 200, {
          access_token: newToken,
          token_type: 'bearer',
          expires_in: AUTH_TOKEN_TTL_SECONDS,
          user: { id: newUser.id, email: newUser.email, display_name: newUser.display_name || newUser.email.split('@')[0] }
        });
      }

      // 登录
      console.log(`[AUTH #${reqId}] 尝试本地登录: ${email}`);
      const { rows } = await pool.query('SELECT * FROM user_profiles WHERE email = $1', [email]);

      if (!rows.length) {
        console.log(`[AUTH #${reqId}] 失败: 用户不存在`);
        return end(res, 400, { error: 'Invalid credentials' });
      }
      if (!rows[0].password_hash) {
        console.log(`[AUTH #${reqId}] 失败: 用户无本地密码（Supabase 迁移用户）`);
        return end(res, 400, { error: 'No local password', hint: '请点击"忘记密码"通过邮箱验证设置新密码' });
      }

      const valid = await bcrypt.compare(password, rows[0].password_hash);
      if (!valid) {
        console.log(`[AUTH #${reqId}] 失败: 密码错误`);
        return end(res, 400, { error: 'Invalid credentials' });
      }

      const jwtToken = signJWT(rows[0]);
      console.log(`[AUTH #${reqId}] 成功: 签发 Token`);

      return end(res, 200, {
        access_token: jwtToken,
        token_type: 'bearer',
        expires_in: AUTH_TOKEN_TTL_SECONDS,
        user: { id: rows[0].id, email: rows[0].email, display_name: rows[0].display_name || rows[0].email.split('@')[0] }
      });
    }

    // 兼容 SDK 的其他认证请求
    if (req.url.includes('/auth/v1/')) {
      if (userId) {
        // 返回用户信息
        const { rows } = await pool.query('SELECT id, email, display_name FROM user_profiles WHERE id = $1', [userId]);
        if (rows.length) return end(res, 200, { id: rows[0].id, email: rows[0].email, display_name: rows[0].display_name });
        return end(res, 200, { id: userId, email: 'local_user' });
      }
      return end(res, 401, { error: 'Unauthorized' });
    }

    // ================= 验证码接口（无需登录） =================
    // 邮箱服务商检测（无需登录）
    if ((req.url === '/email/detect-provider' || req.url === '/api/email/detect-provider') && req.method === 'POST') {
      try {
        const email = body?.email;
        const provider = emailService.detectProvider(email);
        return end(res, 200, { success: true, provider });
      } catch (e) {
        return end(res, 200, { success: false, error: e.message });
      }
    }

    // 发送验证码
    if ((req.url === '/send-code' || req.url === '/api/send-code') && req.method === 'POST') {
      const { email, purpose } = body; // purpose: 'register' | 'reset-password'
      if (!email) return end(res, 400, { error: '请提供邮箱地址' });
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return end(res, 400, { error: '邮箱格式不正确' });
      if (!purpose || !['register', 'reset-password'].includes(purpose)) {
        return end(res, 400, { error: '无效的验证用途' });
      }

      // 注册时检查邮箱是否已存在
      if (purpose === 'register') {
        const existing = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [email]);
        if (existing.rows.length > 0) return end(res, 409, { error: '该邮箱已注册' });
      }
      // 重置密码时检查邮箱是否存在
      if (purpose === 'reset-password') {
        const existing = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [email]);
        if (existing.rows.length === 0) return end(res, 404, { error: '该邮箱未注册' });
      }

      // 发送冷却检查（按 email_purpose 分别冷却）
      const cooldownKey = `${email}_${purpose}`;
      const lastSendTime = SEND_COOLDOWNS.get(cooldownKey);
      if (lastSendTime && Date.now() - lastSendTime < CODE_COOLDOWN) {
        const remaining = Math.ceil((CODE_COOLDOWN - (Date.now() - lastSendTime)) / 1000);
        return end(res, 429, { error: `请${remaining}秒后再试`, remaining });
      }

      // 生成 6 位数字验证码
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const key = `${email}_${purpose}`;
      verificationCodes.set(key, { code, expires: Date.now() + CODE_TTL, attempts: 0 });
      SEND_COOLDOWNS.set(cooldownKey, Date.now());

      // 发送邮件
      const purposeText = purpose === 'register' ? '注册账号' : '重置密码';
      try {
        await mailTransporter.sendMail({
          from: `"彩云笔记" <${SMTP_CONFIG.auth.user}>`,
          to: email,
          subject: `【彩云笔记】${purposeText}验证码`,
          html: `
            <div style="max-width:480px;margin:0 auto;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <div style="text-align:center;margin-bottom:24px;">
                <h1 style="color:#4F46E5;font-size:24px;margin:0;">彩云笔记</h1>
                <p style="color:#6B7280;font-size:14px;margin-top:4px;">邮箱验证</p>
              </div>
              <div style="background:#F9FAFB;border-radius:12px;padding:24px;text-align:center;">
                <p style="color:#374151;font-size:14px;margin:0 0 12px;">您正在进行 <strong>${purposeText}</strong> 操作，验证码为：</p>
                <div style="font-size:36px;font-weight:bold;color:#4F46E5;letter-spacing:8px;margin:16px 0;">${code}</div>
                <p style="color:#9CA3AF;font-size:12px;margin:8px 0 0;">验证码 5 分钟内有效，请勿泄露给他人</p>
              </div>
              <p style="color:#9CA3AF;font-size:12px;text-align:center;margin-top:24px;">如果这不是您的操作，请忽略此邮件</p>
            </div>
          `
        });
        console.log(`[EMAIL] 验证码已发送: ${email} (${purpose})`);
        return end(res, 200, { success: true, message: '验证码已发送' });
      } catch (e) {
        console.error(`[EMAIL] 发送失败:`, e.message);
        verificationCodes.delete(key);
        SEND_COOLDOWNS.delete(cooldownKey);
        return end(res, 500, { error: '邮件发送失败，请稍后重试' });
      }
    }

    // 验证验证码（内部辅助，也作为独立接口）
    if ((req.url === '/verify-code' || req.url === '/api/verify-code') && req.method === 'POST') {
      const { email, code, purpose } = body;
      if (!email || !code || !purpose) return end(res, 400, { error: '参数不完整' });
      const key = `${email}_${purpose}`;
      const record = verificationCodes.get(key);
      if (!record) return end(res, 400, { error: '验证码不存在或已过期，请重新获取' });
      if (Date.now() > record.expires) {
        verificationCodes.delete(key);
        return end(res, 400, { error: '验证码已过期，请重新获取' });
      }
      if (record.attempts >= CODE_MAX_ATTEMPTS) {
        verificationCodes.delete(key);
        return end(res, 400, { error: '验证次数过多，请重新获取验证码' });
      }
      record.attempts++;
      if (record.code !== String(code)) {
        return end(res, 400, { error: `验证码错误（剩余 ${CODE_MAX_ATTEMPTS - record.attempts} 次机会）` });
      }
      // 验证成功，删除验证码
      verificationCodes.delete(key);
      // 生成一个临时 token 用于注册/重置密码时的二次确认
      const verifyToken = crypto.randomBytes(16).toString('hex');
      verificationCodes.set(`verified_${email}_${purpose}`, { token: verifyToken, expires: Date.now() + 10 * 60 * 1000 });
      return end(res, 200, { success: true, verifyToken });
    }

    // 重置密码
    if ((req.url === '/reset-password' || req.url === '/api/reset-password') && req.method === 'POST') {
      const { email, newPassword, verifyToken } = body;
      if (!email || !newPassword || !verifyToken) return end(res, 400, { error: '参数不完整' });
      if (newPassword.length < 6) return end(res, 400, { error: '密码至少需要6位' });

      // 验证 verifyToken
      const verifiedKey = `verified_${email}_reset-password`;
      const verifiedRecord = verificationCodes.get(verifiedKey);
      if (!verifiedRecord || verifiedRecord.token !== verifyToken || Date.now() > verifiedRecord.expires) {
        return end(res, 400, { error: '验证已失效，请重新验证邮箱' });
      }
      verificationCodes.delete(verifiedKey);

      // 更新密码
      const password_hash = await bcrypt.hash(newPassword, 10);
      const result = await pool.query('UPDATE user_profiles SET password_hash = $1 WHERE email = $2 RETURNING id', [password_hash, email]);
      if (result.rows.length === 0) return end(res, 404, { error: '用户不存在' });

      console.log(`[AUTH] 密码重置成功: ${email}`);
      return end(res, 200, { success: true, message: '密码重置成功' });
    }

    // 免认证路径
    const PUBLIC_PATHS = ['/health', '/onedrive/callback', '/baidu/callback'];
    if (PUBLIC_PATHS.some(p => req.url.includes(p))) {
      if (req.url === '/health') return end(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      // /onedrive/callback 继续向下执行（在下面的路由中处理）
    } else if (!userId) {
      return end(res, 401, { error: 'Unauthorized' });
    }

    // ================= 4. 数据模块 (全链路日志) =================
    const queryAndLog = async (sql, params) => {
      const start = Date.now();
      try {
        const result = await pool.query(sql, params);
        console.log(`[DB #${reqId}] ✅ ${sql.substring(0, 50)}... (${Date.now() - start}ms)`);
        return result;
      } catch (e) {
        console.error(`[DB #${reqId}] ❌ ${e.message}`);
        throw e;
      }
    };

    if (req.url.includes('/org-plan')) {
      const ownerEmail = ADMIN_EMAIL;
      const userProfile = await pool.query('SELECT email, display_name FROM user_profiles WHERE id = $1', [userId]);
      const isOwner = userProfile.rows[0]?.email === ownerEmail;
      try {
        if (body.action === 'status') {
          return end(res, 200, { success: true, data: await jiangsuOrgNotebook.getStatus(pool) });
        }
        if (body.action === 'sync') {
          if (!isOwner) return end(res, 403, { success: false, error: '只有江苏公司笔记本所有者可以同步' });
          const result = await jiangsuOrgNotebook.syncJiangsuOrgNotebook(pool, { ownerEmail, hcmDate: body.hcmDate });
          sseBroadcast(ORG_PLAN_NOTEBOOK_ID, { type: 'note_updated', notebookId: ORG_PLAN_NOTEBOOK_ID, reason: 'org_plan_synced' }, userId).catch(() => {});
          return end(res, 200, { success: true, data: result });
        }
        if (body.action === 'binding') {
          return end(res, 200, { success: true, data: await jiangsuOrgNotebook.getBinding(pool, userId) });
        }
        if (body.action === 'sendIdentityCode') {
          return end(res, 200, { success: true, data: await jiangsuOrgNotebook.sendIdentityCode(pool, userId, body) });
        }
        if (body.action === 'verifyIdentityCode') {
          return end(res, 200, { success: true, data: await jiangsuOrgNotebook.verifyIdentityCode(pool, userId, body) });
        }
        if (body.action === 'listTabs') {
          if (!body.noteId) return end(res, 400, { success: false, error: 'Missing noteId' });
          const access = await getNotebookAccessLevelForUser(userId, body.noteId);
          if (access.access === 'none') return end(res, 403, { success: false, error: 'Forbidden' });
          return end(res, 200, { success: true, data: await jiangsuOrgNotebook.listTabs(pool, userId, body.noteId, ownerEmail) });
        }
        if (body.action === 'getTabContent') {
          if (!body.assignmentId) return end(res, 400, { success: false, error: 'Missing assignmentId' });
          return end(res, 200, { success: true, data: await jiangsuOrgNotebook.getTabContent(pool, userId, body.assignmentId, ownerEmail) });
        }
        if (body.action === 'saveTabContent') {
          if (!body.assignmentId) return end(res, 400, { success: false, error: 'Missing assignmentId' });
          const result = await jiangsuOrgNotebook.saveTabContent(pool, userId, body.assignmentId, body.content, ownerEmail);
          sseBroadcast(ORG_PLAN_NOTEBOOK_ID, { type: 'note_updated', noteId: body.noteId, notebookId: ORG_PLAN_NOTEBOOK_ID, reason: 'org_plan_tab_saved' }, userId).catch(() => {});
          return end(res, 200, { success: true, data: result });
        }
        if (body.action === 'lockTab') {
          return end(res, 200, { success: true, data: await jiangsuOrgNotebook.lockTab(pool, userId, body.assignmentId, body.userName || userProfile.rows[0]?.display_name || '', ownerEmail) });
        }
        if (body.action === 'unlockTab') {
          return end(res, 200, { success: true, data: await jiangsuOrgNotebook.unlockTab(pool, userId, body.assignmentId, ownerEmail) });
        }
        return end(res, 400, { success: false, error: 'Unknown org-plan action' });
      } catch (error) {
        return end(res, error.statusCode || 500, { success: false, error: error.message });
      }
    };

    if (req.url.includes('/courseware')) {
      try {
        const access = await getNotebookAccessLevelForUser(userId, ORG_PLAN_NOTEBOOK_ID);
        if (access.access === 'none') return end(res, 403, { success: false, error: 'Forbidden' });
        const config = coursewareOss.getCoursewareConfigFromEnv();
        if (!config.accessKeyId || !config.accessKeySecret) {
          return end(res, 500, { success: false, error: 'OSS 课件存储未配置' });
        }
        if (body.action === 'list') {
          const data = await coursewareOss.listCoursewareObjects(config, {
            prefix: body.prefix || '',
            marker: body.marker || '',
            maxKeys: body.maxKeys || 1000,
            recursive: body.recursive !== false,
          });
          return end(res, 200, { success: true, data });
        }
        if (body.action === 'download') {
          const key = String(body.key || '').replace(/^\/+/, '');
          const basePrefix = coursewareOss.normalizeCoursewarePrefix(config.basePrefix || '');
          if (!key || !key.startsWith(basePrefix)) {
            return end(res, 400, { success: false, error: '非法课件路径' });
          }
          const url = coursewareOss.buildSignedOssUrl(config, key, {
            expiresAt: Math.floor(Date.now() / 1000) + 300,
          });
          return end(res, 200, { success: true, data: { url, expiresIn: 300 } });
        }
        return end(res, 400, { success: false, error: 'Unknown courseware action' });
      } catch (error) {
        return end(res, error.statusCode || 500, { success: false, error: error.message });
      }
    }

    if (req.url.includes('/notebook-api-manage') && req.method === 'POST') {
      const { action, notebookId, tokenId, name, expiresDays } = body || {};
      if (!action) return end(res, 400, { success: false, error: 'Missing action' });

      if (action === 'createToken') {
        if (!notebookId) return end(res, 400, { success: false, error: 'Missing notebookId' });
        const access = await getNotebookAccessLevelForUser(userId, notebookId);
        if (access.access === 'none') return end(res, 403, { success: false, error: 'Forbidden' });
        const issued = createNotebookApiToken(name);
        const days = Number(expiresDays || NOTEBOOK_API_DEFAULT_EXPIRES_DAYS);
        const expiresAt = Number.isFinite(days) && days > 0
          ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
          : null;
        const id = generateId();
        await pool.query(
          `INSERT INTO notebook_api_tokens (id, notebook_id, creator_user_id, name, token_hash, token_prefix, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, notebookId, userId, issued.name, issued.hash, issued.prefix, expiresAt]
        );
        return end(res, 200, {
          success: true,
          data: {
            id,
            token: issued.token,
            token_prefix: issued.prefix,
            name: issued.name,
            expires_at: expiresAt,
          },
        });
      }

      if (action === 'listTokens') {
        if (!notebookId) return end(res, 400, { success: false, error: 'Missing notebookId' });
        const access = await getNotebookAccessLevelForUser(userId, notebookId);
        if (access.access === 'none') return end(res, 403, { success: false, error: 'Forbidden' });
        const params = [notebookId];
        let creatorFilter = '';
        if (!access.isOwner) {
          params.push(userId);
          creatorFilter = ` AND k.creator_user_id = $${params.length}`;
        }
        const { rows } = await pool.query(
          `SELECT k.id, k.notebook_id, k.creator_user_id, k.name, k.token_prefix, k.expires_at,
                  k.revoked_at, k.last_used_at, k.created_at, up.email, up.display_name
           FROM notebook_api_tokens k
           LEFT JOIN user_profiles up ON up.id = k.creator_user_id
           WHERE k.notebook_id = $1${creatorFilter}
           ORDER BY k.created_at DESC`,
          params
        );
        return end(res, 200, { success: true, data: rows });
      }

      if (action === 'revokeToken') {
        if (!tokenId) return end(res, 400, { success: false, error: 'Missing tokenId' });
        const { rows } = await pool.query('SELECT * FROM notebook_api_tokens WHERE id = $1', [tokenId]);
        if (!rows.length) return end(res, 404, { success: false, error: 'Token not found' });
        const target = rows[0];
        const access = await getNotebookAccessLevelForUser(userId, target.notebook_id);
        if (!access.isOwner && target.creator_user_id !== userId) {
          return end(res, 403, { success: false, error: 'Forbidden' });
        }
        await pool.query('UPDATE notebook_api_tokens SET revoked_at = NOW() WHERE id = $1', [tokenId]);
        return end(res, 200, { success: true });
      }

      return end(res, 400, { success: false, error: 'Unknown action' });
    }

    if (notebookApiPath(req.url) === '/anyshare/check' && req.method === 'GET') {
      const { rows } = await pool.query('SELECT user_id, base_url, client_id, root_docid, root_name, updated_at FROM anyshare_accounts WHERE user_id = $1', [userId]);
      return end(res, 200, { bound: rows.length > 0, account: rows[0] ? maskAnyShareAccount(rows[0]) : null });
    }

    if (req.url.includes('/anyshare/save') && req.method === 'POST') {
      const baseUrl = normalizeAnyShareBaseUrl(body.base_url);
      const clientId = String(body.client_id || '').trim();
      const clientSecret = String(body.client_secret || '').trim();
      const rootDocid = String(body.root_docid || '').trim();
      const rootName = String(body.root_name || '').trim();
      if (!baseUrl || !clientId || !clientSecret || !rootDocid) {
        return end(res, 400, { success: false, error: '请填写 API 地址、Client ID、Client Secret 和根文档库 docid' });
      }
      if (!isAnyShareDocidSafe(rootDocid)) {
        return end(res, 400, { success: false, error: 'AnyShare 根文档库 docid 必须是 gns:// 开头' });
      }
      const account = { user_id: userId, base_url: baseUrl, client_id: clientId, client_secret: clientSecret, root_docid: rootDocid, root_name: rootName };
      if (body.skip_test !== true) {
        await listAnyShareDocLibs(account);
      }
      await pool.query(
        `INSERT INTO anyshare_accounts (user_id, base_url, client_id, client_secret, root_docid, root_name, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           base_url = EXCLUDED.base_url,
           client_id = EXCLUDED.client_id,
           client_secret = EXCLUDED.client_secret,
           root_docid = EXCLUDED.root_docid,
           root_name = EXCLUDED.root_name,
           updated_at = NOW()`,
        [userId, baseUrl, clientId, clientSecret, rootDocid, rootName || null]
      );
      return end(res, 200, { success: true, account: maskAnyShareAccount(account) });
    }

    if (req.url.includes('/anyshare/doc-libs') && (req.method === 'GET' || req.method === 'POST')) {
      let account;
      if (body?.base_url && body?.client_id && body?.client_secret) {
        account = {
          base_url: normalizeAnyShareBaseUrl(body.base_url),
          client_id: String(body.client_id || '').trim(),
          client_secret: String(body.client_secret || '').trim(),
        };
      } else {
        const { rows } = await pool.query('SELECT * FROM anyshare_accounts WHERE user_id = $1', [userId]);
        if (!rows.length) return end(res, 400, { success: false, error: '请先填写或保存 AnyShare 配置' });
        account = rows[0];
      }
      const libs = await listAnyShareDocLibs(account);
      return end(res, 200, { success: true, data: libs });
    }

    if (req.url.includes('/anyshare/test') && req.method === 'POST') {
      const account = body?.base_url && body?.client_id && body?.client_secret
        ? {
          base_url: normalizeAnyShareBaseUrl(body.base_url),
          client_id: String(body.client_id || '').trim(),
          client_secret: String(body.client_secret || '').trim(),
        }
        : (await pool.query('SELECT * FROM anyshare_accounts WHERE user_id = $1', [userId])).rows[0];
      if (!account) return end(res, 400, { success: false, error: 'AnyShare 未配置' });
      const libs = await listAnyShareDocLibs(account);
      return end(res, 200, { success: true, message: '连接成功', doc_libs_count: libs.length, data: libs.slice(0, 10) });
    }

    if (req.url.includes('/anyshare/unbind') && req.method === 'POST') {
      await pool.query('DELETE FROM anyshare_accounts WHERE user_id = $1', [userId]);
      return end(res, 200, { success: true });
    }

    if (req.url.includes('/anyshare/check-notebook') && !req.url.includes('/anyshare/check-notebooks-batch')) {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const noteId = urlObj.searchParams.get('note_id');
      if (!noteId) return end(res, 400, { error: '缺少 note_id' });
      const notebookOwnerId = await getNotebookOwnerIdForNote(noteId);
      if (!notebookOwnerId) return end(res, 404, { error: '笔记不存在' });
      const accessInfo = await getNotebookAccessLevelForUser(userId, noteId);
      if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });
      const { rows } = await pool.query('SELECT 1 FROM anyshare_accounts WHERE user_id = $1', [notebookOwnerId]);
      return end(res, 200, { bound: rows.length > 0, is_owner: accessInfo.isOwner, access: accessInfo.access });
    }

    if (req.url.includes('/anyshare/check-notebooks-batch')) {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const idsParam = urlObj.searchParams.get('notebook_ids');
      if (!idsParam) return end(res, 400, { error: '缺少 notebook_ids' });
      const notebookIds = idsParam.split(',').filter(Boolean);
      const results = [];
      for (const nid of notebookIds) {
        const ownerId = await getNotebookOwnerIdForNote(nid);
        if (!ownerId) { results.push({ notebook_id: nid, bound: false }); continue; }
        const { rows } = await pool.query('SELECT 1 FROM anyshare_accounts WHERE user_id = $1', [ownerId]);
        results.push({ notebook_id: nid, bound: rows.length > 0 });
      }
      return end(res, 200, { data: results });
    }

    if (req.url.includes('/anyshare/upload') && req.method === 'POST') {
      const { note_id, file_name, file_content } = body || {};
      if (!note_id || !file_name || !file_content) return end(res, 400, { error: '缺少 note_id、file_name 或 file_content' });
      const notebookOwnerId = await getNotebookOwnerIdForNote(note_id);
      if (!notebookOwnerId) return end(res, 404, { error: '笔记不存在' });
      const accessInfo = await getNotebookAccessLevelForUser(userId, note_id);
      if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });
      if (accessInfo.access === 'view') return end(res, 403, { error: '只有查看权限，无法上传附件' });
      const { rows: accounts } = await pool.query('SELECT * FROM anyshare_accounts WHERE user_id = $1', [notebookOwnerId]);
      if (!accounts.length) return end(res, 400, { error: '该笔记本所有者未绑定 AnyShare', needBind: true });
      const account = accounts[0];
      const dir = await createAnyShareDir(account, account.root_docid, `彩云笔记/${note_id}`);
      const binaryContent = Buffer.from(file_content, 'base64');
      const mimeType = getMimeType(file_name);
      const uploadResult = await uploadAnyShareFile(account, dir.docid, file_name, binaryContent);
      const attachId = generateId();
      await pool.query(
        `INSERT INTO attachments (id, note_id, user_id, file_name, file_size, mime_type, onedrive_path, onedrive_file_id, folder_name, folder_path, category, storage_provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'anyshare')`,
        [attachId, note_id, notebookOwnerId, file_name, binaryContent.length, mimeType, uploadResult.docid, uploadResult.docid, '根目录', '/', getCategory(mimeType)]
      );
      const attachNb = await pool.query('SELECT root_notebook_id FROM notes WHERE id = $1', [note_id]);
      if (attachNb.rows[0]?.root_notebook_id) {
        sseBroadcast(attachNb.rows[0].root_notebook_id, { type: 'note_updated', noteId: note_id, updatedBy: userId, notebookId: attachNb.rows[0].root_notebook_id, reason: 'attachment_changed' }, userId).catch(() => {});
      }
      return end(res, 200, { success: true, data: { id: attachId, file_name, file_size: binaryContent.length, mime_type: mimeType, onedrive_path: uploadResult.docid, onedrive_file_id: uploadResult.docid, category: getCategory(mimeType), storage_provider: 'anyshare' } });
    }

    if (req.url.includes('/anyshare/download')) {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const attachmentId = urlObj.searchParams.get('attachment_id');
      if (!attachmentId) return end(res, 400, { error: '缺少 attachment_id' });
      const { rows } = await pool.query('SELECT * FROM attachments WHERE id = $1 AND storage_provider = $2', [attachmentId, 'anyshare']);
      if (!rows.length) return end(res, 404, { error: '附件不存在' });
      const att = rows[0];
      if (att.note_id) {
        const accessInfo = await getNotebookAccessLevelForUser(userId, att.note_id);
        if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该附件' });
      } else if (att.user_id !== userId) {
        return end(res, 403, { error: '无权访问该附件' });
      }
      const content = await downloadAnyShareAttachmentBuffer(att);
      res.writeHead(200, {
        'Content-Type': att.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(att.file_name)}"`,
        'Content-Length': content.length,
      });
      return res.end(content);
    }

    if (req.url.includes('/anyshare/list')) {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const noteId = urlObj.searchParams.get('note_id');
      if (noteId) {
        const accessInfo = await getNotebookAccessLevelForUser(userId, noteId);
        if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });
        const { rows } = await pool.query('SELECT * FROM attachments WHERE note_id = $1 AND storage_provider = $2 ORDER BY created_at DESC', [noteId, 'anyshare']);
        return end(res, 200, { success: true, data: rows });
      }
      const { rows } = await pool.query('SELECT * FROM attachments WHERE user_id = $1 AND storage_provider = $2 ORDER BY created_at DESC', [userId, 'anyshare']);
      return end(res, 200, { success: true, data: rows });
    }

    if (req.url.includes('/anyshare/delete') && req.method === 'POST') {
      const { attachment_id } = body || {};
      if (!attachment_id) return end(res, 400, { error: '缺少 attachment_id' });
      const { rows } = await pool.query('SELECT * FROM attachments WHERE id = $1 AND storage_provider = $2', [attachment_id, 'anyshare']);
      if (!rows.length) return end(res, 404, { error: '附件不存在' });
      const att = rows[0];
      if (att.note_id) {
        const accessInfo = await getNotebookAccessLevelForUser(userId, att.note_id);
        if (accessInfo.access !== 'edit') return end(res, 403, { error: '无权删除该附件' });
      } else if (att.user_id !== userId) {
        return end(res, 403, { error: '无权删除该附件' });
      }
      const { rows: accounts } = await pool.query('SELECT * FROM anyshare_accounts WHERE user_id = $1', [att.user_id]);
      if (!accounts.length) return end(res, 400, { error: '附件所有者未绑定 AnyShare' });
      await deleteAnyShareFile(accounts[0], att.onedrive_file_id || att.onedrive_path);
      await pool.query('DELETE FROM attachments WHERE id = $1', [attachment_id]);
      if (att.note_id) {
        const delAttachNb = await pool.query('SELECT root_notebook_id FROM notes WHERE id = $1', [att.note_id]);
        if (delAttachNb.rows[0]?.root_notebook_id) {
          sseBroadcast(delAttachNb.rows[0].root_notebook_id, { type: 'note_updated', noteId: att.note_id, updatedBy: userId, notebookId: delAttachNb.rows[0].root_notebook_id, reason: 'attachment_changed' }, userId).catch(() => {});
        }
      }
      return end(res, 200, { success: true });
    }

    if (req.url.includes('/collab-config')) {
      const { noteId } = body;
      if (!noteId) return end(res, 400, { success: false, error: 'Missing noteId' });
      const access = await getCollabAccess(noteId, userId);
      if (!access.canRead) return end(res, 403, { success: false, error: 'Forbidden' });
      const profile = await getUserProfile(userId);
      const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
      const originHeader = req.headers['origin'] || req.headers['referer'] || '';
      const forwardedHost = (req.headers['x-forwarded-host'] || '').split(',')[0].trim();
      let browserHost = '';
      try {
        browserHost = originHeader ? new URL(originHeader).host : '';
      } catch (_) {
        browserHost = '';
      }
      const host = browserHost || forwardedHost || req.headers['host'] || `127.0.0.1:${COLLAB_PORT}`;
      const cfVisitor = typeof req.headers['cf-visitor'] === 'string' ? req.headers['cf-visitor'] : '';
      const isSecure = forwardedProto === 'https'
        || req.headers['x-forwarded-ssl'] === 'on'
        || cfVisitor.includes('"scheme":"https"')
        || host === 'notes.binapp.top';
      const wsHost = host.includes(':5173') ? host.replace(':5173', `:${COLLAB_PORT}`) : host;
      return end(res, 200, {
        success: true,
        data: {
          documentName: `note:${noteId}`,
          wsUrl: `${isSecure ? 'wss' : 'ws'}://${wsHost}/collab`,
          permission: access.canWrite ? 'write' : 'read',
          lockedBy: access.lockedBy,
          lockedByName: access.lockedByName,
          user: {
            id: userId,
            name: profile?.display_name || profile?.email || userId.slice(0, 8),
          },
        },
      });
    }

    // 权限检查辅助：验证用户是否有权操作某笔记
    const checkNoteAccess = async (noteId, requiredOwner = true) => {
      const { rows } = await pool.query(
        `SELECT n.owner_id, n.root_notebook_id, root.owner_id AS root_owner_id
         FROM notes n
         LEFT JOIN notes root ON root.id = COALESCE(n.root_notebook_id, n.id)
         WHERE n.id = $1`,
        [noteId]
      );
      if (!rows.length) return false;
      if (rows[0].owner_id === userId || rows[0].root_owner_id === userId) return true;
      if (!requiredOwner) {
        // 通过 root_notebook_id 查共享权限
        const rootId = rows[0].root_notebook_id || noteId;
        const shareCheck = await pool.query(
          `SELECT 1 FROM note_shares WHERE notebook_id = $1 AND user_id = $2 LIMIT 1`,
          [rootId, userId]
        );
        return shareCheck.rows.length > 0;
      }
      return false;
    };

    const isJiangsuOrgStructureNote = (note) => {
      if (!note) return false;
      return note.id === ORG_PLAN_NOTEBOOK_ID ||
        note.root_notebook_id === ORG_PLAN_NOTEBOOK_ID ||
        isProtectedOrgNoteContent(note.content);
    };

    // [云存储切换] 设置笔记本的云存储提供商
    if (req.url.includes('/notes-query') && body.action === 'setCloudProvider') {
      const { notebook_id, provider } = body;
      if (!notebook_id) return end(res, 400, { error: 'Missing notebook_id' });
      // 权限检查：只有笔记本所有者可以设置
      const nb = await pool.query('SELECT owner_id FROM notes WHERE id = $1', [notebook_id]);
      if (!nb.rows.length || nb.rows[0].owner_id !== userId) {
        return end(res, 403, { error: 'Forbidden: only owner can set' });
      }
      await pool.query('UPDATE notes SET cloud_provider = $1 WHERE id = $2', [provider || null, notebook_id]);
      return end(res, 200, { success: true });
    }

    // [云存储切换] 获取笔记本的云存储提供商
    if (req.url.includes('/notes-query') && body.action === 'getCloudProvider') {
      const { notebook_id } = body;
      if (!notebook_id) return end(res, 400, { error: 'Missing notebook_id' });
      const { rows } = await pool.query('SELECT cloud_provider FROM notes WHERE id = $1', [notebook_id]);
      return end(res, 200, { success: true, data: { cloud_provider: rows[0]?.cloud_provider || null } });
    }

    // [获取笔记]
    if (req.url.includes('/notes-query')) {
      if (body.action === 'loadFullTree') {
        // 使用 root_notebook_id 查询子树（对齐 Supabase Edge Function 逻辑）
        // 1. 自己拥有的笔记本 + 共享给自己的笔记本
        // 2. 用 root_notebook_id IN (...) 查出所有子节点（无论 owner_id 是谁）
        const { rows } = await queryAndLog(
          `SELECT DISTINCT n.* FROM notes n
           WHERE n.root_notebook_id IN (
             SELECT id FROM notes WHERE owner_id = $1 AND type IN ('notebook', 'email_notebook')
             UNION
             SELECT notebook_id FROM note_shares WHERE user_id = $1
           )
           OR n.id IN (
             SELECT id FROM notes WHERE owner_id = $1 AND type IN ('notebook', 'email_notebook')
             UNION
             SELECT notebook_id FROM note_shares WHERE user_id = $1
           )
           ORDER BY n.order_index ASC`,
          [userId]
        );
        console.log(`[NOTES #${reqId}] 加载了 ${rows.length} 条笔记`);
        return end(res, 200, { success: true, data: rows });
      }
      if (body.action === 'getNoteById') {
        const { rows } = await queryAndLog('SELECT * FROM notes WHERE id = $1', [body.noteId]);
        if (!rows.length) return end(res, 404, { success: false, error: 'Note not found' });
        // 权限检查：必须拥有者或共享用户
        if (rows[0].owner_id !== userId) {
          const hasAccess = await checkNoteAccess(body.noteId, false);
          if (!hasAccess) return end(res, 403, { error: 'Forbidden' });
        }
        return end(res, 200, { success: true, data: rows[0] });
      }
      if (body.action === 'getChangedNotes') {
        const since = body.since || body.updatedSince;
        if (!since) return end(res, 400, { success: false, error: 'Missing since parameter' });
        const { rows } = await queryAndLog(
          `SELECT DISTINCT n.* FROM notes n
           WHERE (
             n.root_notebook_id IN (
               SELECT id FROM notes WHERE owner_id = $1 AND type IN ('notebook', 'email_notebook')
               UNION
               SELECT notebook_id FROM note_shares WHERE user_id = $1
             )
             OR n.id IN (
               SELECT id FROM notes WHERE owner_id = $1 AND type IN ('notebook', 'email_notebook')
               UNION
               SELECT notebook_id FROM note_shares WHERE user_id = $1
             )
           )
           AND n.updated_at > $2
           ORDER BY n.updated_at ASC`,
          [userId, since]
        );
        return end(res, 200, { success: true, data: rows });
      }
      // 侧边栏状态：保存
      if (body.action === 'saveSidebarState') {
        const expanded = JSON.stringify(body.expandedNodes || []);
        const selected = body.selectedNoteId || null;
        await pool.query(
          `INSERT INTO user_settings (user_id, key, value) VALUES ($1, 'sidebarState', $2)
           ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [userId, JSON.stringify({ expandedNodes: body.expandedNodes || [], selectedNoteId: selected })]
        );
        return end(res, 200, { success: true, data: {} });
      }
      // 侧边栏状态：加载
      if (body.action === 'loadSidebarState') {
        const { rows } = await pool.query(
          `SELECT value FROM user_settings WHERE user_id = $1 AND key = 'sidebarState'`,
          [userId]
        );
        if (rows.length > 0 && rows[0].value) {
          try {
            const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
            return end(res, 200, { success: true, data: parsed });
          } catch (e) { /* fall through */ }
        }
        return end(res, 200, { success: true, data: {} });
      }
      return end(res, 200, { success: true, data: {} });
    }

    // [保存/更新笔记]
    if (req.url.includes('/notes-write') && (body.action === 'saveNote' || body.note)) {
      const n = body.note || body;
      let existingOwnerId = userId;
      let rootNotebookId = n.root_notebook_id || n.rootNotebookId || null;
      let existingType = n.type;
      let existingContent = '';
      let hasCollabDocument = false;
      if (n.id) {
        const existing = await pool.query('SELECT id, owner_id, root_notebook_id, type, is_locked, locked_by, content FROM notes WHERE id = $1', [n.id]);
        if (existing.rows.length > 0) {
          if (isJiangsuOrgStructureNote(existing.rows[0]) && body.orgPlanSystemWrite !== true) {
            return end(res, 403, { success: false, error: '江苏公司笔记本结构由 HCM 自动维护，不能手动修改' });
          }
          existingOwnerId = existing.rows[0].owner_id;
          existingType = existing.rows[0].type || n.type;
          existingContent = existing.rows[0].content || '';
          const collab = await pool.query('SELECT 1 FROM collab_documents WHERE note_id = $1 LIMIT 1', [n.id]);
          hasCollabDocument = collab.rows.length > 0;
          if (!rootNotebookId && existing.rows[0].root_notebook_id) {
            rootNotebookId = existing.rows[0].root_notebook_id;
          }
          if ((n.type || existing.rows[0].type) === 'page' &&
              !hasCollabDocument &&
              isEmptyNoteContent(n.content) &&
              hasMeaningfulNoteContent(existing.rows[0].content) &&
              body.allowEmptyOverwrite !== true) {
            return end(res, 409, { success: false, error: 'EMPTY_CONTENT_OVERWRITE_BLOCKED' });
          }
          // 锁检查：被他人锁定的页面不可保存（owner 除外）
          if (existing.rows[0].is_locked && existing.rows[0].locked_by && existing.rows[0].locked_by !== userId) {
            const isOwner = existingOwnerId === userId;
            if (!isOwner) {
              const lockerName = await pool.query('SELECT display_name, email FROM user_profiles WHERE id = $1', [existing.rows[0].locked_by]);
              return end(res, 423, { success: false, error: 'PAGE_LOCKED_BY_OTHER', lockedBy: existing.rows[0].locked_by, lockedByName: lockerName.rows[0]?.display_name || lockerName.rows[0]?.email || '未知用户' });
            }
          }
        }
        // 权限检查：已存在的笔记只有拥有者或共享用户可编辑
        if (existing.rows.length > 0 && existing.rows[0].owner_id !== userId) {
          const hasAccess = await checkNoteAccess(n.id, false);
          if (!hasAccess) return end(res, 403, { error: 'Forbidden: not your note' });
        }
      }
      const saveContent = hasCollabDocument && (n.type || existingType) === 'page'
        ? existingContent
        : (n.content || '');
      // 计算 root_notebook_id（新笔记时）
      if (n.type === 'notebook' || n.type === 'email_notebook') {
        rootNotebookId = n.id;
      } else if (!rootNotebookId && (n.parent_id || n.parentId)) {
        const parentId = n.parent_id || n.parentId;
        const parent = await pool.query('SELECT id, root_notebook_id, type, content FROM notes WHERE id = $1', [parentId]);
        if (parent.rows.length > 0) {
          rootNotebookId = parent.rows[0].root_notebook_id || parentId;
        }
      }
      if ((n.id === ORG_PLAN_NOTEBOOK_ID || rootNotebookId === ORG_PLAN_NOTEBOOK_ID || isProtectedOrgNoteContent(n.content)) && body.orgPlanSystemWrite !== true) {
        return end(res, 403, { success: false, error: '江苏公司笔记本结构由 HCM 自动维护，不能手动修改' });
      }
      await queryAndLog(
        `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT(id) DO UPDATE SET
         title=$2, content=$3, parent_id=$4, type=$5, order_index=$7, icon=$8, root_notebook_id=$9, updated_at=NOW()`,
        [n.id, n.title || '无标题', saveContent, n.parent_id || n.parentId || null, n.type, existingOwnerId, n.order_index || n.order || 0, n.icon || 'doc', rootNotebookId]
      );

      // SSE 广播
      if (rootNotebookId) {
        sseBroadcast(rootNotebookId, { type: 'note_updated', noteId: n.id, updatedBy: userId, notebookId: rootNotebookId }, userId).catch(() => {});
      }

      return end(res, 200, { success: true, data: n });
    }

    // [删除笔记]
    if (req.url.includes('/notes-write') && body.action === 'deleteNote') {
      const target = await pool.query(
        `SELECT n.id, n.owner_id, n.root_notebook_id, n.content, n.is_locked, n.locked_by, root.owner_id AS root_owner_id
         FROM notes n
         LEFT JOIN notes root ON root.id = COALESCE(n.root_notebook_id, n.id)
         WHERE n.id = $1`,
        [body.noteId]
      );
      if (!target.rows.length) return end(res, 404, { success: false, error: 'Note not found' });
      if (isJiangsuOrgStructureNote(target.rows[0]) && body.orgPlanSystemWrite !== true) {
        return end(res, 403, { success: false, error: '江苏公司笔记本结构由 HCM 自动维护，不能手动删除' });
      }
      const isOwner = target.rows[0].owner_id === userId || target.rows[0].root_owner_id === userId;
      if (!isOwner) {
        return end(res, 403, { error: 'Forbidden: only owner can delete' });
      }
      // 锁检查：被他人锁定的页面不可删除（owner 除外）
      if (target.rows.length > 0 && target.rows[0].is_locked && target.rows[0].locked_by && target.rows[0].locked_by !== userId) {
        if (!isOwner) {
          return end(res, 423, { success: false, error: 'PAGE_LOCKED_BY_OTHER' });
        }
      }
      const deletedRootNotebookId = target.rows[0]?.root_notebook_id || null;
      await queryAndLog(`
        WITH RECURSIVE descendants AS (
          SELECT id FROM notes WHERE id = $1
          UNION
          SELECT n.id FROM notes n JOIN descendants d ON n.parent_id = d.id
        )
        DELETE FROM collab_documents WHERE note_id IN (SELECT id FROM descendants)
      `, [body.noteId]).catch(() => {});
      // 级联删除：递归删除所有子孙节点 + 关联的共享记录
      await queryAndLog(`
        WITH RECURSIVE descendants AS (
          SELECT id FROM notes WHERE id = $1
          UNION
          SELECT n.id FROM notes n JOIN descendants d ON n.parent_id = d.id
        )
        DELETE FROM notes WHERE id IN (SELECT id FROM descendants)
      `, [body.noteId]);
      await queryAndLog('DELETE FROM note_shares WHERE notebook_id = $1', [body.noteId]).catch(() => {});

      // SSE 广播
      if (deletedRootNotebookId) {
        sseBroadcast(deletedRootNotebookId, { type: 'note_deleted', noteId: body.noteId, updatedBy: userId, notebookId: deletedRootNotebookId }, userId).catch(() => {});
      }

      return end(res, 200, { success: true });
    }

    // [分享查询]
    if (req.url.includes('/shares-query')) {
      if (body.action === 'getSharedNotebooks') {
        const { rows } = await queryAndLog(
          `SELECT n.* FROM notes n JOIN note_shares ns ON n.id = ns.notebook_id WHERE ns.user_id = $1`,
          [userId]
        );
        return end(res, 200, { success: true, data: rows });
      }
      if (body.action === 'getNotebookShares') {
        const { rows } = await queryAndLog(
          'SELECT ns.*, up.email, up.display_name FROM note_shares ns JOIN user_profiles up ON ns.user_id = up.id WHERE ns.notebook_id = $1',
          [body.notebookId]
        );
        return end(res, 200, { success: true, data: rows });
      }
      if (body.action === 'getSharedNotebookIds') {
        // 返回当前用户共享出去的笔记本 ID（用于 Sidebar 显示共享图标）
        const { rows } = await queryAndLog(
          'SELECT DISTINCT notebook_id FROM note_shares WHERE shared_by = $1', [userId]
        );
        return end(res, 200, { success: true, data: rows.map(r => r.notebook_id) });
      }
      return end(res, 200, { success: true, data: [] });
    }

    // [分享写入]
    if (req.url.includes('/shares-write')) {
      if (body.action === 'shareNotebook') {
        // 权限检查：只有拥有者可分享
        const nb = await pool.query('SELECT owner_id FROM notes WHERE id = $1', [body.notebookId]);
        if (!nb.rows.length || nb.rows[0].owner_id !== userId) {
          return end(res, 403, { error: 'Forbidden: only owner can share' });
        }
        const { rows } = await queryAndLog('SELECT id FROM user_profiles WHERE email = $1', [body.email]);
        if (!rows.length) return end(res, 404, { success: false, error: 'User not found' });
        if (rows[0].id === userId) return end(res, 400, { error: 'Cannot share with yourself' });
        await queryAndLog(
          `INSERT INTO note_shares (notebook_id, user_id, shared_by, permission) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [body.notebookId, rows[0].id, userId, body.permission || 'edit']
        );
        return end(res, 200, { success: true });
      }
      if (body.action === 'unshareNotebook') {
        const nb = await pool.query('SELECT owner_id FROM notes WHERE id = $1', [body.notebookId]);
        if (!nb.rows.length || nb.rows[0].owner_id !== userId) {
          return end(res, 403, { error: 'Forbidden: only owner can unshare' });
        }
        const targetUser = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [body.email]);
        if (targetUser.rows.length) {
          await queryAndLog(
            'DELETE FROM note_shares WHERE notebook_id = $1 AND user_id = $2',
            [body.notebookId, targetUser.rows[0].id]
          );
        }
        return end(res, 200, { success: true });
      }
      return end(res, 200, { success: true });
    }

    // [锁管理]
    if (req.url.includes('/locks-manage')) {
      if (body.action === 'getPageLock') {
        if (!await checkNoteAccess(body.noteId, false)) return end(res, 403, { error: 'Forbidden' });
        const { rows } = await queryAndLog('SELECT is_locked, locked_by, locked_by_name, locked_at FROM notes WHERE id = $1', [body.noteId]);
        return end(res, 200, { success: true, data: rows[0] || {} });
      }
      if (body.action === 'lockNote') {
        if (!await checkNoteAccess(body.noteId, false)) return end(res, 403, { error: 'Forbidden' });
        const userName = body.userName || '';
        const result = await pool.query(
          `UPDATE notes SET is_locked = true, locked_by = $1, locked_by_name = $2, locked_at = NOW()
           WHERE id = $3 AND (is_locked = false OR locked_by IS NULL OR locked_by = $1)
           RETURNING id`,
          [userId, userName, body.noteId]
        );
        if (!result.rows.length) {
          const current = await pool.query('SELECT locked_by, locked_by_name FROM notes WHERE id = $1', [body.noteId]);
          return end(res, 409, { success: false, error: 'ALREADY_LOCKED', lockedBy: current.rows[0]?.locked_by, lockedByName: current.rows[0]?.locked_by_name });
        }
        // SSE 广播
        const nb = await pool.query('SELECT root_notebook_id FROM notes WHERE id = $1', [body.noteId]);
        if (nb.rows[0]?.root_notebook_id) {
          sseBroadcast(nb.rows[0].root_notebook_id, { type: 'note_locked', noteId: body.noteId, lockedBy: userId, lockedByName: userName, notebookId: nb.rows[0].root_notebook_id }, userId).catch(() => {});
        }
        return end(res, 200, { success: true });
      }
      if (body.action === 'unlockPage' || body.action === 'unlockNote') {
        const lockInfo = await pool.query('SELECT locked_by, root_notebook_id FROM notes WHERE id = $1', [body.noteId]);
        if (lockInfo.rows.length && lockInfo.rows[0].locked_by && lockInfo.rows[0].locked_by !== userId) {
          const userCheck = await pool.query('SELECT email FROM user_profiles WHERE id = $1', [userId]);
          const isOwner = await pool.query('SELECT owner_id FROM notes WHERE id = $1', [body.noteId]);
          if ((!userCheck.rows.length || userCheck.rows[0].email !== ADMIN_EMAIL) && (!isOwner.rows.length || isOwner.rows[0].owner_id !== userId)) {
            return end(res, 403, { error: 'Forbidden: only locker, owner or admin can unlock' });
          }
        }
        await queryAndLog('UPDATE notes SET is_locked = false, locked_by = NULL, locked_by_name = NULL, locked_at = NULL WHERE id = $1', [body.noteId]);
        // SSE 广播
        if (lockInfo.rows[0]?.root_notebook_id) {
          sseBroadcast(lockInfo.rows[0].root_notebook_id, { type: 'note_unlocked', noteId: body.noteId, unlockedBy: userId, notebookId: lockInfo.rows[0].root_notebook_id }, userId).catch(() => {});
        }
        return end(res, 200, { success: true });
      }
      if (body.action === 'refreshLock') {
        const lockCheck = await pool.query('SELECT locked_by FROM notes WHERE id = $1', [body.noteId]);
        if (lockCheck.rows.length && lockCheck.rows[0].locked_by === userId) {
          await queryAndLog('UPDATE notes SET locked_at = NOW() WHERE id = $1', [body.noteId]);
        }
        return end(res, 200, { success: true });
      }
      if (body.action === 'removeLocksForUser') {
        await queryAndLog('UPDATE notes SET is_locked = false, locked_by = NULL, locked_by_name = NULL, locked_at = NULL WHERE locked_by = $1', [body.userId || userId]);
        return end(res, 200, { success: true });
      }
      return end(res, 200, { success: true });
    }

    // [邀请管理]
    if (req.url.includes('/invites-manage')) {
      if (body.action === 'getReceivedInvites') {
        const { rows } = await queryAndLog(
          `SELECT ni.*, up.email as inviter_email, up.display_name as inviter_name, n.title as notebook_title
           FROM notebook_invites ni
           JOIN user_profiles up ON ni.shared_by = up.id
           JOIN notes n ON ni.notebook_id = n.id
           WHERE ni.target_user_id = $1
           ORDER BY ni.created_at DESC`,
          [userId]
        );
        return end(res, 200, { success: true, data: rows });
      }
      if (body.action === 'getMyInvites') {
        const { rows } = await queryAndLog(
          `SELECT ni.*, n.title as notebook_title FROM notebook_invites ni
           JOIN notes n ON ni.notebook_id = n.id
           WHERE ni.shared_by = $1 ORDER BY ni.created_at DESC`,
          [userId]
        );
        return end(res, 200, { success: true, data: rows });
      }
      if (body.action === 'getPendingInviteCount') {
        const { rows } = await queryAndLog(
          `SELECT COUNT(*) as count FROM notebook_invites
           WHERE target_user_id = $1 AND status = 'pending'`,
          [userId]
        );
        return end(res, 200, { success: true, data: { count: parseInt(rows[0].count) } });
      }
      if (body.action === 'createInvite') {
        const { notebookId, inviteeUserId, permission } = body;
        if (!inviteeUserId) return end(res, 400, { error: 'inviteeUserId required' });
        await queryAndLog(
          `INSERT INTO notebook_invites (notebook_id, shared_by, target_user_id, permission, status)
           VALUES ($1, $2, $3, $4, 'pending')`,
          [notebookId, userId, inviteeUserId, permission || 'edit']
        );
        return end(res, 200, { success: true });
      }
      if (body.action === 'respondToInvite') {
        const { inviteId, accept, permission } = body;
        const status = accept ? 'approved' : 'rejected';
        await queryAndLog('UPDATE notebook_invites SET status = $1 WHERE id = $2', [status, inviteId]);
        if (accept) {
          const invite = await pool.query('SELECT * FROM notebook_invites WHERE id = $1', [inviteId]);
          if (invite.rows.length) {
            const inv = invite.rows[0];
            const finalPermission = permission || inv.permission || 'edit';
            await queryAndLog(
              `INSERT INTO note_shares (notebook_id, user_id, shared_by, permission) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
              [inv.notebook_id, inv.target_user_id, inv.shared_by, finalPermission]
            );
          }
        }
        return end(res, 200, { success: true });
      }
      if (body.action === 'cancelInvite') {
        await queryAndLog('DELETE FROM notebook_invites WHERE id = $1 AND shared_by = $2', [body.inviteId, userId]);
        return end(res, 200, { success: true });
      }
      return end(res, 200, { success: true });
    }

    // [更新日志]
    if (req.url.includes('/update-logs') || (req.url.includes('/notes-query') && body.action === 'getUpdateLogs')) {
      if (req.method === 'GET' || body.action === 'getUpdateLogs') {
        const { rows } = await queryAndLog('SELECT * FROM update_logs ORDER BY created_at DESC');
        return end(res, 200, { success: true, data: rows });
      }
      if (body.action === 'addUpdateLog') {
        // 仅管理员
        const userCheck = await pool.query('SELECT email FROM user_profiles WHERE id = $1', [userId]);
        if (!userCheck.rows.length || userCheck.rows[0].email !== ADMIN_EMAIL) {
          return end(res, 403, { error: 'Forbidden: admin only' });
        }
        const newId = body.id || generateId();
        // items 可能被前端 JSON.stringify 成字符串，需要解析为 JS 数组（PostgreSQL text[] 需要）
        let itemsArr = body.items;
        if (typeof itemsArr === 'string') { try { itemsArr = JSON.parse(itemsArr); } catch(e) { itemsArr = [itemsArr]; } }
        if (!Array.isArray(itemsArr)) itemsArr = [String(itemsArr)];
        await queryAndLog(
          'INSERT INTO update_logs (id, version, date, items) VALUES ($1, $2, $3, $4)',
          [newId, body.version, body.date, itemsArr]
        );
        return end(res, 200, { success: true, data: { id: newId, version: body.version, date: body.date, items: itemsArr } });
      }
      if (body.action === 'updateUpdateLog') {
        const userCheck = await pool.query('SELECT email FROM user_profiles WHERE id = $1', [userId]);
        if (!userCheck.rows.length || userCheck.rows[0].email !== ADMIN_EMAIL) {
          return end(res, 403, { error: 'Forbidden: admin only' });
        }
        let itemsArr = body.items;
        if (typeof itemsArr === 'string') { try { itemsArr = JSON.parse(itemsArr); } catch(e) { itemsArr = [itemsArr]; } }
        if (!Array.isArray(itemsArr)) itemsArr = [String(itemsArr)];
        await queryAndLog(
          'UPDATE update_logs SET version = $1, date = $2, items = $3 WHERE id = $4',
          [body.version, body.date, itemsArr, body.id]
        );
        return end(res, 200, { success: true });
      }
      if (body.action === 'deleteUpdateLog') {
        const userCheck = await pool.query('SELECT email FROM user_profiles WHERE id = $1', [userId]);
        if (!userCheck.rows.length || userCheck.rows[0].email !== ADMIN_EMAIL) {
          return end(res, 403, { error: 'Forbidden: admin only' });
        }
        await queryAndLog('DELETE FROM update_logs WHERE id = $1', [body.id]);
        return end(res, 200, { success: true });
      }
      return end(res, 200, { success: true });
    }

    // ================= 图片上传 API =================
    if (req.url === '/upload-image' && req.method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.startsWith('multipart/form-data')) {
        return end(res, 400, { error: 'Content-Type must be multipart/form-data' });
      }
      // 解析 multipart
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) return end(res, 400, { error: 'No boundary' });

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);

      // 提取文件数据
      const boundaryStr = `--${boundary}`;
      const parts = [];
      let start = raw.indexOf(boundaryStr) + boundaryStr.length;
      while (start < raw.length) {
        const nextBoundary = raw.indexOf(boundaryStr, start);
        if (nextBoundary === -1) break;
        const part = raw.slice(start, nextBoundary);
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const header = part.slice(0, headerEnd).toString('utf-8');
          const fileData = part.slice(headerEnd + 4, part.length - 2); // 去掉尾部 \r\n
          const nameMatch = header.match(/name="([^"]+)"/);
          const filenameMatch = header.match(/filename="([^"]+)"/);
          if (nameMatch) {
            parts.push({ name: nameMatch[1], filename: filenameMatch?.[1], data: fileData, header });
          }
        }
        start = nextBoundary + boundaryStr.length;
      }

      const filePart = parts.find(p => p.filename);
      if (!filePart) return end(res, 400, { error: 'No file uploaded' });

      // 验证文件类型：仅允许图片
      const ext = (filePart.filename.match(/\.[^.]+$/) || ['.png'])[0].toLowerCase();
      const allowedExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
      if (!allowedExts.includes(ext)) {
        return end(res, 400, { error: '不支持的文件类型，仅允许: ' + allowedExts.join(', ') });
      }

      // 文件大小限制 10MB
      if (filePart.data.length > 10 * 1024 * 1024) {
        return end(res, 413, { error: 'File too large (max 10MB)' });
      }

      // 验证魔数（文件头）防止伪装
      const validSignatures = {
        '.png': [0x89, 0x50, 0x4E, 0x47],
        '.jpg': [0xFF, 0xD8, 0xFF],
        '.jpeg': [0xFF, 0xD8, 0xFF],
        '.gif': [0x47, 0x49, 0x46],
        '.webp': [0x52, 0x49, 0x46, 0x46],
        '.svg': [0x3C, 0x73, 0x76, 0x67],
        '.bmp': [0x42, 0x4D],
      };
      const sig = validSignatures[ext];
      if (sig) {
        const header = filePart.data.slice(0, sig.length);
        const match = sig.every((b, i) => header[i] === b);
        if (!match) {
          return end(res, 400, { error: '文件内容与扩展名不匹配' });
        }
      }

      // 生成唯一文件名
      const fileId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const savedName = `${fileId}${ext}`;
      const uploadDir = path.join(__dirname, '..', 'uploads', 'images');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, savedName);

      // 路径穿越防护
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
        return end(res, 400, { error: '非法文件路径' });
      }

      fs.writeFileSync(filePath, filePart.data);

      const imageUrl = `/uploads/images/${savedName}`;
      console.log(`[upload-image] ${savedName} (${(filePart.data.length / 1024).toFixed(1)}KB) by ${userId}`);
      return end(res, 200, { success: true, url: imageUrl });
    }

    // ================= OneDrive 云存储 API =================
    const AUTH_ENDPOINTS = {
      'international': 'https://login.microsoftonline.com',
      '世纪互联': 'https://login.partner.microsoftonline.cn',
    };
    const GRAPH_ENDPOINTS = {
      'international': 'https://graph.microsoft.com/v1.0',
      '世纪互联': 'https://microsoftgraph.chinacloudapi.cn/v1.0',
    };
    const ONEDRIVE_REDIRECT_URI = process.env.ONEDRIVE_REDIRECT_URI || `https://notes.binapp.top/api/onedrive/callback`;

    function getTokenEndpoint(cloudType, tenantId) {
      const base = AUTH_ENDPOINTS[cloudType] || AUTH_ENDPOINTS['international'];
      return (tenantId && cloudType === '世纪互联')
        ? `${base}/${tenantId}/oauth2/v2.0/token`
        : `${base}/common/oauth2/v2.0/token`;
    }
    function getGraphEndpoint(cloudType) {
      return GRAPH_ENDPOINTS[cloudType] || GRAPH_ENDPOINTS['international'];
    }

    // 查找笔记所属笔记本的所有者 ID
    async function getNotebookOwnerId(noteId) {
      return getNotebookOwnerIdForNote(noteId);
    }

    // 检查用户对笔记的访问权限级别（用于附件权限）
    async function getNoteAccessLevel(userId, noteId) {
      return getNotebookAccessLevelForUser(userId, noteId);
    }

    // 路径安全验证：确保路径在 /彩云笔记/ 目录下，防止目录穿越
    function isOdPathSafe(path) {
      if (!path) return false;
      if (!path.startsWith('/彩云笔记/')) return false;
      if (path.includes('..')) return false;
      if (path.includes('//')) return false;
      return true;
    }

    // [OneDrive] 获取 OAuth 授权 URL
    if (req.url.includes('/onedrive/auth-url') && req.method === 'POST') {
      const { include_onenote } = body;
      let { client_id, client_secret, cloud_type, tenant_id } = body;
      if (!userId) return end(res, 401, { error: 'Not authenticated' });

      if (include_onenote && (!client_id || !client_secret)) {
        const { rows } = await pool.query(
          'SELECT client_id, client_secret, cloud_type, tenant_id FROM onedrive_accounts WHERE user_id = $1 LIMIT 1',
          [userId]
        );
        if (!rows.length) return end(res, 400, { error: '请先绑定 OneDrive 账号' });
        client_id = rows[0].client_id;
        client_secret = rows[0].client_secret;
        cloud_type = rows[0].cloud_type;
        tenant_id = rows[0].tenant_id;
      }

      if (!client_id || !client_secret) return end(res, 400, { error: '缺少 client_id 或 client_secret' });

      const cloud = cloud_type === '世纪互联' ? '世纪互联' : 'international';
      const scope = oneNoteProbe.buildOneDriveScope(cloud, !!include_onenote);

      const encodeB64 = (str) => Buffer.from(str).toString('base64url');
      const state = [
        encodeB64(userId),
        encodeB64(cloud),
        encodeB64(tenant_id || ''),
        encodeB64(client_id),
        encodeB64(client_secret),
        encodeB64(include_onenote ? '1' : '0'),
      ].join('|');

      const authPath = (cloud === '世纪互联' && tenant_id)
        ? `/${tenant_id}/oauth2/v2.0/authorize`
        : '/common/oauth2/v2.0/authorize';

      const authUrl = new URL(`${AUTH_ENDPOINTS[cloud]}${authPath}`);
      authUrl.searchParams.set('client_id', client_id);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', ONEDRIVE_REDIRECT_URI);
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('state', state);

      return end(res, 200, { authUrl: authUrl.toString(), redirectUrl: `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/onedrive/auth-redirect?state=${encodeURIComponent(state)}&cloud=${encodeURIComponent(cloud)}`, state, cloud });
    }

    // [OneDrive] 代理跳转到微软授权页（解决 Tauri CSP 拦截问题）
    if (req.url.includes('/onedrive/auth-redirect') && req.method === 'GET') {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const state = urlObj.searchParams.get('state');
      const cloud = urlObj.searchParams.get('cloud');
      if (!state || !cloud) {
        res.writeHead(404);
        return res.end('Missing state or cloud');
      }

      const decodeB64 = (s) => Buffer.from(s, 'base64url').toString('utf-8');
      const parts = state.split('|');
      const client_id = parts.length >= 4 ? decodeB64(parts[3]) : '';
      const tenant_id = parts.length >= 3 ? decodeB64(parts[2]) : '';
      const includeOneNote = parts.length >= 6 ? decodeB64(parts[5]) === '1' : false;

      const scope = oneNoteProbe.buildOneDriveScope(cloud, includeOneNote);

      const authPath = (cloud === '世纪互联' && tenant_id)
        ? `/${tenant_id}/oauth2/v2.0/authorize`
        : '/common/oauth2/v2.0/authorize';

      const authUrl = new URL(`${AUTH_ENDPOINTS[cloud] || AUTH_ENDPOINTS['international']}${authPath}`);
      authUrl.searchParams.set('client_id', client_id);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', ONEDRIVE_REDIRECT_URI);
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('state', state);

      res.writeHead(302, { 'Location': authUrl.toString() });
      return res.end();
    }
    if (req.url.includes('/onedrive/callback')) {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const code = urlObj.searchParams.get('code');
      const state = urlObj.searchParams.get('state');
      const errorParam = urlObj.searchParams.get('error');
      const errorDesc = urlObj.searchParams.get('error_description');

      const makePage = (title, msg, isError) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;padding:32px 40px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.12);text-align:center;max-width:480px}
.icon{font-size:48px;margin-bottom:16px}h2{margin:0 0 12px;color:${isError?'#dc2626':'#333'};font-size:20px}p{margin:0 0 20px;color:#666;font-size:14px;line-height:1.5}
.btn{display:inline-block;padding:10px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;margin-top:10px}</style></head>
<body><div class="card"><div class="icon">${isError?'❌':'✅'}</div><h2>${title}</h2><p>${msg}</p>
<button class="btn" onclick="notifyParent()">完成授权${isError?'':'，返回笔记'}</button></div>
<script>
function notifyParent(){try{var w=window.opener||window.parent;w.postMessage(${isError?`{type:'onedrive_error',error:'${title}'}`:`{type:'onedrive_success'}`},'*');
setTimeout(function(){if(!window.closed)window.close()},1500)}catch(e){}}
window.onload=function(){setTimeout(notifyParent,1000)};
</script></body></html>`;

      if (errorParam) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(makePage('授权失败', errorDesc || errorParam, true));
      }
      if (!code || !state) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(makePage('授权失败', '缺少授权码或状态参数', true));
      }

      const parts = state.split('|');
      if (parts.length < 5) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(makePage('授权失败', 'state 格式错误', true));
      }

      const decodeB64 = (s) => Buffer.from(s, 'base64url').toString('utf-8');
      const odUserId = decodeB64(parts[0]);
      const cloud = decodeB64(parts[1]);
      const tenant_id = decodeB64(parts[2]);
      const client_id = decodeB64(parts[3]);
      const client_secret = decodeB64(parts[4]);

      const tokenPath = (tenant_id && cloud === '世纪互联')
        ? `/${tenant_id}/oauth2/v2.0/token`
        : '/common/oauth2/v2.0/token';
      const tokenEndpoint = `${AUTH_ENDPOINTS[cloud] || AUTH_ENDPOINTS['international']}${tokenPath}`;

      const tokenBody = new URLSearchParams({
        client_id, client_secret, code,
        redirect_uri: ONEDRIVE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString();

      const tokenResp = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody,
      });
      const tokens = await tokenResp.json();

      if (tokens.error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(makePage('授权失败', tokens.error_description || tokens.error, true));
      }

      const token_expires_at = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null;

      // 获取用户显示名
      let displayName = '';
      try {
        const graphEp = getGraphEndpoint(cloud);
        const meResp = await fetch(`${graphEp}/me`, { headers: { 'Authorization': `Bearer ${tokens.access_token}` } });
        if (meResp.ok) { const meData = await meResp.json(); displayName = meData.displayName || meData.userPrincipalName || ''; }
      } catch (e) { /* 忽略 */ }

      // 获取 drive info
      let driveId = 'me/drive';
      try {
        const graphEp = getGraphEndpoint(cloud);
        const driveResp = await fetch(`${graphEp}/me/drive`, { headers: { 'Authorization': `Bearer ${tokens.access_token}` } });
        if (driveResp.ok) { const driveData = await driveResp.json(); driveId = driveData.id || 'me/drive'; }
      } catch (e) { /* 忽略 */ }

      await pool.query(`
        INSERT INTO onedrive_accounts (user_id, client_id, client_secret, cloud_type, access_token, refresh_token, token_expires_at, drive_id, drive_type, display_name, tenant_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'personal', $9, $10, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          client_id = EXCLUDED.client_id, client_secret = EXCLUDED.client_secret,
          cloud_type = EXCLUDED.cloud_type, access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token, token_expires_at = EXCLUDED.token_expires_at,
          drive_id = EXCLUDED.drive_id, drive_type = EXCLUDED.drive_type,
          display_name = EXCLUDED.display_name, tenant_id = EXCLUDED.tenant_id,
          updated_at = NOW()
      `, [odUserId, client_id, client_secret, cloud, tokens.access_token, tokens.refresh_token, token_expires_at, driveId, displayName, tenant_id || null]);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(makePage('绑定成功', `已成功绑定 OneDrive 账号${displayName ? ' (' + displayName + ')' : ''}<br>请关闭此窗口`, false));
    }

    // [OneDrive] 检查绑定状态
    if (req.url.includes('/onedrive/check') && !req.url.includes('/onedrive/check-notebook')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { rows } = await pool.query('SELECT id, display_name, cloud_type, updated_at FROM onedrive_accounts WHERE user_id = $1', [userId]);
      if (!rows.length) return end(res, 200, { bound: false });
      return end(res, 200, { bound: true, account: rows[0] });
    }

    // [OneDrive] 解绑
    if (req.url.includes('/onedrive/unbind') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      await pool.query('DELETE FROM onedrive_accounts WHERE user_id = $1', [userId]);
      return end(res, 200, { success: true });
    }

    // [OneDrive] Token 刷新辅助函数
    async function refreshOdToken(account) {
      if (!account.client_id || !account.client_secret || !account.refresh_token) return account.access_token;
      const expiresAt = new Date(account.token_expires_at).getTime();
      if (expiresAt - Date.now() > 5 * 60 * 1000) return account.access_token; // 还没过期

      const tokenEndpoint = getTokenEndpoint(account.cloud_type, account.tenant_id);
      try {
        const resp = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: account.client_id, client_secret: account.client_secret,
            refresh_token: account.refresh_token, grant_type: 'refresh_token',
          }).toString(),
        });
        if (resp.ok) {
          const data = await resp.json();
          await pool.query(
            `UPDATE onedrive_accounts SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW() WHERE user_id = $4`,
            [data.access_token, data.refresh_token || account.refresh_token, new Date(Date.now() + data.expires_in * 1000).toISOString(), account.user_id]
          );
          return data.access_token;
        }
      } catch (e) { console.error('[OneDrive] Token 刷新失败:', e.message); }
      return account.access_token;
    }

    async function fetchOneNoteCollection(graphEp, accessToken, target, resourcePath) {
      try {
        const response = await fetch(`${graphEp}${resourcePath}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });

        let data = {};
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = { error: { code: `HTTP_${response.status}`, message: response.statusText || 'Non-JSON response' } };
        }

        return {
          target,
          status: response.status,
          ok: response.ok && Array.isArray(data.value),
          data,
          classification: oneNoteProbe.classifyGraphProbeResponse(response.status, data),
        };
      } catch (error) {
        return {
          target,
          status: 0,
          ok: false,
          data: { error: { code: 'NETWORK_ERROR', message: error.message } },
          classification: { supported: false, needs_reauth: false, code: 'NETWORK_ERROR', message: error.message },
          error: error.message,
        };
      }
    }

    // [OneNote] 只读探测云端笔记本元数据，不读取页面正文
    if (req.url.includes('/onenote/probe') && req.method === 'GET') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });

      const { rows } = await pool.query('SELECT * FROM onedrive_accounts WHERE user_id = $1 LIMIT 1', [userId]);
      if (!rows.length) {
        return end(res, 200, {
          success: false,
          supported: false,
          needs_reauth: false,
          notebooks_count: 0,
          sections_count: 0,
          pages_count: 0,
          samples: { notebooks: [], sections: [], pages: [] },
          errors: [{ target: 'account', status: 404, code: 'ACCOUNT_NOT_BOUND', message: '请先绑定 OneDrive 账号' }],
        });
      }

      const account = rows[0];
      const accessToken = await refreshOdToken(account);
      const graphEp = getGraphEndpoint(account.cloud_type);
      const endpoints = [
        { target: 'notebooks', path: '/me/onenote/notebooks' },
        { target: 'sections', path: '/me/onenote/sections' },
        { target: 'pages', path: '/me/onenote/pages?$top=10' },
      ];

      const results = await Promise.all(endpoints.map((endpoint) =>
        fetchOneNoteCollection(graphEp, accessToken, endpoint.target, endpoint.path)
      ));
      const summary = oneNoteProbe.summarizeOneNoteProbeResults(results);
      console.log(
        `[OneNoteProbe] user=${userId.substring(0, 8)}... cloud=${account.cloud_type} supported=${summary.supported} needs_reauth=${summary.needs_reauth} ` +
        `counts=${summary.notebooks_count}/${summary.sections_count}/${summary.pages_count} statuses=${results.map((r) => `${r.target}:${r.status}`).join(',')}`
      );

      return end(res, 200, summary);
    }

    // [OneDrive] 上传文件
    if (req.url.includes('/onedrive/upload') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { note_id, file_name, file_content, folder_path, folder_name } = body;
      if (!file_name || !file_content) return end(res, 400, { error: '缺少 file_name 或 file_content' });

      try {
      // 查找笔记本所有者
      if (!note_id) return end(res, 400, { error: '缺少 note_id' });
      const notebookOwnerId = await getNotebookOwnerId(note_id);
      if (!notebookOwnerId) return end(res, 404, { error: '笔记不存在' });

      // 检查当前用户是否有编辑权限
      const accessInfo = await getNoteAccessLevel(userId, note_id);
      if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });
      if (accessInfo.access === 'view') return end(res, 403, { error: '只有查看权限，无法上传附件' });

      // 使用笔记本所有者的 OneDrive 账号
      const { rows: accounts } = await pool.query('SELECT * FROM onedrive_accounts WHERE user_id = $1', [notebookOwnerId]);
      if (!accounts.length) return end(res, 400, { error: '该笔记本所有者未绑定 OneDrive 账号', needBind: true });
      const account = accounts[0];

      const accessToken = await refreshOdToken(account);
      const graphEp = getGraphEndpoint(account.cloud_type);

      // 构建驱动器路径前缀
      const drivePrefix = account.drive_id ? `drives/${account.drive_id}/root` : 'me/drive';

      // 构建路径（后端拼接，不接受前端自定义）
      const basePath = '/彩云笔记';
      const notePath = `${basePath}/${note_id}`;
      const fullPath = `${notePath}/${file_name}`;

      // 路径安全验证
      if (!isOdPathSafe(fullPath)) return end(res, 400, { error: '非法路径' });

      // 确保文件夹存在
      async function ensureFolder(path) {
        const checkUrl = `${graphEp}/${drivePrefix}:${encodeURIComponent(path)}`;
        const checkResp = await fetch(checkUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (checkResp.status === 404) {
          const parentPath = path.substring(0, path.lastIndexOf('/'));
          const name = path.substring(path.lastIndexOf('/') + 1);
          if (parentPath) await ensureFolder(parentPath);
          await fetch(`${graphEp}/${drivePrefix}:${encodeURIComponent(parentPath || '/')}:/children`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'replace' }),
          });
        }
      }
      await ensureFolder(notePath);

      // base64 → Buffer
      const binaryContent = Buffer.from(file_content, 'base64');
      const mimeType = getMimeType(file_name);

      // 上传：先尝试 createUploadSession，失败则直接 PUT
      let uploadResult = null;
      try {
        const sessionUrl = `${graphEp}/${drivePrefix}:${encodeURIComponent(notePath)}:/${encodeURIComponent(file_name)}:/createUploadSession`;
        const sessionResp = await fetch(sessionUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
        });
        if (sessionResp.ok) {
          const sessionData = await sessionResp.json();
          const upResp = await fetch(sessionData.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: binaryContent });
          if (upResp.ok) uploadResult = await upResp.json();
        }
      } catch (e) { /* fallback */ }

      if (!uploadResult) {
        const directUrl = `${graphEp}/${drivePrefix}:${encodeURIComponent(fullPath)}:/content`;
        const directResp = await fetch(directUrl, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': mimeType },
          body: binaryContent,
        });
        if (!directResp.ok) {
          const errText = await directResp.text();
          return end(res, 500, { error: '上传失败', details: errText });
        }
        uploadResult = await directResp.json();
      }

      // 写入附件表：user_id 为笔记本所有者（OneDrive 账号所有者）
      const attachId = generateId();
      await pool.query(
        `INSERT INTO attachments (id, note_id, user_id, file_name, file_size, mime_type, onedrive_path, onedrive_file_id, folder_name, folder_path, category, storage_provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'onedrive')`,
        [attachId, note_id, notebookOwnerId, file_name, binaryContent.length, mimeType, fullPath, uploadResult.id, '根目录', '/', getCategory(mimeType)]
      );

      // SSE 广播附件变更
      const attachNb = await pool.query('SELECT root_notebook_id FROM notes WHERE id = $1', [note_id]);
      if (attachNb.rows[0]?.root_notebook_id) {
        sseBroadcast(attachNb.rows[0].root_notebook_id, { type: 'note_updated', noteId: note_id, updatedBy: userId, notebookId: attachNb.rows[0].root_notebook_id, reason: 'attachment_changed' }, userId).catch(() => {});
      }

      return end(res, 200, { success: true, data: { id: attachId, file_name, file_size: binaryContent.length, mime_type: mimeType, onedrive_path: fullPath, onedrive_file_id: uploadResult.id, category: getCategory(mimeType) } });

      } catch (uploadErr) {
        console.error('[OneDrive] 上传失败:', uploadErr.message);
        return end(res, 500, { error: '上传失败: ' + uploadErr.message });
      }
    }

    // [OneDrive] 下载文件
    if (req.url.includes('/onedrive/download')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const attachmentId = urlObj.searchParams.get('attachment_id');

      if (!attachmentId) return end(res, 400, { error: '缺少 attachment_id' });

      // 查附件（不限 user_id，共享用户也要能下载）
      const { rows: attachments } = await pool.query('SELECT * FROM attachments WHERE id = $1', [attachmentId]);
      if (!attachments.length) return end(res, 404, { error: '附件不存在' });
      const att = attachments[0];

      // 检查用户是否有该笔记的访问权限
      if (att.note_id) {
        const accessInfo = await getNoteAccessLevel(userId, att.note_id);
        if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该附件' });
      } else if (att.user_id !== userId) {
        return end(res, 403, { error: '无权访问该附件' });
      }

      // 路径安全验证
      if (!isOdPathSafe(att.onedrive_path)) return end(res, 400, { error: '非法路径' });

      // 使用附件所有者（笔记本所有者）的 OneDrive 账号
      const { rows: accounts } = await pool.query('SELECT * FROM onedrive_accounts WHERE user_id = $1', [att.user_id]);
      if (!accounts.length) return end(res, 400, { error: '附件所有者未绑定 OneDrive 账号' });
      const account = accounts[0];

      const accessToken = await refreshOdToken(account);
      const graphEp = getGraphEndpoint(account.cloud_type);
      const drivePrefix = account.drive_id ? `drives/${account.drive_id}/root` : 'me/drive';
      const downloadUrl = `${graphEp}/${drivePrefix}:${encodeURIComponent(att.onedrive_path)}:/content`;

      const dlResp = await fetch(downloadUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (!dlResp.ok) {
        const errText = await dlResp.text();
        return end(res, 500, { error: '下载失败', details: errText });
      }

      const content = Buffer.from(await dlResp.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': att.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(att.file_name)}"`,
        'Content-Length': content.length,
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(content);
    }

    // [OneDrive] 附件列表
    if (req.url.includes('/onedrive/list')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const noteId = urlObj.searchParams.get('note_id');
      const folderPath = urlObj.searchParams.get('folder_path');

      if (noteId) {
        // 按笔记查询：基于笔记访问权限（共享用户也能看到）
        const accessInfo = await getNoteAccessLevel(userId, noteId);
        if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });
        let query = 'SELECT * FROM attachments WHERE note_id = $1';
        const params = [noteId];
        let idx = 2;
        if (folderPath) { query += ` AND folder_path = $${idx}`; params.push(folderPath); idx++; }
        query += ' ORDER BY created_at DESC';
        const { rows } = await pool.query(query, params);
        return end(res, 200, { success: true, data: rows });
      }

      // Sidebar 文件管理：只显示自己 OneDrive 的文件
      let query = 'SELECT * FROM attachments WHERE user_id = $1 AND storage_provider = \'onedrive\'';
      const params = [userId];
      let idx = 2;
      if (folderPath) { query += ` AND folder_path = $${idx}`; params.push(folderPath); idx++; }
      query += ' ORDER BY created_at DESC';
      const { rows } = await pool.query(query, params);
      return end(res, 200, { success: true, data: rows });
    }

    // [OneDrive] 检查笔记本所有者是否绑定了 OneDrive
    if (req.url.includes('/onedrive/check-notebook') && !req.url.includes('/onedrive/check-notebooks-batch')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const noteId = urlObj.searchParams.get('note_id');
      if (!noteId) return end(res, 400, { error: '缺少 note_id' });

      const notebookOwnerId = await getNotebookOwnerId(noteId);
      if (!notebookOwnerId) return end(res, 404, { error: '笔记不存在' });

      const accessInfo = await getNoteAccessLevel(userId, noteId);
      if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });

      const { rows: accounts } = await pool.query('SELECT 1 FROM onedrive_accounts WHERE user_id = $1', [notebookOwnerId]);
      return end(res, 200, {
        bound: accounts.length > 0,
        is_owner: accessInfo.isOwner,
        access: accessInfo.access,
      });
    }

    // [OneDrive] 批量查询笔记本的储存空间绑定状态
    if (req.url.includes('/onedrive/check-notebooks-batch')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const idsParam = urlObj.searchParams.get('notebook_ids');
      if (!idsParam) return end(res, 400, { error: '缺少 notebook_ids' });
      const notebookIds = idsParam.split(',').filter(Boolean);
      if (!notebookIds.length) return end(res, 200, { bound: [] });

      const results = [];
      for (const nid of notebookIds) {
        const ownerId = await getNotebookOwnerId(nid);
        if (!ownerId) { results.push({ notebook_id: nid, bound: false }); continue; }
        const { rows } = await pool.query('SELECT 1 FROM onedrive_accounts WHERE user_id = $1', [ownerId]);
        results.push({ notebook_id: nid, bound: rows.length > 0 });
      }
      return end(res, 200, { data: results });
    }

    // [OneDrive] 删除附件
    if (req.url.includes('/onedrive/delete') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { attachment_id } = body;
      if (!attachment_id) return end(res, 400, { error: '缺少 attachment_id' });

      // 查附件（不限 user_id，共享编辑者也要能删除）
      const { rows: attachments } = await pool.query('SELECT * FROM attachments WHERE id = $1', [attachment_id]);
      if (!attachments.length) return end(res, 404, { error: '附件不存在' });
      const att = attachments[0];

      // 检查用户是否有编辑权限
      if (att.note_id) {
        const accessInfo = await getNoteAccessLevel(userId, att.note_id);
        if (accessInfo.access !== 'edit') return end(res, 403, { error: '无权删除该附件' });
      } else if (att.user_id !== userId) {
        return end(res, 403, { error: '无权删除该附件' });
      }

      // 路径安全验证
      if (!isOdPathSafe(att.onedrive_path)) return end(res, 400, { error: '非法路径' });

      // 使用附件所有者的 OneDrive 账号删除远程文件
      const { rows: accounts } = await pool.query('SELECT * FROM onedrive_accounts WHERE user_id = $1', [att.user_id]);
      if (accounts.length) {
        try {
          const account = accounts[0];
          const accessToken = await refreshOdToken(account);
          const graphEp = getGraphEndpoint(account.cloud_type);
          const drivePrefix = account.drive_id ? `drives/${account.drive_id}/root` : 'me/drive';
          await fetch(`${graphEp}/${drivePrefix}:${encodeURIComponent(att.onedrive_path)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
        } catch (e) { console.error('[OneDrive] 删除远程文件失败:', e.message); }
      }

      await pool.query('DELETE FROM attachments WHERE id = $1', [attachment_id]);

      // SSE 广播附件变更
      if (att.note_id) {
        const delAttachNb = await pool.query('SELECT root_notebook_id FROM notes WHERE id = $1', [att.note_id]);
        if (delAttachNb.rows[0]?.root_notebook_id) {
          sseBroadcast(delAttachNb.rows[0].root_notebook_id, { type: 'note_updated', noteId: att.note_id, updatedBy: userId, notebookId: delAttachNb.rows[0].root_notebook_id, reason: 'attachment_changed' }, userId).catch(() => {});
        }
      }

      return end(res, 200, { success: true });
    }

    // [LLM] 检查用户是否已配置大模型
    if (req.url.includes('/llm/check') && req.method === 'GET') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { rows } = await pool.query('SELECT id, provider, protocol, base_url, model_name, updated_at FROM llm_configs WHERE user_id = $1', [userId]);
      if (!rows.length) return end(res, 200, { configured: false });
      return end(res, 200, { configured: true, config: rows[0] });
    }

    // [LLM] 保存/更新大模型配置
    if (req.url.includes('/llm/save') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { provider, protocol, api_key, base_url, model_name } = body;
      if (!api_key) return end(res, 400, { error: '缺少 API Key' });
      if (!model_name) return end(res, 400, { error: '缺少模型名称' });

      await pool.query(`
        INSERT INTO llm_configs (user_id, provider, protocol, api_key, base_url, model_name, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          provider = EXCLUDED.provider, protocol = EXCLUDED.protocol, api_key = EXCLUDED.api_key,
          base_url = EXCLUDED.base_url, model_name = EXCLUDED.model_name,
          updated_at = NOW()
      `, [userId, provider || 'openai', protocol || 'openai', api_key, base_url || null, model_name]);

      console.log(`[LLM] 用户 ${userId.substring(0, 8)} 保存了大模型配置 (${protocol || 'openai'})`);
      return end(res, 200, { success: true });
    }

    // [LLM] 删除大模型配置
    if (req.url.includes('/llm/delete') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      await pool.query('DELETE FROM llm_configs WHERE user_id = $1', [userId]);
      return end(res, 200, { success: true });
    }

    // [LLM] 测试大模型连接
    if (req.url.includes('/llm/test') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { protocol, api_key, base_url, model_name } = body;
      if (!api_key || !model_name) return end(res, 400, { error: '缺少 API Key 或模型名称' });

      try {
        const startTime = Date.now();
        let testUrl, testHeaders, testBody;

        if (protocol === 'anthropic') {
          testUrl = (base_url || 'https://api.anthropic.com') + '/v1/messages';
          testHeaders = {
            'Content-Type': 'application/json',
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
          };
          testBody = JSON.stringify({
            model: model_name,
            max_tokens: 32,
            messages: [{ role: 'user', content: 'Hi, reply with just "ok".' }],
          });
        } else {
          testUrl = (base_url || 'https://api.openai.com/v1') + '/chat/completions';
          testHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api_key}`,
          };
          testBody = JSON.stringify({
            model: model_name,
            max_tokens: 32,
            messages: [{ role: 'user', content: 'Hi, reply with just "ok".' }],
          });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const testRes = await fetch(testUrl, {
          method: 'POST',
          headers: testHeaders,
          body: testBody,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const elapsed = Date.now() - startTime;

        if (!testRes.ok) {
          const errText = await testRes.text().catch(() => '');
          let errMsg = `HTTP ${testRes.status}`;
          try { const errJson = JSON.parse(errText); errMsg = errJson.error?.message || errJson.message || errMsg; } catch {}
          return end(res, 200, { success: false, error: errMsg, elapsed });
        }

        const resData = await testRes.json();
        let reply = '';
        if (protocol === 'anthropic') {
          reply = resData.content?.[0]?.text || '';
        } else {
          reply = resData.choices?.[0]?.message?.content || '';
        }

        return end(res, 200, { success: true, reply: reply.substring(0, 100), elapsed, model: model_name });
      } catch (err) {
        const msg = err.name === 'AbortError' ? '连接超时（15秒）' : (err.message || '连接失败');
        return end(res, 200, { success: false, error: msg });
      }
    }

    // [LLM] 语音转文字（SSE 流式，支持 MiniMax 和 OpenAI）
    if (req.url.includes('/llm/transcribe') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const noteId = body.note_id;
      if (!noteId) return end(res, 400, { error: '缺少 note_id' });

      const ownerId = await getNotebookOwnerId(noteId);
      if (!ownerId) return end(res, 200, { success: false, error: '找不到笔记本' });

      const accessInfo = await getNoteAccessLevel(userId, noteId);
      if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });

      const { rows: llmRows } = await pool.query('SELECT provider, protocol, api_key, base_url, model_name FROM llm_configs WHERE user_id = $1', [ownerId]);
      if (!llmRows.length) return end(res, 200, { success: false, error: '笔记本所有者未配置大模型' });

      const llm = llmRows[0];
      const audioHex = body.audio_hex;
      if (!audioHex) return end(res, 400, { error: '缺少音频数据' });

      try {
        // MiniMax：通过 Assistants API 实现语音转写
        // 流程：创建 ASR 助手 → 创建线程 → 流式运行（音频hex输入）→ 解析SSE提取转写文本
        if (llm.provider === 'minimax' || llm.base_url?.includes('minimax')) {
          const minimaxApiBase = 'https://api.minimaxi.com/v1';
          const authHeader = `Bearer ${llm.api_key}`;
          const commonHeaders = { 'Authorization': authHeader, 'Content-Type': 'application/json' };

          // Step 1: 创建 ASR 助手
          const asstRes = await fetch(`${minimaxApiBase}/assistants/create`, {
            method: 'POST', headers: commonHeaders,
            body: JSON.stringify({
              model: 'abab6.5s-chat', name: 'ASR', instructions: '逐字转写',
              t2a_option: { model: 'speech-01', voice_id: 'male-qn-qingse' },
            }),
          });
          if (!asstRes.ok) {
            const errText = await asstRes.text();
            return end(res, 200, { success: false, error: `创建助手失败 ${asstRes.status}: ${errText.slice(0, 300)}` });
          }
          const asstData = await asstRes.json();
          const assistantId = asstData.id;
          if (!assistantId) return end(res, 200, { success: false, error: '创建助手失败：未获取到ID' });

          // Step 2: 创建线程
          const threadRes = await fetch(`${minimaxApiBase}/threads/create`, {
            method: 'POST', headers: commonHeaders, body: JSON.stringify({}),
          });
          if (!threadRes.ok) {
            const errText = await threadRes.text();
            return end(res, 200, { success: false, error: `创建线程失败 ${threadRes.status}: ${errText.slice(0, 300)}` });
          }
          const threadData = await threadRes.json();
          const threadId = threadData.id;
          if (!threadId) return end(res, 200, { success: false, error: '创建线程失败：未获取到ID' });

          // Step 3: 流式运行（stream:2 = 语音输入模式，type:2 = 音频hex消息）
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 60000);
          let runRes;
          try {
            runRes = await fetch(`${minimaxApiBase}/threads/run/create_stream`, {
              method: 'POST', headers: commonHeaders, signal: controller.signal,
              body: JSON.stringify({
                stream: 2, thread_id: threadId, assistant_id: assistantId,
                messages: [{ type: 2, role: 'user', content: audioHex }],
                model: 'abab6.5s-chat',
                t2a_option: { model: 'speech-01', voice_id: 'male-qn-qingse' },
              }),
            });
          } finally { clearTimeout(timeout); }

          if (!runRes.ok) {
            const errText = await runRes.text();
            return end(res, 200, { success: false, error: `流式运行失败 ${runRes.status}: ${errText.slice(0, 300)}` });
          }

          // Step 4: 解析 SSE 响应，提取转写文本
          const runText = await runRes.text();
          let asrText = '';
          let aiText = '';
          for (const line of runText.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              const msg = evt.data;
              if (!msg?.content) continue;
              if (msg.role === 'user') {
                for (const c of msg.content) {
                  if (c.type === 'text' && c.text?.value) asrText = c.text.value;
                }
              }
              if (msg.role === 'ai') {
                for (const c of msg.content) {
                  if (c.type === 'text' && c.text?.value) aiText += c.text.value;
                }
              }
            } catch (e) {}
          }
          const finalText = asrText || aiText;
          if (!finalText) return end(res, 200, { success: false, error: '未能识别语音内容，请确保录音包含清晰语音' });
          return end(res, 200, { success: true, text: finalText, provider: 'minimax' });
        }

        // OpenAI 兼容协议：支持 Whisper API 的提供商（OpenAI、DeepSeek、Azure 等）
        if (llm.protocol === 'openai' || llm.protocol === 'custom') {
          const baseUrl = (llm.base_url || 'https://api.openai.com/v1').replace(/\/$/, '');
          const whisperUrl = baseUrl.includes('/v1') ? baseUrl + '/audio/transcriptions' : baseUrl + '/v1/audio/transcriptions';

          const audioBuffer = Buffer.from(audioHex, 'hex');
          const boundary = '----FormBoundary' + Date.now();
          const formData = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`;
          const formDataEnd = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}--`;
          const fullBody = Buffer.concat([
            Buffer.from(formData, 'utf-8'),
            audioBuffer,
            Buffer.from(formDataEnd, 'utf-8'),
          ]);

          const whisperRes = await fetch(whisperUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${llm.api_key}`,
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body: fullBody,
          });

          if (!whisperRes.ok) {
            const errText = await whisperRes.text();
            return end(res, 200, { success: false, error: `Whisper API 错误 ${whisperRes.status}: ${errText.slice(0, 300)}` });
          }

          const whisperData = await whisperRes.json();
          if (whisperData.error) {
            return end(res, 200, { success: false, error: whisperData.error.message || JSON.stringify(whisperData.error) });
          }
          return end(res, 200, { success: true, text: whisperData.text || '', provider: llm.provider });
        }

        return end(res, 200, { success: false, error: '当前大模型不支持语音转文字，请使用 OpenAI 兼容协议的模型或 MiniMax' });
      } catch (err) {
        return end(res, 200, { success: false, error: err.message || '转写失败' });
      }
    }

    // [LLM] 获取笔记本所有者的 LLM 配置（供 AI 功能使用）
    if (req.url.includes('/llm/notebook-config') && req.method === 'GET') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const noteId = urlObj.searchParams.get('note_id');
      if (!noteId) return end(res, 400, { error: '缺少 note_id' });

      const ownerId = await getNotebookOwnerId(noteId);
      if (!ownerId) return end(res, 200, { configured: false });

      const accessInfo = await getNoteAccessLevel(userId, noteId);
      if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });

      const { rows } = await pool.query('SELECT provider, protocol, api_key, base_url, model_name FROM llm_configs WHERE user_id = $1', [ownerId]);
      if (!rows.length) return end(res, 200, { configured: false });
      return end(res, 200, { configured: true, config: rows[0], is_owner: accessInfo.isOwner });
    }


    // [管理员 API] (Nginx /api/admin -> 后端 /admin)
    if (req.url.includes('/admin')) {
      const userCheck = await pool.query('SELECT email FROM user_profiles WHERE id = $1', [userId]);
      if (!userCheck.rows.length || userCheck.rows[0].email !== ADMIN_EMAIL) {
        return end(res, 403, { error: 'Forbidden: admin only' });
      }

      // 获取所有用户（含笔记数和管理员标识）
      if (body.action === 'getAllUsers') {
        const { rows } = await queryAndLog(
          `SELECT up.id, up.email, up.display_name, up.created_at,
                  COUNT(n.id)::int AS note_count,
                  CASE WHEN up.email = $1 THEN true ELSE false END AS is_admin
           FROM user_profiles up
           LEFT JOIN notes n ON n.owner_id = up.id
           GROUP BY up.id, up.email, up.display_name, up.created_at
           ORDER BY up.created_at DESC`,
          [ADMIN_EMAIL]
        );
        return end(res, 200, { success: true, data: rows });
      }

      // 获取用户列表（旧版兼容）
      if (body.action === 'getUsers') {
        const { rows } = await queryAndLog('SELECT id, email, display_name, role, created_at FROM user_profiles ORDER BY created_at DESC');
        return end(res, 200, { success: true, data: rows });
      }

      // 更新用户信息
      if (body.action === 'updateUser') {
        await queryAndLog('UPDATE user_profiles SET display_name = $1 WHERE id = $2', [body.display_name, body.userId]);
        return end(res, 200, { success: true });
      }

      // 删除用户（级联删除其笔记）
      if (body.action === 'deleteUser') {
        const targetId = body.targetUserId;
        if (!targetId) return end(res, 400, { error: 'Missing targetUserId' });
        // 不能删除自己
        if (targetId === userId) return end(res, 400, { error: 'Cannot delete yourself' });
        await queryAndLog('DELETE FROM notes WHERE owner_id = $1', [targetId]);
        await queryAndLog('DELETE FROM user_settings WHERE user_id = $1', [targetId]);
        await queryAndLog('DELETE FROM note_shares WHERE user_id = $1', [targetId]);
        await queryAndLog('DELETE FROM user_profiles WHERE id = $1', [targetId]);
        return end(res, 200, { success: true });
      }

      // 数据库统计
      if (body.action === 'getDbStats') {
        const userCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM user_profiles');
        const noteCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM notes');
        const topUsers = await queryAndLog(
          `SELECT up.email, COUNT(n.id)::int AS note_count
           FROM user_profiles up
           LEFT JOIN notes n ON n.owner_id = up.id
           GROUP BY up.email
           ORDER BY note_count DESC LIMIT 10`
        );
        const dbSize = await pool.query(
          "SELECT pg_database_size(current_database()) / 1024.0 / 1024.0 AS size_mb"
        );
        return end(res, 200, {
          success: true,
          data: {
            total_users: userCount.rows[0].cnt,
            total_notes: noteCount.rows[0].cnt,
            total_sessions: 0,
            db_size_mb: Math.round(dbSize.rows[0].size_mb * 100) / 100,
            top_users: topUsers.rows,
          }
        });
      }

      // 获取所有笔记
      if (body.action === 'getAllNotes') {
        const { rows } = await queryAndLog(
          `SELECT n.id, n.title, n.type, n.owner_id, n.created_at, n.updated_at,
                  up.email AS owner_email,
                  LENGTH(COALESCE(n.content, '')) AS word_count
           FROM notes n
           JOIN user_profiles up ON up.id = n.owner_id
           ORDER BY n.updated_at DESC`
        );
        return end(res, 200, { success: true, data: rows });
      }

      // 删除任意笔记
      if (body.action === 'deleteAnyNote') {
        if (!body.noteId) return end(res, 400, { error: 'Missing noteId' });
        await queryAndLog('DELETE FROM notes WHERE id = $1', [body.noteId]);
        return end(res, 200, { success: true });
      }

      // 活跃度统计
      if (body.action === 'getActivityStats') {
        const days = body.days || 30;
        const { rows } = await queryAndLog(
          `SELECT d::date::text AS date,
                  (SELECT COUNT(*)::int FROM user_profiles WHERE created_at::date = d::date) AS new_users,
                  (SELECT COUNT(*)::int FROM notes WHERE created_at::date = d::date) AS new_notes
           FROM generate_series(CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day', CURRENT_DATE, '1 day') d
           ORDER BY d`,
          [days]
        );
        return end(res, 200, { success: true, data: rows });
      }

      return end(res, 200, { success: true });
    }

    // ===== Qiniu Cloud (七牛云) Kodo Storage API Routes =====
    /*
     * Database table (create once on server):
     * CREATE TABLE IF NOT EXISTS qiniu_accounts (
     *   user_id TEXT PRIMARY KEY,
     *   access_key TEXT NOT NULL,
     *   secret_key TEXT NOT NULL,
     *   bucket TEXT NOT NULL DEFAULT '',
     *   region TEXT NOT NULL DEFAULT 'z2',
     *   domain TEXT NOT NULL DEFAULT '',
     *   created_at TIMESTAMPTZ DEFAULT NOW(),
     *   updated_at TIMESTAMPTZ DEFAULT NOW()
     * );
     */

    function generateQiniuUploadToken(accessKey, secretKey, bucket, key) {
      const putPolicy = {
        scope: key ? `${bucket}:${key}` : bucket,
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };
      const encodedPutPolicy = Buffer.from(JSON.stringify(putPolicy)).toString('base64url');
      const sign = crypto.createHmac('sha1', secretKey).update(encodedPutPolicy).digest('base64url');
      return `${accessKey}:${sign}:${encodedPutPolicy}`;
    }

    function signQiniuDownloadUrl(baseUrl, accessKey, secretKey) {
      const url = new URL(baseUrl);
      const signingStr = url.host + url.pathname;
      const sign = crypto.createHmac('sha1', secretKey).update(signingStr).digest('base64url');
      return `${baseUrl}?token=${accessKey}:${sign}`;
    }

    // [Qiniu] 保存配置
    if (req.url === '/qiniu/save-config' && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { access_key, secret_key, bucket, region, domain } = body;
      if (!access_key || !secret_key) return end(res, 400, { error: '缺少 access_key 或 secret_key' });
      await pool.query(`
        INSERT INTO qiniu_accounts (user_id, access_key, secret_key, bucket, region, domain, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          access_key = EXCLUDED.access_key, secret_key = EXCLUDED.secret_key,
          bucket = EXCLUDED.bucket, region = EXCLUDED.region, domain = EXCLUDED.domain,
          updated_at = NOW()
      `, [userId, access_key, secret_key, bucket || '', region || 'z2', domain || '']);
      return end(res, 200, { success: true });
    }

    // [Qiniu] 检查绑定状态
    if (req.url.includes('/qiniu/check') && !req.url.includes('/qiniu/check-notebook')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { rows } = await pool.query('SELECT user_id, bucket, region, domain FROM qiniu_accounts WHERE user_id = $1', [userId]);
      if (!rows.length) return end(res, 200, { bound: false });
      return end(res, 200, { bound: true, account: rows[0] });
    }

    // [Qiniu] 删除配置
    if (req.url === '/qiniu/delete-config' && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      await pool.query('DELETE FROM qiniu_accounts WHERE user_id = $1', [userId]);
      return end(res, 200, { success: true });
    }

    // [Qiniu] 上传文件
    if (req.url === '/qiniu/upload' && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { note_id, file_name, file_content } = body;
      if (!file_name || !file_content) return end(res, 400, { error: '缺少 file_name 或 file_content' });
      try {
        if (!note_id) return end(res, 400, { error: '缺少 note_id' });
        const notebookOwnerId = await getNotebookOwnerId(note_id);
        if (!notebookOwnerId) return end(res, 404, { error: '笔记不存在' });

        const accessInfo = await getNoteAccessLevel(userId, note_id);
        if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });
        if (accessInfo.access === 'view') return end(res, 403, { error: '只有查看权限，无法上传附件' });

        const { rows: accounts } = await pool.query('SELECT * FROM qiniu_accounts WHERE user_id = $1', [notebookOwnerId]);
        if (!accounts.length) return end(res, 400, { error: '该笔记本所有者未绑定七牛云账号', needBind: true });
        const account = accounts[0];

        const qiniuKey = `/彩云笔记/${note_id}/${file_name}`;
        const uploadToken = generateQiniuUploadToken(account.access_key, account.secret_key, account.bucket, qiniuKey);
        const region = account.region || 'z2';
        const uploadUrl = `https://upload-${region}.qiniup.com`;

        const binaryContent = Buffer.from(file_content, 'base64');
        const mimeType = getMimeType(file_name);

        const boundary = '----FormBoundary' + Date.now();
        const CRLF = '\r\n';
        const bodyParts = [];
        bodyParts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="token"${CRLF}${CRLF}${uploadToken}${CRLF}`));
        bodyParts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="key"${CRLF}${CRLF}${qiniuKey}${CRLF}`));
        const fileHeader = Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${file_name}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`);
        const fileFooter = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
        const fullBody = Buffer.concat([...bodyParts, fileHeader, binaryContent, fileFooter]);

        const upResp = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
          body: fullBody,
        });
        if (!upResp.ok) {
          const errText = await upResp.text();
          return end(res, 500, { error: '上传失败', details: errText });
        }
        const upResult = await upResp.json();

        const attachId = generateId();
        await pool.query(
          `INSERT INTO attachments (id, note_id, user_id, file_name, file_size, mime_type, onedrive_path, onedrive_file_id, folder_name, folder_path, category, storage_provider)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'qiniu')`,
          [attachId, note_id, notebookOwnerId, file_name, binaryContent.length, mimeType, qiniuKey, upResult.key || qiniuKey, '根目录', '/', getCategory(mimeType)]
        );

        const attachNb = await pool.query('SELECT root_notebook_id FROM notes WHERE id = $1', [note_id]);
        if (attachNb.rows[0]?.root_notebook_id) {
          sseBroadcast(attachNb.rows[0].root_notebook_id, { type: 'note_updated', noteId: note_id, updatedBy: userId, notebookId: attachNb.rows[0].root_notebook_id, reason: 'attachment_changed' }, userId).catch(() => {});
        }

        return end(res, 200, { success: true, data: { id: attachId, file_name, file_size: binaryContent.length, mime_type: mimeType, onedrive_path: qiniuKey, onedrive_file_id: upResult.key || qiniuKey, category: getCategory(mimeType) } });
      } catch (uploadErr) {
        console.error('[Qiniu] 上传失败:', uploadErr.message);
        return end(res, 500, { error: '上传失败: ' + uploadErr.message });
      }
    }

    // [Qiniu] 下载文件
    if (req.url.includes('/qiniu/download')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const attachmentId = urlObj.searchParams.get('attachment_id');
      if (!attachmentId) return end(res, 400, { error: '缺少 attachment_id' });

      const { rows: attachments } = await pool.query('SELECT * FROM attachments WHERE id = $1', [attachmentId]);
      if (!attachments.length) return end(res, 404, { error: '附件不存在' });
      const att = attachments[0];

      if (att.note_id) {
        const accessInfo = await getNoteAccessLevel(userId, att.note_id);
        if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该附件' });
      } else if (att.user_id !== userId) {
        return end(res, 403, { error: '无权访问该附件' });
      }

      const { rows: accounts } = await pool.query('SELECT * FROM qiniu_accounts WHERE user_id = $1', [att.user_id]);
      if (!accounts.length) return end(res, 400, { error: '附件所有者未绑定七牛云账号' });
      const account = accounts[0];

      const domain = account.domain;
      if (!domain) return end(res, 400, { error: '未配置七牛云域名' });

      let downloadUrl = `https://${domain}/${encodeURIComponent(att.onedrive_path)}`;
      const signedUrl = signQiniuDownloadUrl(downloadUrl, account.access_key, account.secret_key);

      const dlResp = await fetch(signedUrl);
      if (!dlResp.ok) {
        const errText = await dlResp.text();
        return end(res, 500, { error: '下载失败', details: errText });
      }

      const content = Buffer.from(await dlResp.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': att.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(att.file_name)}"`,
        'Content-Length': content.length,
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(content);
    }

    // [Qiniu] 附件列表
    if (req.url.includes('/qiniu/list')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const noteId = urlObj.searchParams.get('note_id');
      const folderPath = urlObj.searchParams.get('folder_path');

      if (noteId) {
        const accessInfo = await getNoteAccessLevel(userId, noteId);
        if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });
        let query = 'SELECT * FROM attachments WHERE note_id = $1';
        const params = [noteId];
        let idx = 2;
        if (folderPath) { query += ` AND folder_path = $${idx}`; params.push(folderPath); idx++; }
        query += ' ORDER BY created_at DESC';
        const { rows } = await pool.query(query, params);
        return end(res, 200, { success: true, data: rows });
      }

      let query = 'SELECT * FROM attachments WHERE user_id = $1 AND storage_provider = \'qiniu\'';
      const params = [userId];
      let idx = 2;
      if (folderPath) { query += ` AND folder_path = $${idx}`; params.push(folderPath); idx++; }
      query += ' ORDER BY created_at DESC';
      const { rows } = await pool.query(query, params);
      return end(res, 200, { success: true, data: rows });
    }

    // [Qiniu] 删除附件
    if (req.url === '/qiniu/delete' && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { attachment_id } = body;
      if (!attachment_id) return end(res, 400, { error: '缺少 attachment_id' });

      const { rows: attachments } = await pool.query('SELECT * FROM attachments WHERE id = $1', [attachment_id]);
      if (!attachments.length) return end(res, 404, { error: '附件不存在' });
      const att = attachments[0];

      if (att.note_id) {
        const accessInfo = await getNoteAccessLevel(userId, att.note_id);
        if (accessInfo.access !== 'edit') return end(res, 403, { error: '无权删除该附件' });
      } else if (att.user_id !== userId) {
        return end(res, 403, { error: '无权删除该附件' });
      }

      const { rows: accounts } = await pool.query('SELECT * FROM qiniu_accounts WHERE user_id = $1', [att.user_id]);
      if (accounts.length) {
        try {
          const account = accounts[0];
          const region = account.region || 'z2';
          const encodedEntry = Buffer.from(`${account.bucket}:${att.onedrive_path}`).toString('base64url');
          const path = `/delete/${encodedEntry}`;
          const signStr = `${path}\n`;
          const sign = crypto.createHmac('sha1', account.secret_key).update(signStr).digest('base64url');
          await fetch(`https://rs-${region}.qiniuapi.com${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `QBox ${account.access_key}:${sign}`,
            },
          });
        } catch (e) { console.error('[Qiniu] 删除远程文件失败:', e.message); }
      }

      await pool.query('DELETE FROM attachments WHERE id = $1', [attachment_id]);

      if (att.note_id) {
        const delAttachNb = await pool.query('SELECT root_notebook_id FROM notes WHERE id = $1', [att.note_id]);
        if (delAttachNb.rows[0]?.root_notebook_id) {
          sseBroadcast(delAttachNb.rows[0].root_notebook_id, { type: 'note_updated', noteId: att.note_id, updatedBy: userId, notebookId: delAttachNb.rows[0].root_notebook_id, reason: 'attachment_changed' }, userId).catch(() => {});
        }
      }

      return end(res, 200, { success: true });
    }

    // [Qiniu] 检查笔记本所有者是否绑定了七牛云
    if (req.url.includes('/qiniu/check-notebook') && !req.url.includes('/qiniu/check-notebooks-batch')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const noteId = urlObj.searchParams.get('note_id');
      if (!noteId) return end(res, 400, { error: '缺少 note_id' });

      const notebookOwnerId = await getNotebookOwnerId(noteId);
      if (!notebookOwnerId) return end(res, 404, { error: '笔记不存在' });

      const accessInfo = await getNoteAccessLevel(userId, noteId);
      if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });

      const { rows: accounts } = await pool.query('SELECT 1 FROM qiniu_accounts WHERE user_id = $1', [notebookOwnerId]);
      return end(res, 200, { bound: accounts.length > 0, is_owner: accessInfo.isOwner, access: accessInfo.access });
    }

    // [Qiniu] 批量查询笔记本的七牛云绑定状态
    if (req.url.includes('/qiniu/check-notebooks-batch')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const idsParam = urlObj.searchParams.get('notebook_ids');
      if (!idsParam) return end(res, 400, { error: '缺少 notebook_ids' });
      const notebookIds = idsParam.split(',').filter(Boolean);
      if (!notebookIds.length) return end(res, 200, { bound: [] });

      const results = [];
      for (const nid of notebookIds) {
        const ownerId = await getNotebookOwnerId(nid);
        if (!ownerId) { results.push({ notebook_id: nid, bound: false }); continue; }
        const { rows } = await pool.query('SELECT 1 FROM qiniu_accounts WHERE user_id = $1', [ownerId]);
        results.push({ notebook_id: nid, bound: rows.length > 0 });
      }
      return end(res, 200, { data: results });
    }

    // ===== Baidu Cloud (百度网盘) API Routes =====
    /*
     * Database table (create once on server):
     * CREATE TABLE IF NOT EXISTS baidu_accounts (
     *   user_id TEXT PRIMARY KEY,
     *   app_key TEXT NOT NULL,
     *   secret_key TEXT NOT NULL,
     *   access_token TEXT NOT NULL,
     *   refresh_token TEXT,
     *   expires_at TIMESTAMPTZ,
     *   baidu_name TEXT,
     *   created_at TIMESTAMPTZ DEFAULT NOW(),
     *   updated_at TIMESTAMPTZ DEFAULT NOW()
     * );
     */

    const BAIDU_REDIRECT_URI = process.env.BAIDU_REDIRECT_URI || 'https://notes.binapp.top/api/baidu/callback';

    // [Baidu] Token 刷新辅助函数
    async function refreshBaiduToken(account) {
      if (!account.app_key || !account.secret_key || !account.refresh_token) return account.access_token;
      const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;
      if (expiresAt - Date.now() > 5 * 60 * 1000) return account.access_token;

      try {
        const resp = await fetch('https://openapi.baidu.com/oauth/2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: account.refresh_token,
            client_id: account.app_key,
            client_secret: account.secret_key,
          }).toString(),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.access_token) {
            await pool.query(
              `UPDATE baidu_accounts SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW() WHERE user_id = $4`,
              [data.access_token, data.refresh_token || account.refresh_token, data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null, account.user_id]
            );
            return data.access_token;
          }
        }
      } catch (e) { console.error('[Baidu] Token 刷新失败:', e.message); }
      return account.access_token;
    }

    // 路径安全验证：确保路径在 /apps/彩云笔记/ 目录下，防止目录穿越
    function isBaiduPathSafe(path) {
      if (!path) return false;
      if (!path.startsWith('/apps/彩云笔记/')) return false;
      if (path.includes('..')) return false;
      if (path.includes('//')) return false;
      return true;
    }

    // [Baidu] 获取 OAuth 授权 URL
    if (req.url.includes('/baidu/auth-url') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { app_key, secret_key } = body;
      if (!app_key || !secret_key) return end(res, 400, { error: '缺少 app_key 或 secret_key' });

      const encodeB64 = (str) => Buffer.from(str).toString('base64url');
      const state = [encodeB64(userId), encodeB64(app_key), encodeB64(secret_key)].join('|');

      const authUrl = new URL('https://openapi.baidu.com/oauth/2.0/authorize');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', app_key);
      authUrl.searchParams.set('redirect_uri', BAIDU_REDIRECT_URI);
      authUrl.searchParams.set('scope', 'basic,netdisk');
      authUrl.searchParams.set('state', state);

      // 同时返回一个经过本后端代理的跳转 URL，Tauri/nw.js 等环境不会触发 CSP 拦截
      const proxyRedirectUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/baidu/auth-redirect?state=${encodeURIComponent(state)}&app_key=${encodeURIComponent(app_key)}`;

      return end(res, 200, { authUrl: authUrl.toString(), redirectUrl: proxyRedirectUrl, state });
    }

    // [Baidu] 代理跳转到百度授权页（解决 Tauri/nw.js CSP 拦截问题）
    if (req.url.includes('/baidu/auth-redirect') && req.method === 'GET') {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const state = urlObj.searchParams.get('state');
      const app_key = urlObj.searchParams.get('app_key');
      if (!state || !app_key) {
        res.writeHead(404);
        return res.end('Missing state or app_key');
      }

      const authUrl = new URL('https://openapi.baidu.com/oauth/2.0/authorize');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', app_key);
      authUrl.searchParams.set('redirect_uri', BAIDU_REDIRECT_URI);
      authUrl.searchParams.set('scope', 'basic,netdisk');
      authUrl.searchParams.set('state', state);

      res.writeHead(302, { 'Location': authUrl.toString() });
      return res.end();
    }

    // [Baidu] OAuth 回调（百度重定向过来，GET 请求）
    if (req.url.includes('/baidu/callback')) {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const code = urlObj.searchParams.get('code');
      const state = urlObj.searchParams.get('state');
      const errorParam = urlObj.searchParams.get('error');
      const errorDesc = urlObj.searchParams.get('error_description');

      const makePage = (title, msg, isError) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;padding:32px 40px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.12);text-align:center;max-width:480px}
.icon{font-size:48px;margin-bottom:16px}h2{margin:0 0 12px;color:${isError?'#dc2626':'#333'};font-size:20px}p{margin:0 0 20px;color:#666;font-size:14px;line-height:1.5}
.btn{display:inline-block;padding:10px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;margin-top:10px}</style></head>
<body><div class="card"><div class="icon">${isError?'❌':'✅'}</div><h2>${title}</h2><p>${msg}</p>
<button class="btn" onclick="notifyParent()">完成授权${isError?'':'，返回笔记'}</button></div>
<script>
function notifyParent(){try{var w=window.opener||window.parent;w.postMessage(${isError?`{type:'baidu_error',error:'${title}'}`:`{type:'baidu_success'}`},'*');
setTimeout(function(){if(!window.closed)window.close()},1500)}catch(e){}}
window.onload=function(){setTimeout(notifyParent,1000)};
</script></body></html>`;

      if (errorParam) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(makePage('授权失败', errorDesc || errorParam, true));
      }
      if (!code || !state) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(makePage('授权失败', '缺少授权码或状态参数', true));
      }

      const parts = state.split('|');
      if (parts.length < 3) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(makePage('授权失败', 'state 格式错误', true));
      }

      const decodeB64 = (s) => Buffer.from(s, 'base64url').toString('utf-8');
      const baiduUserId = decodeB64(parts[0]);
      const app_key = decodeB64(parts[1]);
      const secret_key = decodeB64(parts[2]);

      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: app_key,
        client_secret: secret_key,
        redirect_uri: BAIDU_REDIRECT_URI,
      }).toString();

      const tokenResp = await fetch('https://openapi.baidu.com/oauth/2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody,
      });
      const tokens = await tokenResp.json();

      if (tokens.error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(makePage('授权失败', tokens.error_description || tokens.error, true));
      }

      const token_expires_at = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null;

      // 获取百度用户名
      let baiduName = '';
      try {
        const uinfoResp = await fetch(`https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo&access_token=${encodeURIComponent(tokens.access_token)}`);
        const uinfoData = await uinfoResp.json();
        if (uinfoData.errno === 0) {
          baiduName = uinfoData.baidu_name || '';
        }
      } catch (e) { /* 忽略 */ }

      await pool.query(`
        INSERT INTO baidu_accounts (user_id, app_key, secret_key, access_token, refresh_token, expires_at, baidu_name, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          app_key = EXCLUDED.app_key, secret_key = EXCLUDED.secret_key,
          access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
          expires_at = EXCLUDED.expires_at, baidu_name = EXCLUDED.baidu_name,
          updated_at = NOW()
      `, [baiduUserId, app_key, secret_key, tokens.access_token, tokens.refresh_token, token_expires_at, baiduName || null]);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(makePage('绑定成功', `已成功绑定百度网盘账号${baiduName ? ' (' + baiduName + ')' : ''}<br>请关闭此窗口`, false));
    }

    // [Baidu] 检查绑定状态
    if (req.url.includes('/baidu/check') && !req.url.includes('/baidu/check-notebook')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { rows } = await pool.query('SELECT user_id, baidu_name, app_key FROM baidu_accounts WHERE user_id = $1', [userId]);
      if (!rows.length) return end(res, 200, { bound: false });
      return end(res, 200, { bound: true, account: rows[0] });
    }

    // [Baidu] 解绑
    if (req.url.includes('/baidu/unbind') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      await pool.query('DELETE FROM baidu_accounts WHERE user_id = $1', [userId]);
      return end(res, 200, { success: true });
    }

    // [Baidu] 上传文件（两步：precreate + 上传二进制）
    if (req.url.includes('/baidu/upload') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { note_id, file_name, file_content } = body;
      if (!file_name || !file_content) return end(res, 400, { error: '缺少 file_name 或 file_content' });

      try {
        if (!note_id) return end(res, 400, { error: '缺少 note_id' });
        const notebookOwnerId = await getNotebookOwnerId(note_id);
        if (!notebookOwnerId) return end(res, 404, { error: '笔记不存在' });

        const accessInfo = await getNoteAccessLevel(userId, note_id);
        if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });
        if (accessInfo.access === 'view') return end(res, 403, { error: '只有查看权限，无法上传附件' });

        const { rows: accounts } = await pool.query('SELECT * FROM baidu_accounts WHERE user_id = $1', [notebookOwnerId]);
        if (!accounts.length) return end(res, 400, { error: '该笔记本所有者未绑定百度网盘账号', needBind: true });
        const account = accounts[0];

        const accessToken = await refreshBaiduToken(account);

        // 构建路径（百度网盘要求 /apps/ 前缀）
        const baiduPath = `/apps/彩云笔记/${note_id}/${file_name}`;
        if (!isBaiduPathSafe(baiduPath)) return end(res, 400, { error: '非法路径' });

        const binaryContent = Buffer.from(file_content, 'base64');
        const mimeType = getMimeType(file_name);

        // Step 1: Precreate（预创建文件，获取上传 URL）
        const precreateResp = await fetch(`https://pan.baidu.com/rest/2.0/xpan/file?method=precreate&access_token=${encodeURIComponent(accessToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            path: baiduPath,
            size: String(binaryContent.length),
            isdir: '0',
            rtype: '1',
            autoinit: '1',
          }).toString(),
        });
        const precreateData = await precreateResp.json();

        if (precreateData.errno !== 0) {
          return end(res, 500, { error: 'Baidu precreate failed', details: precreateData.errmsg || JSON.stringify(precreateData) });
        }

        // Step 2: Upload binary to returned uploadurl
        let uploadResult = null;
        if (precreateData.uploadurl) {
          const upResp = await fetch(precreateData.uploadurl, {
            method: 'POST',
            headers: { 'Content-Type': mimeType },
            body: binaryContent,
          });
          if (upResp.ok) {
            const upText = await upResp.text();
            try { uploadResult = JSON.parse(upText); } catch (e) { uploadResult = { raw: upText }; }
          }
        }

        const fsId = precreateData.fs_id || (uploadResult?.fs_id) || '0';

        // 写入附件表
        const attachId = generateId();
        await pool.query(
        `INSERT INTO attachments (id, note_id, user_id, file_name, file_size, mime_type, onedrive_path, onedrive_file_id, folder_name, folder_path, category, storage_provider)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'baidu')`,
          [attachId, note_id, notebookOwnerId, file_name, binaryContent.length, mimeType, baiduPath, String(fsId), '根目录', '/', getCategory(mimeType)]
        );

        // SSE 广播
        const attachNb = await pool.query('SELECT root_notebook_id FROM notes WHERE id = $1', [note_id]);
        if (attachNb.rows[0]?.root_notebook_id) {
          sseBroadcast(attachNb.rows[0].root_notebook_id, { type: 'note_updated', noteId: note_id, updatedBy: userId, notebookId: attachNb.rows[0].root_notebook_id, reason: 'attachment_changed' }, userId).catch(() => {});
        }

        return end(res, 200, { success: true, data: { id: attachId, file_name, file_size: binaryContent.length, mime_type: mimeType, onedrive_path: baiduPath, onedrive_file_id: String(fsId), category: getCategory(mimeType) } });

      } catch (uploadErr) {
        console.error('[Baidu] 上传失败:', uploadErr.message);
        return end(res, 500, { error: '上传失败: ' + uploadErr.message });
      }
    }

    // [Baidu] 下载文件（两步：获取 dlink + 代理下载）
    if (req.url.includes('/baidu/download')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const attachmentId = urlObj.searchParams.get('attachment_id');

      if (!attachmentId) return end(res, 400, { error: '缺少 attachment_id' });

      // 查附件（不限 user_id，共享用户也要能下载）
      const { rows: attachments } = await pool.query('SELECT * FROM attachments WHERE id = $1', [attachmentId]);
      if (!attachments.length) return end(res, 404, { error: '附件不存在' });
      const att = attachments[0];

      // 检查用户是否有该笔记的访问权限
      if (att.note_id) {
        const accessInfo = await getNoteAccessLevel(userId, att.note_id);
        if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该附件' });
      } else if (att.user_id !== userId) {
        return end(res, 403, { error: '无权访问该附件' });
      }

      // 路径安全验证
      if (!isBaiduPathSafe(att.onedrive_path)) return end(res, 400, { error: '非法路径' });

      // 使用附件所有者（笔记本所有者）的百度账号
      const { rows: accounts } = await pool.query('SELECT * FROM baidu_accounts WHERE user_id = $1', [att.user_id]);
      if (!accounts.length) return end(res, 400, { error: '附件所有者未绑定百度网盘账号' });
      const account = accounts[0];

      const accessToken = await refreshBaiduToken(account);

      // Step 1: 获取文件信息（含 dlink）
      const metasResp = await fetch(`https://pan.baidu.com/rest/2.0/xpan/file?method=filemetas&access_token=${encodeURIComponent(accessToken)}&fsids=[${encodeURIComponent(att.onedrive_file_id || '')}]&dlink=1`);
      const metasData = await metasResp.json();

      if (metasData.errno !== 0 || !metasData.list || !metasData.list.length) {
        return end(res, 500, { error: '获取文件信息失败', details: metasData.errmsg || JSON.stringify(metasData) });
      }

      const dlink = metasData.list[0].dlink;
      if (!dlink) return end(res, 500, { error: '无法获取下载链接' });

      // Step 2: 通过 dlink 下载（需要 User-Agent: pan.baidu.com）
      const dlResp = await fetch(dlink, {
        headers: { 'User-Agent': 'pan.baidu.com' },
      });
      if (!dlResp.ok) {
        return end(res, 500, { error: '下载失败', details: `HTTP ${dlResp.status}` });
      }

      const content = Buffer.from(await dlResp.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': att.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(att.file_name)}"`,
        'Content-Length': content.length,
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(content);
    }

    // [Baidu] 附件列表
    if (req.url.includes('/baidu/list')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const noteId = urlObj.searchParams.get('note_id');
      const folderPath = urlObj.searchParams.get('folder_path');

      if (noteId) {
        // 按笔记查询：基于笔记访问权限（共享用户也能看到）
        const accessInfo = await getNoteAccessLevel(userId, noteId);
        if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });
        let query = 'SELECT * FROM attachments WHERE note_id = $1';
        const params = [noteId];
        let idx = 2;
        if (folderPath) { query += ` AND folder_path = $${idx}`; params.push(folderPath); idx++; }
        query += ' ORDER BY created_at DESC';
        const { rows } = await pool.query(query, params);
        return end(res, 200, { success: true, data: rows });
      }

      // Sidebar 文件管理：只显示自己百度网盘的文件
      let query = 'SELECT * FROM attachments WHERE user_id = $1 AND storage_provider = \'baidu\'';
      const params = [userId];
      let idx = 2;
      if (folderPath) { query += ` AND folder_path = $${idx}`; params.push(folderPath); idx++; }
      query += ' ORDER BY created_at DESC';
      const { rows } = await pool.query(query, params);
      return end(res, 200, { success: true, data: rows });
    }

    // [Baidu] 检查笔记本所有者是否绑定了百度网盘
    if (req.url.includes('/baidu/check-notebook') && !req.url.includes('/baidu/check-notebooks-batch')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const noteId = urlObj.searchParams.get('note_id');
      if (!noteId) return end(res, 400, { error: '缺少 note_id' });

      const notebookOwnerId = await getNotebookOwnerId(noteId);
      if (!notebookOwnerId) return end(res, 404, { error: '笔记不存在' });

      const accessInfo = await getNoteAccessLevel(userId, noteId);
      if (accessInfo.access === 'none') return end(res, 403, { error: '无权访问该笔记' });

      const { rows: accounts } = await pool.query('SELECT 1 FROM baidu_accounts WHERE user_id = $1', [notebookOwnerId]);
      return end(res, 200, {
        bound: accounts.length > 0,
        is_owner: accessInfo.isOwner,
        access: accessInfo.access,
      });
    }

    // [Baidu] 批量查询笔记本的百度网盘绑定状态
    if (req.url.includes('/baidu/check-notebooks-batch')) {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const idsParam = urlObj.searchParams.get('notebook_ids');
      if (!idsParam) return end(res, 400, { error: '缺少 notebook_ids' });
      const notebookIds = idsParam.split(',').filter(Boolean);
      if (!notebookIds.length) return end(res, 200, { bound: [] });

      const results = [];
      for (const nid of notebookIds) {
        const ownerId = await getNotebookOwnerId(nid);
        if (!ownerId) { results.push({ notebook_id: nid, bound: false }); continue; }
        const { rows } = await pool.query('SELECT 1 FROM baidu_accounts WHERE user_id = $1', [ownerId]);
        results.push({ notebook_id: nid, bound: rows.length > 0 });
      }
      return end(res, 200, { data: results });
    }

    // [Baidu] 删除附件
    if (req.url.includes('/baidu/delete') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { attachment_id } = body;
      if (!attachment_id) return end(res, 400, { error: '缺少 attachment_id' });

      // 查附件（不限 user_id，共享编辑者也要能删除）
      const { rows: attachments } = await pool.query('SELECT * FROM attachments WHERE id = $1', [attachment_id]);
      if (!attachments.length) return end(res, 404, { error: '附件不存在' });
      const att = attachments[0];

      // 检查用户是否有编辑权限
      if (att.note_id) {
        const accessInfo = await getNoteAccessLevel(userId, att.note_id);
        if (accessInfo.access !== 'edit') return end(res, 403, { error: '无权删除该附件' });
      } else if (att.user_id !== userId) {
        return end(res, 403, { error: '无权删除该附件' });
      }

      // 路径安全验证
      if (!isBaiduPathSafe(att.onedrive_path)) return end(res, 400, { error: '非法路径' });

      // 删除百度网盘远程文件
      const { rows: accounts } = await pool.query('SELECT * FROM baidu_accounts WHERE user_id = $1', [att.user_id]);
      if (accounts.length) {
        try {
          const account = accounts[0];
          const accessToken = await refreshBaiduToken(account);
          const filelist = JSON.stringify([{ path: att.onedrive_path }]);
          await fetch(`https://pan.baidu.com/rest/2.0/xpan/file?method=filemanager&opera=delete&access_token=${encodeURIComponent(accessToken)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              async: '0',
              filelist: filelist,
              ondup: 'fail',
            }).toString(),
          });
        } catch (e) { console.error('[Baidu] 删除远程文件失败:', e.message); }
      }

      await pool.query('DELETE FROM attachments WHERE id = $1', [attachment_id]);

      // SSE 广播附件变更
      if (att.note_id) {
        const delAttachNb = await pool.query('SELECT root_notebook_id FROM notes WHERE id = $1', [att.note_id]);
        if (delAttachNb.rows[0]?.root_notebook_id) {
          sseBroadcast(delAttachNb.rows[0].root_notebook_id, { type: 'note_updated', noteId: att.note_id, updatedBy: userId, notebookId: delAttachNb.rows[0].root_notebook_id, reason: 'attachment_changed' }, userId).catch(() => {});
        }
      }

      return end(res, 200, { success: true });
    }

    // [Attachments] 统一重命名附件；不允许修改扩展名
    if (req.url.includes('/attachments/rename') && req.method === 'POST') {
      if (!userId) return end(res, 401, { error: 'Not authenticated' });
      const { attachment_id, file_name } = body || {};
      if (!attachment_id || !file_name) return end(res, 400, { error: '缺少 attachment_id 或 file_name' });

      const { rows: attachments } = await pool.query('SELECT * FROM attachments WHERE id = $1', [attachment_id]);
      if (!attachments.length) return end(res, 404, { error: '附件不存在' });
      const att = attachments[0];

      if (att.note_id) {
        const accessInfo = await getNoteAccessLevel(userId, att.note_id);
        if (accessInfo.access !== 'edit') return end(res, 403, { error: '无权重命名该附件' });
      } else if (att.user_id !== userId) {
        return end(res, 403, { error: '无权重命名该附件' });
      }

      const validation = validateAttachmentRename(att.file_name, file_name);
      if (!validation.ok) return end(res, 400, { error: validation.error });
      const nextFileName = validation.fileName;
      if (nextFileName === att.file_name) return end(res, 200, { success: true, data: att });

      const provider = att.storage_provider || 'onedrive';
      let nextPath = att.onedrive_path;
      let nextFileId = att.onedrive_file_id;

      try {
        if (provider === 'onedrive') {
          if (!isOdPathSafe(att.onedrive_path)) return end(res, 400, { error: '非法路径' });
          const { rows: accounts } = await pool.query('SELECT * FROM onedrive_accounts WHERE user_id = $1', [att.user_id]);
          if (!accounts.length) return end(res, 400, { error: '附件所有者未绑定 OneDrive 账号' });
          const account = accounts[0];
          const accessToken = await refreshOdToken(account);
          const graphEp = getGraphEndpoint(account.cloud_type);
          const itemEndpoint = att.onedrive_file_id
            ? (account.drive_id ? `drives/${account.drive_id}/items/${att.onedrive_file_id}` : `me/drive/items/${att.onedrive_file_id}`)
            : (account.drive_id ? `drives/${account.drive_id}/root:${encodeURIComponent(att.onedrive_path)}:` : `me/drive/root:${encodeURIComponent(att.onedrive_path)}:`);
          const renameResp = await fetch(`${graphEp}/${itemEndpoint}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: nextFileName }),
          });
          if (!renameResp.ok) {
            const errText = await renameResp.text();
            return end(res, 500, { error: 'OneDrive 重命名失败', details: errText });
          }
          const renameData = await renameResp.json().catch(() => ({}));
          nextPath = replaceFileNameInPath(att.onedrive_path, nextFileName);
          nextFileId = renameData.id || att.onedrive_file_id;
        } else if (provider === 'baidu') {
          if (!isBaiduPathSafe(att.onedrive_path)) return end(res, 400, { error: '非法路径' });
          const { rows: accounts } = await pool.query('SELECT * FROM baidu_accounts WHERE user_id = $1', [att.user_id]);
          if (!accounts.length) return end(res, 400, { error: '附件所有者未绑定百度网盘账号' });
          const accessToken = await refreshBaiduToken(accounts[0]);
          const renameResp = await fetch(`https://pan.baidu.com/rest/2.0/xpan/file?method=filemanager&opera=rename&access_token=${encodeURIComponent(accessToken)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              async: '0',
              filelist: JSON.stringify([{ path: att.onedrive_path, newname: nextFileName }]),
              ondup: 'fail',
            }).toString(),
          });
          const renameData = await renameResp.json().catch(() => ({}));
          if (!renameResp.ok || (renameData.errno !== undefined && renameData.errno !== 0)) {
            return end(res, 500, { error: '百度网盘重命名失败', details: renameData.errmsg || JSON.stringify(renameData) });
          }
          nextPath = replaceFileNameInPath(att.onedrive_path, nextFileName);
        } else if (provider === 'qiniu') {
          const { rows: accounts } = await pool.query('SELECT * FROM qiniu_accounts WHERE user_id = $1', [att.user_id]);
          if (!accounts.length) return end(res, 400, { error: '附件所有者未绑定七牛云账号' });
          const account = accounts[0];
          const region = account.region || 'z2';
          nextPath = replaceFileNameInPath(att.onedrive_path, nextFileName);
          const encodedFrom = Buffer.from(`${account.bucket}:${att.onedrive_path}`).toString('base64url');
          const encodedTo = Buffer.from(`${account.bucket}:${nextPath}`).toString('base64url');
          const movePath = `/move/${encodedFrom}/${encodedTo}/force/true`;
          const sign = crypto.createHmac('sha1', account.secret_key).update(`${movePath}\n`).digest('base64url');
          const moveResp = await fetch(`https://rs-${region}.qiniuapi.com${movePath}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `QBox ${account.access_key}:${sign}`,
            },
          });
          if (!moveResp.ok) {
            const errText = await moveResp.text();
            return end(res, 500, { error: '七牛云重命名失败', details: errText });
          }
          nextFileId = nextPath;
        } else if (provider === 'anyshare') {
          // AnyShare 的附件使用 docid 下载；先更新彩云笔记内文件名，避免调用未确认的远端重命名接口破坏文件。
          nextPath = att.onedrive_path;
          nextFileId = att.onedrive_file_id;
        }

        const mimeType = getMimeType(nextFileName);
        const { rows: updatedRows } = await pool.query(
          `UPDATE attachments
           SET file_name = $1, mime_type = $2, category = $3, onedrive_path = $4, onedrive_file_id = $5
           WHERE id = $6
           RETURNING *`,
          [nextFileName, mimeType, getCategory(mimeType), nextPath, nextFileId, attachment_id]
        );

        if (att.note_id) {
          const renameAttachNb = await pool.query('SELECT root_notebook_id FROM notes WHERE id = $1', [att.note_id]);
          if (renameAttachNb.rows[0]?.root_notebook_id) {
            sseBroadcast(renameAttachNb.rows[0].root_notebook_id, { type: 'note_updated', noteId: att.note_id, updatedBy: userId, notebookId: renameAttachNb.rows[0].root_notebook_id, reason: 'attachment_changed' }, userId).catch(() => {});
          }
        }

        return end(res, 200, { success: true, data: updatedRows[0] });
      } catch (renameErr) {
        console.error('[Attachments] 重命名失败:', renameErr.message);
        return end(res, 500, { error: '重命名失败: ' + renameErr.message });
      }
    }

// ===== Email API Routes =====
const emailUrl = req.url.startsWith('/api/email') ? req.url.replace(/^\/api/, '') : req.url;

// 添加邮箱账号
if (emailUrl === '/email/accounts' && req.method === 'POST') {
  if (!userId) return end(res, 401, { error: '未登录' });

  try {
    const { email_address, display_name, password, imap_host, imap_port, imap_ssl, smtp_host, smtp_port, smtp_ssl, notebook_id } = body || {};
    if (!email_address || !password) return end(res, 200, { success: false, error: '邮箱地址和密码不能为空' });

    const provider = emailService.detectProvider(email_address);
    const finalImapHost = imap_host || provider?.imap_host;
    const finalImapPort = imap_port || provider?.imap_port || 993;
    const finalSmtpHost = smtp_host || provider?.smtp_host;
    const finalSmtpPort = smtp_port || provider?.smtp_port || 465;

    if (!finalImapHost || !finalSmtpHost) return end(res, 200, { success: false, error: '无法识别邮箱服务商，请手动填写IMAP/SMTP配置' });

    const connConfig = { imap_host: finalImapHost, imap_port: finalImapPort, imap_ssl: imap_ssl !== false, smtp_host: finalSmtpHost, smtp_port: finalSmtpPort, smtp_ssl: smtp_ssl !== false, email: email_address, password };

    const imapTest = await emailService.testImapConnection(connConfig);
    if (!imapTest.success) return end(res, 200, { success: false, error: `IMAP连接失败: ${imapTest.error}` });

    const smtpTest = await emailService.testSmtpConnection(connConfig);
    if (!smtpTest.success) return end(res, 200, { success: false, error: `SMTP连接失败: ${smtpTest.error}` });

    const { encrypted, iv, authTag } = emailService.encrypt(password);

    const { rows } = await pool.query(`
      INSERT INTO email_accounts (user_id, email_address, display_name, imap_host, imap_port, imap_ssl, smtp_host, smtp_port, smtp_ssl, encrypted_password, iv, auth_tag)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (user_id, email_address) DO UPDATE SET
      display_name=$3, imap_host=$4, imap_port=$5, imap_ssl=$6, smtp_host=$7, smtp_port=$8, smtp_ssl=$9, encrypted_password=$10, iv=$11, auth_tag=$12, updated_at=NOW()
      RETURNING id, user_id, email_address, display_name, imap_host, imap_port, imap_ssl, smtp_host, smtp_port, smtp_ssl, encrypted_password, iv, auth_tag, last_sync_uid, last_sync_at, note_id
    `, [userId, email_address, display_name || '', finalImapHost, finalImapPort, imap_ssl !== false, finalSmtpHost, finalSmtpPort, smtp_ssl !== false, encrypted, iv, authTag]);

    const account = rows[0];
    const finalNotebookId = await ensureUserEmailNotebook(userId, notebook_id || null);
    const sectionId = await upsertEmailAccountSection(userId, finalNotebookId, account);

    syncEmailAccountWithPages(account.id, account).catch(e => console.error('Email sync error:', e.message));

    const publicAccount = {
      id: account.id,
      email_address: account.email_address,
      display_name: account.display_name,
      imap_host: account.imap_host,
      smtp_host: account.smtp_host,
      last_sync_at: account.last_sync_at,
      note_id: sectionId,
    };
    return end(res, 200, { success: true, account: publicAccount, notebookId: finalNotebookId, sectionId });
  } catch (err) {
    return end(res, err.statusCode || 200, { success: false, error: err.message });
  }
}

// 获取邮箱账号列表
if (emailUrl === '/email/accounts' && req.method === 'GET') {
  if (!userId) return end(res, 401, { error: '未登录' });

  const { rows } = await pool.query('SELECT id, email_address, display_name, imap_host, smtp_host, last_sync_at, sync_enabled, note_id FROM email_accounts WHERE user_id=$1 ORDER BY created_at', [userId]);
  return end(res, 200, { success: true, accounts: rows });
}

// 删除邮箱账号
if (emailUrl.match(/^\/email\/accounts\/[\w-]+$/) && req.method === 'DELETE') {
  if (!userId) return end(res, 401, { error: '未登录' });
  const accountId = emailUrl.split('/').pop();

  const { rows: accountRows } = await pool.query('SELECT note_id FROM email_accounts WHERE id=$1 AND user_id=$2', [accountId, userId]);
  await pool.query('DELETE FROM email_accounts WHERE id=$1 AND user_id=$2', [accountId, userId]);
  const noteId = accountRows[0]?.note_id || buildEmailAccountSectionId(accountId);
  await pool.query(`
    WITH RECURSIVE descendants AS (
      SELECT id FROM notes WHERE id = $1 AND owner_id = $2
      UNION ALL
      SELECT n.id FROM notes n INNER JOIN descendants d ON n.parent_id = d.id
    )
    DELETE FROM notes WHERE id IN (SELECT id FROM descendants)
  `, [noteId, userId]);

  return end(res, 200, { success: true });
}

// 手动同步
if (emailUrl.match(/^\/email\/sync\/[\w-]+$/) && req.method === 'POST') {
  if (!userId) return end(res, 401, { error: '未登录' });
  const accountId = emailUrl.split('/').pop();

  const { rows } = await pool.query('SELECT * FROM email_accounts WHERE id=$1 AND user_id=$2', [accountId, userId]);
  if (!rows.length) return end(res, 200, { success: false, error: '账号不存在' });

  try {
    const result = await syncEmailAccountWithPages(accountId, rows[0], { full: body?.full === true });
    return end(res, 200, { success: true, ...result });
  } catch (err) {
    return end(res, 200, { success: false, error: err.message });
  }
}

// 获取对话列表
if (emailUrl.match(/^\/email\/conversations\/[\w-]+$/) && req.method === 'GET') {
  if (!userId) return end(res, 401, { error: '未登录' });
  const accountId = emailUrl.split('/').pop();

  const { rows: accRows } = await pool.query('SELECT id FROM email_accounts WHERE id=$1 AND user_id=$2', [accountId, userId]);
  if (!accRows.length) return end(res, 200, { success: false, error: '账号不存在' });

  const { rows } = await pool.query(`
    SELECT c.*, c.note_id
    FROM email_conversations c
    WHERE c.account_id=$1 ORDER BY c.last_email_date DESC
  `, [accountId]);

  return end(res, 200, { success: true, conversations: rows });
}

// 获取对话中的邮件列表
if (emailUrl.match(/^\/email\/thread\/[\w-]+\/[^/]+$/) && req.method === 'GET') {
  if (!userId) return end(res, 401, { error: '未登录' });
  const parts = emailUrl.split('/');
  const accountId = parts[3];
  const otherAddr = decodeURIComponent(parts[4]);

  const { rows: accRows } = await pool.query('SELECT id FROM email_accounts WHERE id=$1 AND user_id=$2', [accountId, userId]);
  if (!accRows.length) return end(res, 200, { success: false, error: '账号不存在' });

  const { rows } = await pool.query(`
    SELECT * FROM email_index WHERE account_id=$1
    AND (from_addr ILIKE $2 OR to_list ILIKE $2)
    ORDER BY date ASC
  `, [accountId, `%${otherAddr}%`]);

  return end(res, 200, { success: true, emails: rows });
}

// 获取邮件详情
if (emailUrl.match(/^\/email\/message\/[\w-]+\/[\w-]+\/\d+$/) && req.method === 'GET') {
  if (!userId) return end(res, 401, { error: '未登录' });
  const parts = emailUrl.split('/');
  const accountId = parts[3];
  const folder = parts[4];
  const uid = parseInt(parts[5]);

  const { rows: [account] } = await pool.query('SELECT * FROM email_accounts WHERE id=$1 AND user_id=$2', [accountId, userId]);
  if (!account) return end(res, 200, { success: false, error: '账号不存在' });

  const result = await emailService.fetchEmailContent(account, folder, uid);
  return end(res, 200, result);
}

// 下载邮件附件：只做即时代理，不在云服务器保存附件内容
if (emailUrl.match(/^\/email\/attachment\/[\w-]+\/[\w-]+\/\d+\/\d+$/) && req.method === 'GET') {
  if (!userId) return end(res, 401, { error: '未登录' });
  const parts = emailUrl.split('/');
  const accountId = parts[3];
  const folder = parts[4];
  const uid = parseInt(parts[5], 10);
  const attachmentIndex = parseInt(parts[6], 10);

  const { rows: [account] } = await pool.query('SELECT * FROM email_accounts WHERE id=$1 AND user_id=$2', [accountId, userId]);
  if (!account) return end(res, 404, { error: '账号不存在' });

  const result = await emailService.fetchEmailAttachment(account, folder, uid, attachmentIndex);
  if (!result.success) return end(res, 404, { error: result.error || '附件不存在' });

  const fileName = result.filename || `attachment-${attachmentIndex + 1}`;
  res.writeHead(200, {
    'Content-Type': result.contentType || 'application/octet-stream',
    'Content-Length': result.content?.length || result.size || 0,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'Cache-Control': 'no-store',
  });
  return res.end(result.content);
}

// 发送邮件
if (emailUrl === '/email/send' && req.method === 'POST') {
  if (!userId) return end(res, 401, { error: '未登录' });

  try {
    const { account_id, to, subject, text, html, cc, attachments } = body || {};
    if (!account_id || !to || !subject) return end(res, 200, { success: false, error: '缺少必填字段' });

    const { rows: [account] } = await pool.query('SELECT * FROM email_accounts WHERE id=$1 AND user_id=$2', [account_id, userId]);
    if (!account) return end(res, 200, { success: false, error: '账号不存在' });

    const result = await emailService.sendEmail(account, { to, subject, text, html, cc, attachments });
    if (result.success) {
      syncEmailAccountWithPages(account_id, account).catch(e => console.error('Post-send sync error:', e.message));
    }
    return end(res, 200, result);
  } catch (err) {
    return end(res, 200, { success: false, error: err.message });
  }
}

    // 默认 404
    console.log(`[REQ #${reqId}] 404 Not Found`);
    end(res, 404, { error: 'Function Not Implemented' });

  } catch (e) {
    console.error(`[ERROR #${reqId}]`, e);
    end(res, 500, { error: e.message });
  } finally {
    console.log(`[REQ #${reqId}] Completed in ${Date.now() - startTime}ms\n`);
  }
});


async function start() {
  await ensureCollabTables();
  await ensureAnyShareTables();
  await ensureNotebookApiTables();
  await ensureEmailTables();
  await jiangsuOrgNotebook.ensureJiangsuOrgTables(pool);
  server.listen(PORT, HOST, () => {
    console.log('\n🚀 ========================================');
    console.log('   NotesApp v2.5 Core Running');
    console.log('   Host: ' + HOST);
    console.log('   Port: ' + PORT);
    console.log('   Collab Host: ' + COLLAB_HOST);
    console.log('   Collab Port: ' + COLLAB_PORT);
    console.log('   Auth: 100% Local (bcrypt + JWT)');
    console.log('   Data: 100% Local PostgreSQL');
    console.log('   CRDT: Hocuspocus + Yjs enabled');
    console.log('   CORS: ' + (ALLOWED_ORIGINS ? ALLOWED_ORIGINS.join(', ') : '*'));
    console.log('   Admin: ' + ADMIN_EMAIL);
    console.log('========================================\n');
  });
  await collabServer.listen(COLLAB_PORT);
}

start().catch((e) => {
  console.error('[BOOT] 启动失败:', e);
  process.exit(1);
});

// ================= 工具函数 =================
function end(res, code, data) {
  if (!res.getHeader('Content-Type')) {
    res.setHeader('Content-Type', 'application/json');
  }
  res.writeHead(code);
  res.end(JSON.stringify(data));
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('Body too large'));
        return;
      }
      b += c;
    });
    req.on('end', () => {
      try { resolve(b ? JSON.parse(b) : {}); }
      catch (e) { resolve({}); }
    });
  });
}

function parseUserId(t) {
  try {
    if (!t) return null;
    const parts = t.split('.');
    if (parts.length !== 3) return null;
    const h = parts[0], p = parts[1], sig = parts[2];
    // 验证 HMAC-SHA256 签名
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
    if (sig !== expectedSig) {
      console.log('[AUTH] JWT 签名验证失败');
      return null;
    }
    const payload = JSON.parse(Buffer.from(p, 'base64').toString());
    // 检查过期
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      console.log('[AUTH] JWT 已过期');
      return null;
    }
    return payload.sub || null;
  } catch { return null; }
}

function signJWT(user, ttlSeconds = AUTH_TOKEN_TTL_SECONDS) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const displayName = user.display_name || user.username || user.email.split('@')[0];
  const now = Math.floor(Date.now() / 1000);
  const p = Buffer.from(JSON.stringify({
    sub: user.id,
    email: user.email,
    display_name: displayName,
    role: 'authenticated',
    iat: now,
    exp: now + ttlSeconds
  })).toString('base64url');
  // 使用 HMAC-SHA256 签名（Node.js crypto 模块）
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

function hasMeaningfulDocNode(node) {
  if (!node) return false;
  if (typeof node === 'string') return node.trim().length > 0;
  if (typeof node.text === 'string' && node.text.trim().length > 0) return true;
  const meaningfulNodeTypes = new Set(['image', 'table', 'mindmap', 'routeBlock', 'attachmentBlock', 'folderBlock', 'audioBlock']);
  if (meaningfulNodeTypes.has(node.type)) return true;
  if (Array.isArray(node.content)) return node.content.some(hasMeaningfulDocNode);
  return false;
}

function isEmptyNoteContent(content) {
  if (content === null || content === undefined || content === '') return true;
  if (typeof content !== 'string') return false;
  const trimmed = content.trim();
  if (!trimmed || trimmed === 'null' || trimmed === '{}') return true;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.type === 'doc') return !hasMeaningfulDocNode(parsed);
  } catch (_) {}
  return false;
}

function hasMeaningfulNoteContent(content) {
  if (content === null || content === undefined || content === '') return false;
  if (typeof content !== 'string') return true;
  const trimmed = content.trim();
  if (!trimmed || trimmed === 'null' || trimmed === '{}') return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.type === 'doc') return hasMeaningfulDocNode(parsed);
  } catch (_) {
    return true;
  }
  return true;
}

function generateId() {
  return require('crypto').randomUUID();
}
