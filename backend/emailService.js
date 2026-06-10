const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'caiyun-notes-email-encryption-key-32b';
const ALGORITHM = 'aes-256-gcm';
const EMAIL_SYNC_WINDOW_DAYS = 90;

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), authTag };
}

function decrypt(encrypted, ivHex, authTag) {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const COMMON_PROVIDERS = {
  qq: { imap_host: 'imap.qq.com', imap_port: 993, smtp_host: 'smtp.qq.com', smtp_port: 465 },
  '163': { imap_host: 'imap.163.com', imap_port: 993, smtp_host: 'smtp.163.com', smtp_port: 465 },
  '126': { imap_host: 'imap.126.com', imap_port: 993, smtp_host: 'smtp.126.com', smtp_port: 465 },
  yeah: { imap_host: 'imap.yeah.net', imap_port: 993, smtp_host: 'smtp.yeah.net', smtp_port: 465 },
  sina: { imap_host: 'imap.sina.com', imap_port: 993, smtp_host: 'smtp.sina.com', smtp_port: 465 },
  outlook: { imap_host: 'outlook.office365.com', imap_port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_ssl: false },
  hotmail: { imap_host: 'outlook.office365.com', imap_port: 993, smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_ssl: false },
  gmail: { imap_host: 'imap.gmail.com', imap_port: 993, smtp_host: 'smtp.gmail.com', smtp_port: 465 },
  yahoo: { imap_host: 'imap.mail.yahoo.com', imap_port: 993, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 465 },
  icloud: { imap_host: 'imap.mail.me.com', imap_port: 993, smtp_host: 'smtp.mail.me.com', smtp_port: 587, smtp_ssl: false },
};

function detectProvider(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  for (const [name, config] of Object.entries(COMMON_PROVIDERS)) {
    if (domain.includes(name)) return { name, ...config };
  }
  return null;
}

function getEmailSyncSinceDate(now = new Date(), days = EMAIL_SYNC_WINDOW_DAYS) {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date;
}

function buildEmailSearchCriteria({ full = false, latestUid = 0, now = new Date(), syncWindowDays = EMAIL_SYNC_WINDOW_DAYS } = {}) {
  const startUid = full ? 1 : Math.max(Number(latestUid || 0) + 1, 1);
  return { uid: `${startUid}:*`, since: getEmailSyncSinceDate(now, syncWindowDays) };
}

function getStoredEmailFolder(folderName, sentFolder) {
  return folderName === sentFolder ? 'Sent' : folderName;
}

function shouldCountFetchedEmail({ full = false, latestUid = 0, uid = 0 } = {}) {
  if (full) return true;
  return Number(uid || 0) > Number(latestUid || 0);
}

function getFetchEmailContentOptions() {
  return { uid: true };
}

function getFetchEmailAttachmentOptions() {
  return { uid: true };
}

function hasBodyStructureAttachment(part) {
  if (!part || typeof part !== 'object') return false;

  const disposition = String(part.disposition || '').toLowerCase();
  const hasFilename = Boolean(
    part.filename ||
    part.parameters?.filename ||
    part.parameters?.name ||
    part.dispositionParameters?.filename ||
    part.dispositionParameters?.name
  );

  if (disposition === 'attachment' || hasFilename) return true;

  const children = Array.isArray(part.childNodes) ? part.childNodes : [];
  return children.some(hasBodyStructureAttachment);
}

async function testImapConnection(config) {
  const client = new ImapFlow({
    host: config.imap_host,
    port: config.imap_port,
    secure: config.imap_ssl !== false,
    auth: { user: config.email, pass: config.password },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function testSmtpConnection(config) {
  try {
    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_ssl !== false,
      auth: { user: config.email, pass: config.password },
    });
    await transporter.verify();
    transporter.close();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function buildConversationSummaries(accountId, myEmail, emails) {
  const myAddr = String(myEmail || '').toLowerCase();
  const conversations = new Map();

  for (const email of emails) {
    const folder = email.folder;
    const isSent = folder === 'Sent';
    const otherAddr = (isSent ? extractFirstAddress(email.to_list || '') : email.from_addr || '').toLowerCase();
    if (!otherAddr) continue;

    const key = `${accountId}-${otherAddr}`;
    const otherName = isSent ? extractFirstName(email.to_list || '') : (email.from_name || '');
    const date = email.date ? new Date(email.date) : null;
    const existing = conversations.get(key);

    if (!existing) {
      conversations.set(key, {
        account_id: accountId,
        other_addr: otherAddr,
        other_name: otherName || (otherAddr === myAddr ? myEmail : ''),
        last_email_date: date,
        last_subject: email.subject || '',
        total_count: 1,
        unread_count: folder === 'INBOX' && !email.is_read ? 1 : 0,
      });
      continue;
    }

    existing.total_count += 1;
    if (folder === 'INBOX' && !email.is_read) existing.unread_count += 1;
    if (!existing.other_name && otherName) existing.other_name = otherName;
    if (date && (!existing.last_email_date || date > existing.last_email_date)) {
      existing.last_email_date = date;
      existing.last_subject = email.subject || '';
      if (otherName) existing.other_name = otherName;
    }
  }

  return [...conversations.values()];
}

async function refreshEmailConversations(pool, accountId, myEmail) {
  const { rows } = await pool.query(
    `SELECT folder, from_addr, from_name, to_list, subject, date, is_read
     FROM email_index
     WHERE account_id = $1`,
    [accountId]
  );
  const summaries = buildConversationSummaries(accountId, myEmail, rows);
  const summaryAddrs = summaries.map(conversation => conversation.other_addr).filter(Boolean);

  for (const conversation of summaries) {
    await pool.query(`
      INSERT INTO email_conversations (id, account_id, other_addr, other_name, last_email_date, last_subject, total_count, unread_count)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (account_id, other_addr) DO UPDATE SET
      other_name=$3, last_email_date=$4, last_subject=$5, total_count=$6, unread_count=$7, updated_at=NOW()
    `, [
      conversation.account_id,
      conversation.other_addr,
      conversation.other_name,
      conversation.last_email_date,
      conversation.last_subject,
      conversation.total_count,
      conversation.unread_count,
    ]);
  }

  if (summaryAddrs.length > 0) {
    await pool.query(
      `DELETE FROM email_conversations
       WHERE account_id = $1 AND NOT (other_addr = ANY($2::text[]))`,
      [accountId, summaryAddrs]
    );
  } else {
    await pool.query('DELETE FROM email_conversations WHERE account_id = $1', [accountId]);
  }

  return summaries;
}

async function pruneEmailIndexToWindow(pool, accountId, cutoffDate) {
  await pool.query(
    `DELETE FROM email_index
     WHERE account_id = $1 AND (date IS NULL OR date < $2)`,
    [accountId, cutoffDate]
  );
}

async function syncEmails(pool, accountId, accountConfig, options = {}) {
  const syncNow = options.now || new Date();
  const password = decrypt(accountConfig.encrypted_password, accountConfig.iv, accountConfig.auth_tag);
  const client = new ImapFlow({
    host: accountConfig.imap_host,
    port: accountConfig.imap_port,
    secure: accountConfig.imap_ssl !== false,
    auth: { user: accountConfig.email_address, pass: password },
    logger: false,
  });

  const results = { inbox: 0, sent: 0, conversations: 0 };

  try {
    await client.connect();

    const sentFolder = await findSentFolder(client);
    const folders = [
      { remoteName: 'INBOX', storedName: 'INBOX' },
      { remoteName: sentFolder || 'Sent', storedName: 'Sent' },
    ];

    for (const folder of folders) {
      let lock;
      try {
        lock = await client.getMailboxLock(folder.remoteName);
      } catch (e) {
        continue;
      }

      try {
        const { rows: [folderState] } = await pool.query(
          'SELECT COALESCE(MAX(uid), 0) AS latest_uid FROM email_index WHERE account_id = $1 AND folder = $2',
          [accountId, folder.storedName]
        );
        const latestUid = Number(folderState?.latest_uid || 0);
        const searchCriteria = buildEmailSearchCriteria({
          full: options.full === true,
          latestUid,
          now: syncNow,
        });

        for await (const msg of client.fetch(searchCriteria, { envelope: true, flags: true, uid: true, size: true, bodyStructure: true })) {
          const fromAddr = msg.envelope.from?.[0]?.address || '';
          const fromName = msg.envelope.from?.[0]?.name || '';
          const toList = msg.envelope.to?.map(t => `${t.name || ''} <${t.address}>`).join(', ') || '';
          const ccList = msg.envelope.cc?.map(c => `${c.name || ''} <${c.address}>`).join(', ') || '';

          await pool.query(`
            INSERT INTO email_index (account_id, uid, folder, message_id, from_addr, from_name, to_list, cc_list, subject, date, has_attachments, is_read, is_starred, size)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT (account_id, uid, folder) DO UPDATE SET
            from_addr=$5, from_name=$6, to_list=$7, cc_list=$8, subject=$9, date=$10, is_read=$12, is_starred=$13
          `, [accountId, msg.uid, folder.storedName, msg.envelope.messageId, fromAddr, fromName, toList, ccList,
            msg.envelope.subject, msg.envelope.date, hasBodyStructureAttachment(msg.bodyStructure), msg.flags?.has('\\Seen') || false, msg.flags?.has('\\Flagged') || false, msg.size]);

          if (shouldCountFetchedEmail({ full: options.full === true, latestUid, uid: msg.uid })) {
            if (folder.storedName === 'INBOX') results.inbox++;
            else results.sent++;
          }
        }
      } finally {
        lock.release();
      }
    }

    const cutoffDate = getEmailSyncSinceDate(syncNow);
    await pruneEmailIndexToWindow(pool, accountId, cutoffDate);

    const conversations = await refreshEmailConversations(pool, accountId, accountConfig.email_address);
    results.conversations = conversations.length;

    await pool.query('UPDATE email_accounts SET last_sync_at=NOW(), last_sync_uid=(SELECT COALESCE(MAX(uid),0) FROM email_index WHERE account_id=$1) WHERE id=$1', [accountId]);

  } finally {
    try { await client.logout(); } catch (e) {}
  }

  return results;
}

async function findSentFolder(client) {
  const folders = await client.list();
  const sentNames = ['Sent', 'Sent Messages', '已发送', '已发送邮件', 'INBOX.Sent'];
  for (const f of folders) {
    if (sentNames.some(n => f.path.toLowerCase().includes(n.toLowerCase()))) return f.path;
  }
  return null;
}

function extractFirstAddress(toList) {
  const match = toList.match(/<([^>]+)>/);
  return match ? match[1] : toList.split(',')[0]?.trim();
}

function extractFirstName(toList) {
  const match = toList.match(/^([^<]+)</);
  return match ? match[1].trim() : '';
}

async function fetchEmailContent(accountConfig, folder, uid) {
  const password = decrypt(accountConfig.encrypted_password, accountConfig.iv, accountConfig.auth_tag);
  const client = new ImapFlow({
    host: accountConfig.imap_host,
    port: accountConfig.imap_port,
    secure: accountConfig.imap_ssl !== false,
    auth: { user: accountConfig.email_address, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const folderName = folder === 'Sent' ? (await findSentFolder(client) || 'Sent') : 'INBOX';
    const lock = await client.getMailboxLock(folderName);
    try {
      const msg = await client.fetchOne(uid, { source: true }, getFetchEmailContentOptions());
      const rawSource = msg.source?.toString();
      if (!rawSource) return { success: false, error: '邮件内容为空' };

      try {
        const parsed = await simpleParser(rawSource);
        return {
          success: true,
          text: parsed.text || '',
          html: parsed.html || '',
          from: parsed.from?.text || '',
          to: parsed.to?.text || '',
          cc: parsed.cc?.text || '',
          subject: parsed.subject || '',
          date: parsed.date?.toISOString() || '',
          attachments: (parsed.attachments || []).map(a => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
          })),
        };
      } catch (parseErr) {
        return { success: true, source: rawSource, parseError: parseErr.message };
      }
    } finally {
      lock.release();
    }
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    try { await client.logout(); } catch (e) {}
  }
}

async function fetchEmailAttachment(accountConfig, folder, uid, attachmentIndex) {
  const password = decrypt(accountConfig.encrypted_password, accountConfig.iv, accountConfig.auth_tag);
  const client = new ImapFlow({
    host: accountConfig.imap_host,
    port: accountConfig.imap_port,
    secure: accountConfig.imap_ssl !== false,
    auth: { user: accountConfig.email_address, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const folderName = folder === 'Sent' ? (await findSentFolder(client) || 'Sent') : 'INBOX';
    const lock = await client.getMailboxLock(folderName);
    try {
      const msg = await client.fetchOne(uid, { source: true }, getFetchEmailAttachmentOptions());
      const rawSource = msg.source?.toString();
      if (!rawSource) return { success: false, error: '邮件内容为空' };

      const parsed = await simpleParser(rawSource);
      const attachments = parsed.attachments || [];
      const index = Number(attachmentIndex);
      if (!Number.isInteger(index) || index < 0 || index >= attachments.length) {
        return { success: false, error: '附件不存在' };
      }

      const attachment = attachments[index];
      return {
        success: true,
        filename: attachment.filename || `attachment-${index + 1}`,
        contentType: attachment.contentType || 'application/octet-stream',
        size: attachment.size || attachment.content?.length || 0,
        content: attachment.content,
      };
    } finally {
      lock.release();
    }
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    try { await client.logout(); } catch (e) {}
  }
}

async function sendEmail(accountConfig, { to, subject, text, html, cc, attachments }) {
  const password = decrypt(accountConfig.encrypted_password, accountConfig.iv, accountConfig.auth_tag);
  const transporter = nodemailer.createTransport({
    host: accountConfig.smtp_host,
    port: accountConfig.smtp_port,
    secure: accountConfig.smtp_ssl !== false,
    auth: { user: accountConfig.email_address, pass: password },
  });

  try {
    const info = await transporter.sendMail({
      from: `"${accountConfig.display_name || accountConfig.email_address}" <${accountConfig.email_address}>`,
      to, cc, subject, text, html, attachments,
    });
    transporter.close();
    return { success: true, messageId: info.messageId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  encrypt, decrypt, detectProvider, COMMON_PROVIDERS,
  testImapConnection, testSmtpConnection, syncEmails,
  fetchEmailContent, fetchEmailAttachment, sendEmail, findSentFolder,
  extractFirstAddress, extractFirstName,
  buildEmailSearchCriteria, getStoredEmailFolder,
  shouldCountFetchedEmail, getFetchEmailContentOptions, getFetchEmailAttachmentOptions,
  hasBodyStructureAttachment,
  getEmailSyncSinceDate, pruneEmailIndexToWindow,
  buildConversationSummaries, refreshEmailConversations,
};
