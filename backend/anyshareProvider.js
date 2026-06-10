const path = require('path');

function normalizeAnyShareBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function buildAnyShareBasicAuth(clientId, clientSecret) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return `Basic ${credentials}`;
}

function parseAnyShareAuthRequest(authrequest) {
  if (!Array.isArray(authrequest) || authrequest.length < 2) {
    throw new Error('AnyShare authrequest 格式异常');
  }
  const [method, url, ...rawHeaders] = authrequest;
  const headers = {};
  for (const line of rawHeaders) {
    const idx = String(line).indexOf(':');
    if (idx <= 0) continue;
    const key = String(line).slice(0, idx).trim();
    const value = String(line).slice(idx + 1).trim();
    if (key) headers[key] = value;
  }
  return { method, url, headers };
}

function maskAnyShareAccount(account) {
  if (!account) return null;
  return {
    user_id: account.user_id,
    base_url: account.base_url,
    client_id: account.client_id ? `${String(account.client_id).slice(0, 8)}****` : '',
    root_docid: account.root_docid || '',
    root_name: account.root_name || '',
  };
}

async function getAnyShareAccessToken(account, fetchImpl = fetch) {
  const baseUrl = normalizeAnyShareBaseUrl(account.base_url);
  const response = await fetchImpl(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': buildAnyShareBasicAuth(account.client_id, account.client_secret),
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'all',
    }).toString(),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = { raw: text };
  }
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || data.message || data.raw || `AnyShare 认证失败 (${response.status})`);
  }
  return data.access_token;
}

async function anyShareApiCall(account, method, apiPath, body, fetchImpl = fetch) {
  const token = await getAnyShareAccessToken(account, fetchImpl);
  const baseUrl = normalizeAnyShareBaseUrl(account.base_url);
  const response = await fetchImpl(`${baseUrl}/api/efast/v1${apiPath}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(data.message || data.error || data.raw || `AnyShare API ${apiPath} 失败 (${response.status})`);
  }
  return data;
}

function flattenAnyShareDocLibs(data) {
  const libs = [];
  const categories = Array.isArray(data) ? data : [];
  for (const category of categories) {
    const subtypes = Array.isArray(category?.subtypes) ? category.subtypes : [];
    for (const subtype of subtypes) {
      const docLibs = Array.isArray(subtype?.doc_libs) ? subtype.doc_libs : [];
      for (const lib of docLibs) {
        libs.push({
          id: lib.id,
          docid: lib.id,
          name: lib.name || lib.display_name || lib.id,
          type: lib.type || '',
        });
      }
    }
  }
  return libs;
}

async function listAnyShareDocLibs(account, fetchImpl = fetch) {
  const data = await anyShareApiCall(account, 'GET', '/classified-entry-doc-libs', null, fetchImpl);
  return flattenAnyShareDocLibs(data);
}

async function createAnyShareDir(account, parentDocid, dirPath, fetchImpl = fetch) {
  return anyShareApiCall(account, 'POST', '/dir/createmultileveldir', { docid: parentDocid, path: dirPath }, fetchImpl);
}

async function uploadAnyShareFile(account, parentDocid, fileName, fileBuffer, fetchImpl = fetch) {
  const begin = await anyShareApiCall(account, 'POST', '/file/osbeginupload', {
    docid: parentDocid,
    name: fileName,
    length: fileBuffer.length,
    ondup: 2,
  }, fetchImpl);
  const uploadRequest = parseAnyShareAuthRequest(begin.authrequest);
  const uploadResp = await fetchImpl(uploadRequest.url, {
    method: uploadRequest.method,
    headers: {
      ...uploadRequest.headers,
      'Content-Length': String(fileBuffer.length),
    },
    body: fileBuffer,
  });
  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    throw new Error(`AnyShare 对象上传失败 (${uploadResp.status}): ${errText}`);
  }
  const end = await anyShareApiCall(account, 'POST', '/file/osendupload', {
    docid: begin.docid,
    rev: begin.rev,
  }, fetchImpl);
  return {
    docid: begin.docid,
    rev: begin.rev,
    name: end.name || fileName,
    modified: end.modified,
  };
}

async function downloadAnyShareFile(account, docid, fetchImpl = fetch) {
  const meta = await anyShareApiCall(account, 'POST', '/file/osdownload', { docid }, fetchImpl);
  const downloadRequest = parseAnyShareAuthRequest(meta.authrequest);
  const response = await fetchImpl(downloadRequest.url, {
    method: downloadRequest.method || 'GET',
    headers: downloadRequest.headers,
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AnyShare 下载失败 (${response.status}): ${errText}`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    name: meta.name || path.basename(docid || '') || 'download',
    size: meta.size,
    rev: meta.rev,
  };
}

async function deleteAnyShareFile(account, docid, fetchImpl = fetch) {
  return anyShareApiCall(account, 'POST', '/file/delete', { docid }, fetchImpl);
}

module.exports = {
  normalizeAnyShareBaseUrl,
  buildAnyShareBasicAuth,
  parseAnyShareAuthRequest,
  maskAnyShareAccount,
  getAnyShareAccessToken,
  anyShareApiCall,
  flattenAnyShareDocLibs,
  listAnyShareDocLibs,
  createAnyShareDir,
  uploadAnyShareFile,
  downloadAnyShareFile,
  deleteAnyShareFile,
};
