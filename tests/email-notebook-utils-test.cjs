const assert = require('node:assert/strict');

const {
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
} = require('../backend/emailNotebookUtils');

assert.equal(buildEmailNotebookId('2f178b6f-ae65-4f38-83bf-2c4f1ea32e72'), 'email-notebook-2f178b6f-ae65-4f38-83bf-2c4f1ea32e72');
assert.equal(buildEmailAccountSectionId('acc-1'), 'email-sec-acc-1');
assert.equal(normalizeEmailAddress('  USER@Example.COM '), 'user@example.com');

const threadIdA = buildEmailThreadPageId('acc-1', 'USER@Example.COM');
const threadIdB = buildEmailThreadPageId('acc-1', 'user@example.com');
assert.equal(threadIdA, threadIdB);
assert.match(threadIdA, /^email-page-acc-1-[0-9a-f]{20}$/);

const accountContent = parseEmailNoteContent(buildEmailAccountContent({
  id: 'acc-1',
  email_address: 'me@example.com',
  display_name: '工作邮箱',
}));
assert.equal(accountContent.kind, EMAIL_ACCOUNT_CONTENT_KIND);
assert.equal(accountContent.accountId, 'acc-1');
assert.equal(accountContent.emailAddress, 'me@example.com');

const threadContent = parseEmailNoteContent(buildEmailThreadPageContent({
  accountId: 'acc-1',
  otherAddr: 'Other@Example.COM',
  otherName: '客户',
  myEmail: 'me@example.com',
  conversationId: 'conv-1',
}));
assert.equal(threadContent.kind, EMAIL_THREAD_CONTENT_KIND);
assert.equal(threadContent.otherAddr, 'other@example.com');
assert.equal(threadContent.otherName, '客户');

assert.equal(buildEmailThreadTitle({ other_name: '客户', other_addr: 'other@example.com' }), '客户');
assert.equal(buildEmailThreadTitle({ other_name: '', other_addr: 'other@example.com' }), 'other@example.com');
assert.equal(parseEmailNoteContent('not-json'), null);
