const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/components/EmailThreadView.tsx'), 'utf8');

assert.match(source, /preloadEmailContents/, 'email thread should eagerly load message bodies');
assert.match(source, /getCachedEmailContent/, 'email thread should reuse locally cached message bodies');
assert.match(source, /setCachedEmailContent/, 'email thread should persist loaded message bodies locally');
assert.match(source, /getCachedEmailThread/, 'email thread should show cached message lists immediately after page switches');
assert.match(source, /setCachedEmailThread/, 'email thread should persist message lists locally');
assert.match(source, /downloadEmailAttachment/, 'email thread should expose attachment downloads');
assert.match(source, /email-attachment-list/, 'email thread should render an attachment list');
assert.match(source, /normalizeEmailContentPayload/, 'email thread should use shared HTML-preserving content normalization');
assert.match(source, /email-message-bubble/, 'email message bubbles should have a stable full-width layout class');
assert.match(source, /max-w-\[75%\]/, 'email message bubbles should use 75% max width so incoming and outgoing messages remain visually distinct');
assert.match(source, /justify-end/, 'outgoing email message bubbles should align to the right');
assert.match(source, /justify-start/, 'incoming email message bubbles should align to the left');
assert.doesNotMatch(source, /点击查看邮件内容/, 'email thread should not render a click-to-expand prompt');
assert.doesNotMatch(source, /expandedId/, 'email thread should not keep per-message expanded state');
assert.doesNotMatch(source, /邮件内容暂不可用/, 'unloaded messages should show loading or an explicit error, not unavailable content');
assert.doesNotMatch(source, /max-w-\[min\(760px,85%\)\]/, 'email message bubbles should no longer use narrow chat bubble width');

const noteEditorSource = fs.readFileSync(path.resolve(__dirname, '../src/components/NoteEditor.tsx'), 'utf8');
assert.match(noteEditorSource, /const RichNoteEditor/, 'rich TipTap editor should be isolated from the exported email-aware wrapper');
assert.match(noteEditorSource, /EmailThreadStandaloneEditor/, 'email pages should render through a standalone non-TipTap editor shell');
assert.match(noteEditorSource, /return <EmailThreadStandaloneEditor/, 'email pages should bypass the TipTap editor component entirely');
