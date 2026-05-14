const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'caiyun-notes-email-encryption-key-32b';
const ALGORITHM = 'aes-256-gcm';

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

async function syncEmails(pool, accountId, accountConfig) {
  const password = decrypt(accountConfig.encrypted_password, accountConfig.iv, accountConfig.auth_tag);
  const client = new ImapFlow({
    host: accountConfig.imap_host,
    port: accountConfig.imap_port,
    secure: accountConfig.imap_ssl !== false,
    auth: { user: accountConfig.email_address, pass: password },
    logger: false,
  });

  const results = { inbox: 0, sent: 0, conversations: new Map() };

  try {
    await client.connect();

    for (const folder of ['INBOX', 'Sent']) {
      const folderName = folder === 'Sent' ? (await findSentFolder(client) || 'Sent') : 'INBOX';
      let lock;
      try {
        lock = await client.getMailboxLock(folderName);
      } catch (e) {
        continue;
      }

      try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const searchCriteria = { since, uid: accountConfig.last_sync_uid > 0 ? `${accountConfig.last_sync_uid + 1}:*` : '1:*' };

        for await (const msg of client.fetch(searchCriteria, { envelope: true, flags: true, uid: true, size: true })) {
          const fromAddr = msg.envelope.from?.[0]?.address || '';
          const fromName = msg.envelope.from?.[0]?.name || '';
          const toList = msg.envelope.to?.map(t => `${t.name || ''} <${t.address}>`).join(', ') || '';
          const ccList = msg.envelope.cc?.map(c => `${c.name || ''} <${c.address}>`).join(', ') || '';

          const emailId = `${accountId}-${folder}-${msg.uid}`;
          await pool.query(`
            INSERT INTO email_index (id, account_id, uid, folder, message_id, from_addr, from_name, to_list, cc_list, subject, date, has_attachments, is_read, is_starred, size)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (account_id, uid, folder) DO UPDATE SET
            from_addr=$6, from_name=$7, to_list=$8, cc_list=$9, subject=$10, date=$11, is_read=$13, is_starred=$14
          `, [emailId, accountId, msg.uid, folder, msg.envelope.messageId, fromAddr, fromName, toList, ccList,
            msg.envelope.subject, msg.envelope.date, false, !msg.flags?.has('\\Seen'), msg.flags?.has('\\Flagged') || false, msg.size]);

          if (folder === 'INBOX') results.inbox++;
          else results.sent++;

          const otherAddr = folder === 'INBOX' ? fromAddr : extractFirstAddress(toList);
          if (otherAddr) {
            const key = `${accountId}-${otherAddr.toLowerCase()}`;
            if (!results.conversations.has(key)) {
              results.conversations.set(key, { addr: otherAddr.toLowerCase(), name: folder === 'INBOX' ? fromName : extractFirstName(toList), date: msg.envelope.date, subject: msg.envelope.subject });
            } else {
              const existing = results.conversations.get(key);
              if (msg.envelope.date > existing.date) {
                existing.date = msg.envelope.date;
                existing.subject = msg.envelope.subject;
              }
            }
          }
        }
      } finally {
        lock.release();
      }
    }

    for (const conv of results.conversations.values()) {
      await pool.query(`
        INSERT INTO email_conversations (id, account_id, other_addr, other_name, last_email_date, last_subject, total_count)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 1)
        ON CONFLICT (account_id, other_addr) DO UPDATE SET
        other_name=$3, last_email_date=$4, last_subject=$5, total_count=email_conversations.total_count+1, updated_at=NOW()
      `, [accountId, conv.addr, conv.name, conv.date, conv.subject]);
    }

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
      const msg = await client.fetchOne(uid, { source: true });
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
  fetchEmailContent, sendEmail, findSentFolder,
  extractFirstAddress, extractFirstName,
};
