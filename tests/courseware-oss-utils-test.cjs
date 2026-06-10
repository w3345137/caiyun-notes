const assert = require('node:assert/strict');

const {
  buildOssCanonicalResource,
  buildSignedOssUrl,
  listCoursewareObjects,
  parseOssListBucketXml,
  normalizeCoursewarePrefix,
} = require('../backend/coursewareOss');

assert.equal(normalizeCoursewarePrefix('college/data'), 'college/data/');
assert.equal(normalizeCoursewarePrefix('/college/data//课件'), 'college/data/课件/');
assert.equal(normalizeCoursewarePrefix(''), '');

assert.equal(
  buildOssCanonicalResource('kg-college', {
    'max-keys': 100,
    prefix: 'college/data/',
    delimiter: '/',
  }),
  '/kg-college/'
);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>kg-college</Name>
  <Prefix>college/data/</Prefix>
  <Marker></Marker>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>false</IsTruncated>
  <CommonPrefixes><Prefix>college/data/制度/</Prefix></CommonPrefixes>
  <Contents>
    <Key>college/data/课程 &amp; 培训.pdf</Key>
    <LastModified>2026-06-10T01:02:03.000Z</LastModified>
    <Size>12345</Size>
  </Contents>
</ListBucketResult>`;

const parsed = parseOssListBucketXml(xml, 'college/data/');
assert.equal(parsed.directories.length, 1);
assert.equal(parsed.directories[0].name, '制度');
assert.equal(parsed.directories[0].prefix, '制度/');
assert.equal(parsed.files.length, 1);
assert.equal(parsed.files[0].name, '课程 & 培训.pdf');
assert.equal(parsed.files[0].key, 'college/data/课程 & 培训.pdf');
assert.equal(parsed.files[0].relativePath, '课程 & 培训.pdf');
assert.equal(parsed.files[0].size, 12345);
assert.equal(parsed.isTruncated, false);

const nestedXml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>kg-college</Name>
  <Prefix>college/data/</Prefix>
  <IsTruncated>false</IsTruncated>
  <Contents>
    <Key>college/data/制度/安全课件.pdf</Key>
    <LastModified>2026-06-10T01:02:03.000Z</LastModified>
    <Size>22345</Size>
  </Contents>
</ListBucketResult>`;
const nestedParsed = parseOssListBucketXml(nestedXml, 'college/data/');
assert.equal(nestedParsed.files[0].name, '安全课件.pdf');
assert.equal(nestedParsed.files[0].relativePath, '制度/安全课件.pdf');

let fetchCalls = [];
global.fetch = async (url) => {
  fetchCalls.push(url);
  const isRecursiveFilePass = !String(url).includes('delimiter=');
  return {
    ok: true,
    text: async () => (isRecursiveFilePass ? nestedXml : xml),
  };
};

listCoursewareObjects({
  endpoint: 'https://oss-cn-shanghai.aliyuncs.com',
  bucket: 'kg-college',
  basePrefix: 'college/data/',
  accessKeyId: 'test-id',
  accessKeySecret: 'test-secret',
}, { recursive: true }).then((recursiveResult) => {
  assert.equal(fetchCalls.length, 2);
  assert.equal(recursiveResult.directories.length, 1);
  assert.equal(recursiveResult.files.length, 1);
  assert.equal(recursiveResult.files[0].relativePath, '制度/安全课件.pdf');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const signed = buildSignedOssUrl({
  endpoint: 'https://oss-cn-shanghai.aliyuncs.com',
  bucket: 'kg-college',
  accessKeyId: 'test-id',
  accessKeySecret: 'test-secret',
}, 'college/data/课程.pdf', { expiresAt: 1893456000 });

assert.match(signed, /^https:\/\/kg-college\.oss-cn-shanghai\.aliyuncs\.com\/college\/data\/%E8%AF%BE%E7%A8%8B\.pdf\?/);
assert.match(signed, /OSSAccessKeyId=test-id/);
assert.match(signed, /Expires=1893456000/);
assert.equal(signed.includes('test-secret'), false);

console.log('courseware-oss-utils-test passed');
