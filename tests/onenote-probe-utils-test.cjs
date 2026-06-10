const assert = require('node:assert/strict');

const {
  buildOneDriveScope,
  getGraphEndpoint,
  classifyGraphProbeResponse,
  summarizeOneNoteProbeResults,
} = require('../backend/onenoteProbe');

const chinaScope = buildOneDriveScope('世纪互联', true);
assert.match(chinaScope, /https:\/\/microsoftgraph\.chinacloudapi\.cn\/Files\.ReadWrite\.All/);
assert.match(chinaScope, /https:\/\/microsoftgraph\.chinacloudapi\.cn\/Notes\.Read/);
assert.match(chinaScope, /offline_access/);

const internationalScope = buildOneDriveScope('international', true);
assert.match(internationalScope, /Files\.ReadWrite\.All/);
assert.match(internationalScope, /User\.Read/);
assert.match(internationalScope, /Notes\.Read/);
assert.match(internationalScope, /offline_access/);

assert.equal(getGraphEndpoint('世纪互联'), 'https://microsoftgraph.chinacloudapi.cn/v1.0');
assert.equal(getGraphEndpoint('international'), 'https://graph.microsoft.com/v1.0');

const authError = classifyGraphProbeResponse(403, {
  error: { code: 'Authorization_RequestDenied', message: 'Insufficient privileges to complete the operation.' },
});
assert.equal(authError.needs_reauth, true);
assert.equal(authError.supported, false);

const unsupportedError = classifyGraphProbeResponse(400, {
  error: { code: 'BadRequest', message: 'OneNote API is not supported in this cloud.' },
});
assert.equal(unsupportedError.needs_reauth, false);
assert.equal(unsupportedError.supported, false);

const summary = summarizeOneNoteProbeResults([
  {
    target: 'notebooks',
    status: 200,
    ok: true,
    data: {
      value: [
        { id: 'nb1', displayName: '工作笔记', createdDateTime: '2026-01-01T00:00:00Z', content: '<html>secret</html>' },
      ],
    },
  },
  {
    target: 'sections',
    status: 200,
    ok: true,
    data: { value: [{ id: 'sec1', displayName: '分区 A' }] },
  },
  {
    target: 'pages',
    status: 200,
    ok: true,
    data: { value: [{ id: 'page1', title: '页面 A', contentUrl: 'https://example.invalid/content' }] },
  },
]);

assert.equal(summary.success, true);
assert.equal(summary.supported, true);
assert.equal(summary.needs_reauth, false);
assert.equal(summary.notebooks_count, 1);
assert.equal(summary.sections_count, 1);
assert.equal(summary.pages_count, 1);
assert.deepEqual(summary.samples.notebooks[0], {
  id: 'nb1',
  title: '工作笔记',
  createdDateTime: '2026-01-01T00:00:00Z',
  lastModifiedDateTime: null,
});
assert.equal(JSON.stringify(summary).includes('secret'), false);
assert.equal(JSON.stringify(summary).includes('contentUrl'), false);

console.log('onenote probe utils tests passed');
