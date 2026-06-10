const crypto = require('crypto');

const DEFAULT_MAX_KEYS = 1000;
const OSS_SUBRESOURCE_KEYS = new Set([
  'acl',
  'append',
  'cors',
  'delete',
  'lifecycle',
  'location',
  'logging',
  'objectMeta',
  'partNumber',
  'position',
  'referer',
  'response-cache-control',
  'response-content-disposition',
  'response-content-encoding',
  'response-content-language',
  'response-content-type',
  'response-expires',
  'security-token',
  'tagging',
  'uploadId',
  'uploads',
  'website',
]);

function normalizeCoursewarePrefix(prefix = '') {
  const cleaned = String(prefix || '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/?$/, '');
  return cleaned ? `${cleaned}/` : '';
}

function normalizeEndpointHost(endpoint) {
  return String(endpoint || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

function getBucketHost({ endpoint, bucket }) {
  const endpointHost = normalizeEndpointHost(endpoint);
  if (!endpointHost || !bucket) {
    throw new Error('OSS 课件存储未配置完整');
  }
  if (endpointHost.startsWith(`${bucket}.`)) return endpointHost;
  return `${bucket}.${endpointHost}`;
}

function hmacSha1Base64(secret, value) {
  return crypto.createHmac('sha1', secret).update(value, 'utf8').digest('base64');
}

function encodePath(path) {
  return String(path || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function encodeQueryValue(value) {
  return encodeURIComponent(String(value)).replace(/%2F/g, '/');
}

function buildOssCanonicalResource(bucket, params = {}, key = '') {
  const cleanKey = String(key || '').replace(/^\/+/, '');
  const base = `/${bucket}/${cleanKey}`;
  const entries = Object.entries(params)
    .filter(([name, value]) => OSS_SUBRESOURCE_KEYS.has(name) && value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${String(value)}`);
  return entries.length ? `${base}?${entries.join('&')}` : base;
}

function buildAuthorizationHeader({ method = 'GET', bucket, key = '', params = {}, accessKeyId, accessKeySecret, date }) {
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('OSS 访问密钥未配置');
  }
  const canonicalResource = buildOssCanonicalResource(bucket, params, key);
  const stringToSign = `${method}\n\n\n${date}\n${canonicalResource}`;
  const signature = hmacSha1Base64(accessKeySecret, stringToSign);
  return `OSS ${accessKeyId}:${signature}`;
}

function buildListUrl(config, params) {
  const host = getBucketHost(config);
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeQueryValue(value)}`)
    .join('&');
  return `https://${host}/?${query}`;
}

function decodeXmlText(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function readTag(block, tagName) {
  const match = String(block || '').match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? decodeXmlText(match[1].trim()) : '';
}

function basenameFromKey(key, basePrefix = '') {
  const relative = String(key || '').slice(String(basePrefix || '').length);
  const cleaned = relative.replace(/\/+$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  return parts[parts.length - 1] || cleaned || key;
}

function relativePathFromKey(key, basePrefix = '') {
  return String(key || '').slice(String(basePrefix || '').length).replace(/^\/+/, '');
}

function parseOssListBucketXml(xml, basePrefix = '') {
  const text = String(xml || '');
  const directories = [];
  const files = [];

  for (const match of text.matchAll(/<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/g)) {
    const key = readTag(match[1], 'Prefix');
    if (!key || key === basePrefix) continue;
    directories.push({
      name: basenameFromKey(key, basePrefix),
      prefix: String(key).slice(String(basePrefix || '').length),
      key,
    });
  }

  for (const match of text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = readTag(match[1], 'Key');
    if (!key || key === basePrefix || key.endsWith('/')) continue;
    files.push({
      key,
      name: basenameFromKey(key, basePrefix),
      relativePath: relativePathFromKey(key, basePrefix),
      size: Number(readTag(match[1], 'Size') || 0),
      lastModified: readTag(match[1], 'LastModified') || null,
      etag: readTag(match[1], 'ETag').replace(/^"|"$/g, ''),
    });
  }

  return {
    directories,
    files,
    nextMarker: readTag(text, 'NextMarker') || null,
    isTruncated: readTag(text, 'IsTruncated') === 'true',
  };
}

function getCoursewareConfigFromEnv(env = process.env) {
  return {
    endpoint: env.COURSEWARE_OSS_ENDPOINT || env.DATA_SAVE_OSS_ENDPOINT || 'https://oss-cn-shanghai.aliyuncs.com',
    bucket: env.COURSEWARE_OSS_BUCKET || 'kg-college',
    basePrefix: normalizeCoursewarePrefix(env.COURSEWARE_OSS_PREFIX || 'college/data'),
    accessKeyId: env.COURSEWARE_OSS_ACCESS_KEY_ID || env.DATA_SAVE_OSS_ACCESS_KEY_ID || '',
    accessKeySecret: env.COURSEWARE_OSS_ACCESS_KEY_SECRET || env.DATA_SAVE_OSS_ACCESS_KEY_SECRET || '',
  };
}

function safeJoinPrefix(basePrefix, relativePrefix = '') {
  const base = normalizeCoursewarePrefix(basePrefix);
  const relative = String(relativePrefix || '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\.\.+/g, '')
    .replace(/\/?$/, '');
  return normalizeCoursewarePrefix(`${base}${relative}`);
}

async function fetchCoursewareListPage(config, params, fullPrefix) {
  const date = new Date().toUTCString();
  const response = await fetch(buildListUrl(config, params), {
    method: 'GET',
    headers: {
      Date: date,
      Authorization: buildAuthorizationHeader({
        method: 'GET',
        bucket: config.bucket,
        params,
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        date,
      }),
    },
  });
  const xml = await response.text();
  if (!response.ok) {
    const code = readTag(xml, 'Code') || `HTTP_${response.status}`;
    const message = readTag(xml, 'Message') || response.statusText || 'OSS 列表读取失败';
    const err = new Error(`${code}: ${message}`);
    err.statusCode = response.status;
    throw err;
  }
  return parseOssListBucketXml(xml, fullPrefix);
}

async function listCoursewareObjects(config, {
  prefix = '',
  marker = '',
  maxKeys = DEFAULT_MAX_KEYS,
  recursive = false,
} = {}) {
  const fullPrefix = safeJoinPrefix(config.basePrefix || '', prefix);
  const safeMaxKeys = Math.min(Math.max(Number(maxKeys) || DEFAULT_MAX_KEYS, 1), DEFAULT_MAX_KEYS);
  const directoryParams = {
    delimiter: '/',
    marker,
    'max-keys': safeMaxKeys,
    prefix: fullPrefix,
  };
  const parsed = await fetchCoursewareListPage(config, directoryParams, fullPrefix);
  if (recursive) {
    const files = [];
    let nextMarker = marker;
    let guard = 0;
    do {
      const fileParams = {
        marker: nextMarker,
        'max-keys': safeMaxKeys,
        prefix: fullPrefix,
      };
      const page = await fetchCoursewareListPage(config, fileParams, fullPrefix);
      files.push(...page.files);
      nextMarker = page.nextMarker || page.files[page.files.length - 1]?.key || '';
      guard += 1;
      if (!page.isTruncated) {
        nextMarker = '';
        break;
      }
    } while (nextMarker && guard < 100);
    parsed.files = files;
    parsed.nextMarker = nextMarker || null;
    parsed.isTruncated = !!nextMarker;
  }
  return {
    prefix,
    fullPrefix,
    ...parsed,
  };
}

function buildSignedOssUrl(config, key, { expiresAt } = {}) {
  const cleanKey = String(key || '').replace(/^\/+/, '');
  if (!cleanKey || !cleanKey.startsWith(normalizeCoursewarePrefix(config.basePrefix || ''))) {
    const err = new Error('非法课件路径');
    err.statusCode = 400;
    throw err;
  }
  const expires = expiresAt || Math.floor(Date.now() / 1000) + 300;
  const stringToSign = `GET\n\n\n${expires}\n/${config.bucket}/${cleanKey}`;
  const signature = hmacSha1Base64(config.accessKeySecret, stringToSign);
  const host = getBucketHost(config);
  const query = new URLSearchParams({
    OSSAccessKeyId: config.accessKeyId,
    Expires: String(expires),
    Signature: signature,
  });
  return `https://${host}/${encodePath(cleanKey)}?${query.toString()}`;
}

module.exports = {
  buildAuthorizationHeader,
  buildListUrl,
  buildOssCanonicalResource,
  buildSignedOssUrl,
  getBucketHost,
  getCoursewareConfigFromEnv,
  listCoursewareObjects,
  normalizeCoursewarePrefix,
  parseOssListBucketXml,
  safeJoinPrefix,
};
