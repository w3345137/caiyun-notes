const assert = require('node:assert/strict');

const {
  normalizeAnyShareBaseUrl,
  buildAnyShareBasicAuth,
  parseAnyShareAuthRequest,
  maskAnyShareAccount,
} = require('../backend/anyshareProvider');

assert.equal(normalizeAnyShareBaseUrl(' https://share.example.com/ '), 'https://share.example.com');
assert.equal(normalizeAnyShareBaseUrl('https://share.example.com/api/'), 'https://share.example.com/api');

assert.equal(
  buildAnyShareBasicAuth('client-id', 'client-secret'),
  `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`
);

assert.deepEqual(parseAnyShareAuthRequest([
  'PUT',
  'https://object.example.com/upload',
  'Content-Type: application/octet-stream',
  'X-Token: abc:def',
]), {
  method: 'PUT',
  url: 'https://object.example.com/upload',
  headers: {
    'Content-Type': 'application/octet-stream',
    'X-Token': 'abc:def',
  },
});

assert.deepEqual(maskAnyShareAccount({
  user_id: 'u1',
  base_url: 'https://share.example.com',
  client_id: '920132f5-3772',
  client_secret: 'secret',
  root_docid: 'gns://abc',
  root_name: '文档库',
}), {
  user_id: 'u1',
  base_url: 'https://share.example.com',
  client_id: '920132f5****',
  root_docid: 'gns://abc',
  root_name: '文档库',
});

assert.throws(() => parseAnyShareAuthRequest(['GET']), /authrequest/);

console.log('anyshare utils tests passed');
