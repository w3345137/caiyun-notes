const GRAPH_ENDPOINTS = {
  international: 'https://graph.microsoft.com/v1.0',
  '世纪互联': 'https://microsoftgraph.chinacloudapi.cn/v1.0',
};

function getGraphEndpoint(cloudType) {
  return GRAPH_ENDPOINTS[cloudType] || GRAPH_ENDPOINTS.international;
}

function buildOneDriveScope(cloudType, includeOneNote = false) {
  if (cloudType === '世纪互联') {
    const scopes = [
      'https://microsoftgraph.chinacloudapi.cn/Files.ReadWrite.All',
      includeOneNote ? 'https://microsoftgraph.chinacloudapi.cn/Notes.Read' : '',
      'offline_access',
    ];
    return scopes.filter(Boolean).join(' ');
  }

  const scopes = [
    'Files.ReadWrite.All',
    'User.Read',
    includeOneNote ? 'Notes.Read' : '',
    'offline_access',
  ];
  return scopes.filter(Boolean).join(' ');
}

function getGraphError(data) {
  const error = data && data.error ? data.error : {};
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';
  return { code, message };
}

function classifyGraphProbeResponse(status, data) {
  const { code, message } = getGraphError(data);
  const errorText = `${code} ${message}`.toLowerCase();

  const needsReauth = status === 401 ||
    status === 403 ||
    /invalidauthenticationtoken|authentication|authorization_requestdenied|accessdenied|forbidden|insufficient privileges|unauthorized/.test(errorText);

  if (needsReauth) {
    return { supported: false, needs_reauth: true, code, message };
  }

  const unsupported = /not supported|unsupported|apinotsupported|not available|not enabled/.test(errorText);
  if (unsupported) {
    return { supported: false, needs_reauth: false, code, message };
  }

  return {
    supported: status >= 200 && status < 300,
    needs_reauth: false,
    code,
    message,
  };
}

function pickTitle(item) {
  return item.displayName || item.name || item.title || '';
}

function sanitizeSample(item) {
  return {
    id: item.id || null,
    title: pickTitle(item),
    createdDateTime: item.createdDateTime || null,
    lastModifiedDateTime: item.lastModifiedDateTime || null,
  };
}

function summarizeOneNoteProbeResults(results) {
  const byTarget = new Map(results.map((result) => [result.target, result]));
  const okResults = results.filter((result) => result.ok && Array.isArray(result.data?.value));
  const classifications = results.map((result) => {
    if (result.classification) return result.classification;
    return classifyGraphProbeResponse(result.status || 0, result.data || {});
  });
  const needsReauth = classifications.some((item) => item.needs_reauth);
  const hasUnsupported = classifications.some((item) => item.supported === false && !item.needs_reauth);
  const hasOk = okResults.length > 0;

  function countFor(target) {
    const result = byTarget.get(target);
    return Array.isArray(result?.data?.value) ? result.data.value.length : 0;
  }

  function samplesFor(target) {
    const result = byTarget.get(target);
    const values = Array.isArray(result?.data?.value) ? result.data.value : [];
    return values.slice(0, 5).map(sanitizeSample);
  }

  const errors = results
    .filter((result) => !result.ok)
    .map((result) => {
      const classification = result.classification || classifyGraphProbeResponse(result.status || 0, result.data || {});
      return {
        target: result.target,
        status: result.status || 0,
        code: classification.code || null,
        message: classification.message || result.error || 'OneNote probe failed',
      };
    });

  return {
    success: hasOk || errors.length === 0,
    supported: hasOk && !needsReauth && !hasUnsupported,
    needs_reauth: needsReauth,
    notebooks_count: countFor('notebooks'),
    sections_count: countFor('sections'),
    pages_count: countFor('pages'),
    samples: {
      notebooks: samplesFor('notebooks'),
      sections: samplesFor('sections'),
      pages: samplesFor('pages'),
    },
    errors,
  };
}

module.exports = {
  buildOneDriveScope,
  getGraphEndpoint,
  classifyGraphProbeResponse,
  summarizeOneNoteProbeResults,
};
