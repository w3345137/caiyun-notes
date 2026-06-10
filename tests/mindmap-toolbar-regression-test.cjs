const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const noteEditorPath = path.join(__dirname, '../src/components/NoteEditor.tsx');
const noteEditorSource = fs.readFileSync(noteEditorPath, 'utf8');

assert.doesNotMatch(
  noteEditorSource,
  /doc\.descendants\(\(node[\s\S]*node\.type\.name === 'mindmap'/,
  'mindmap toolbar visibility must not be based on whether the document merely contains a mindmap'
);

assert.match(
  noteEditorSource,
  /isMindmapToolbarActive\(editor\)/,
  'mindmap toolbar visibility should be derived from the current editor selection'
);

console.log('mindmap toolbar regression tests passed');
