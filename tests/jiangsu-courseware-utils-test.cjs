const assert = require('node:assert/strict');

const {
  COURSEWARE_PAGE_ID,
  COURSEWARE_PAGE_KIND,
  KNOWLEDGE_SECTION_ID,
  buildCoursewarePageContent,
  isProtectedOrgNoteContent,
  parseOrgPageContent,
} = require('../backend/jiangsuOrgNotebookUtils');

assert.equal(KNOWLEDGE_SECTION_ID, 'jiangsu-company-knowledge');
assert.equal(COURSEWARE_PAGE_ID, 'jiangsu-company-courseware');

const raw = buildCoursewarePageContent({ prefix: 'college/data', title: '课件' });
const parsed = JSON.parse(raw);
assert.equal(parsed.kind, COURSEWARE_PAGE_KIND);
assert.equal(parsed.title, '课件');
assert.equal(parsed.prefix, 'college/data/');
assert.equal(parseOrgPageContent(raw), null);
assert.equal(isProtectedOrgNoteContent(raw), false);

console.log('jiangsu-courseware-utils-test passed');
