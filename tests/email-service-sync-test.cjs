const assert = require('node:assert/strict');

const {
  buildEmailSearchCriteria,
  buildConversationSummaries,
  getEmailSyncSinceDate,
  hasBodyStructureAttachment,
  getStoredEmailFolder,
  shouldCountFetchedEmail,
  getFetchEmailContentOptions,
  getFetchEmailAttachmentOptions,
} = require('../backend/emailService');

const fixedNow = new Date('2026-06-01T12:00:00Z');
const expectedSince = new Date('2026-03-03T12:00:00Z');

assert.deepEqual(
  getEmailSyncSinceDate(fixedNow),
  expectedSince,
  'email sync should use a 90 day rolling window',
);

assert.deepEqual(
  buildEmailSearchCriteria({ full: true, latestUid: 99, now: fixedNow }),
  { uid: '1:*', since: expectedSince },
  'full sync should still be limited to the last 90 days',
);

assert.deepEqual(
  buildEmailSearchCriteria({ full: false, latestUid: 41, now: fixedNow }),
  { uid: '42:*', since: expectedSince },
  'incremental sync should continue from the folder-specific latest uid within the 90 day window',
);

assert.deepEqual(
  buildEmailSearchCriteria({ full: false, latestUid: 0, now: fixedNow }),
  { uid: '1:*', since: expectedSince },
  'first incremental sync should scan only the last 90 days',
);

assert.equal(getStoredEmailFolder('INBOX', '已发送'), 'INBOX');
assert.equal(getStoredEmailFolder('已发送', '已发送'), 'Sent');
assert.equal(shouldCountFetchedEmail({ full: false, latestUid: 10, uid: 10 }), false);
assert.equal(shouldCountFetchedEmail({ full: false, latestUid: 10, uid: 11 }), true);
assert.equal(shouldCountFetchedEmail({ full: true, latestUid: 10, uid: 10 }), true);
assert.deepEqual(getFetchEmailContentOptions(), { uid: true }, 'message content must be fetched by UID, not IMAP sequence number');
assert.deepEqual(getFetchEmailAttachmentOptions(), { uid: true }, 'message attachments must be fetched by UID, not IMAP sequence number');

assert.equal(hasBodyStructureAttachment(null), false);
assert.equal(hasBodyStructureAttachment({ type: 'text', disposition: 'inline' }), false);
assert.equal(
  hasBodyStructureAttachment({
    childNodes: [
      { type: 'text', disposition: 'inline' },
      { disposition: 'attachment', parameters: { name: '方案.pdf' } },
    ],
  }),
  true,
  'email index should detect attachment body parts without fetching message bodies',
);
assert.equal(
  hasBodyStructureAttachment({
    childNodes: [
      { disposition: 'inline', dispositionParameters: { filename: 'logo.png' } },
    ],
  }),
  true,
  'inline MIME parts with filenames should still be exposed as downloadable attachments',
);

const summaries = buildConversationSummaries('acc-1', 'me@example.com', [
  {
    folder: 'INBOX',
    from_addr: 'Other@Example.com',
    from_name: '客户',
    to_list: 'me@example.com',
    subject: '早期邮件',
    date: new Date('2026-01-01T00:00:00Z'),
    is_read: false,
  },
  {
    folder: 'INBOX',
    from_addr: 'other@example.com',
    from_name: '客户',
    to_list: 'me@example.com',
    subject: '最新邮件',
    date: new Date('2026-02-01T00:00:00Z'),
    is_read: true,
  },
  {
    folder: 'Sent',
    from_addr: 'me@example.com',
    from_name: '我',
    to_list: 'Other <other@example.com>',
    subject: '回复',
    date: new Date('2026-01-15T00:00:00Z'),
    is_read: true,
  },
]);

assert.equal(summaries.length, 1);
assert.equal(summaries[0].other_addr, 'other@example.com');
assert.equal(summaries[0].other_name, '客户');
assert.equal(summaries[0].last_subject, '最新邮件');
assert.equal(summaries[0].total_count, 3);
assert.equal(summaries[0].unread_count, 1);
