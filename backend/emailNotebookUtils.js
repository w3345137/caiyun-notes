const crypto = require('crypto');

const EMAIL_ACCOUNT_CONTENT_KIND = 'email_account';
const EMAIL_THREAD_CONTENT_KIND = 'email_thread';

function buildEmailNotebookId(userId) {
  return `email-notebook-${String(userId || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function buildEmailAccountSectionId(accountId) {
  return `email-sec-${accountId}`;
}

function normalizeEmailAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function hashEmailThreadKey(accountId, otherAddr) {
  return crypto
    .createHash('sha1')
    .update(`${accountId}:${normalizeEmailAddress(otherAddr)}`)
    .digest('hex')
    .slice(0, 20);
}

function buildEmailThreadPageId(accountId, otherAddr) {
  return `email-page-${accountId}-${hashEmailThreadKey(accountId, otherAddr)}`;
}

function buildEmailAccountContent(account) {
  return JSON.stringify({
    kind: EMAIL_ACCOUNT_CONTENT_KIND,
    accountId: account.id,
    emailAddress: account.email_address,
    displayName: account.display_name || '',
  });
}

function buildEmailThreadPageContent({ accountId, otherAddr, otherName, myEmail, conversationId }) {
  return JSON.stringify({
    kind: EMAIL_THREAD_CONTENT_KIND,
    accountId,
    otherAddr: normalizeEmailAddress(otherAddr),
    otherName: otherName || '',
    myEmail: myEmail || '',
    conversationId: conversationId || null,
  });
}

function buildEmailThreadTitle(conversation) {
  return conversation.other_name || conversation.other_addr || '邮件会话';
}

function parseEmailNoteContent(content) {
  if (!content) return null;
  if (typeof content === 'object') return content;
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  EMAIL_ACCOUNT_CONTENT_KIND,
  EMAIL_THREAD_CONTENT_KIND,
  buildEmailNotebookId,
  buildEmailAccountSectionId,
  buildEmailThreadPageId,
  buildEmailAccountContent,
  buildEmailThreadPageContent,
  buildEmailThreadTitle,
  normalizeEmailAddress,
  parseEmailNoteContent,
};
