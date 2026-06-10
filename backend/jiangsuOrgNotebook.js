const crypto = require('crypto');
const {
  DEFAULT_DEPARTMENT_SECTION_TITLE,
  DEFAULT_PROJECT_FALLBACK_SECTION_TITLE,
  DEFAULT_PROJECT_SECTION_TITLE,
  ORG_PLAN_NOTEBOOK_ID,
  applyProjectSectionCounts,
  buildArchiveSectionId,
  buildCoursewarePageContent,
  buildCoursewarePageId,
  buildKnowledgeSectionId,
  buildOrgNotebookId,
  buildOrgPageContent,
  buildOrgPlanTabGroupDoc,
  buildOrgPageId,
  buildOrgSectionId,
  classifySectionTitle,
  groupAssignmentsBySectionPage,
  normalizeJobInformationRecord,
  normalizeAiLocationSuggestion,
  planAssignmentSync,
  shouldExcludeOrgPlanAssignment,
  sortOrgPlanPageKeys,
  sortOrgPlanTabs,
} = require('./jiangsuOrgNotebookUtils');

const CURRENT_SECTION_TITLE = '当前任职';
const ARCHIVE_SECTION_TITLE = '归档';
const HCM_URL = 'https://sshr.cscec.com/api/hcm.model.list';
const HCM_DEPARTMENT_DATA_URL = 'https://sshr.cscec.com/api/private.depart.data.list?pure_result=1';
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_COOLDOWN_MS = 60 * 1000;
const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
const SECTION_ORDER = [DEFAULT_DEPARTMENT_SECTION_TITLE];

function nowIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildMessageAuthUrl(url, appid, secret) {
  const timestamp = Date.now().toString();
  const token = sha256(secret + appid + timestamp + secret);
  return `${url}?appid=${encodeURIComponent(appid)}&timestamp=${encodeURIComponent(timestamp)}&token=${encodeURIComponent(token)}`;
}

async function sendCscecMessage(receiveUserCode, receiveUserName, content, title = '彩云笔记验证') {
  const apiUrl = process.env.MESSAGE_API_URL || 'https://app.cscecsteel.com/uis/a/message/messageSendLog/send';
  const code = process.env.MESSAGE_CODE || 'MYSQ_2026_0403_0001';
  const appid = process.env.MESSAGE_APPID || '';
  const secret = process.env.MESSAGE_SECRET || '';
  if (!appid || !secret) {
    const err = new Error('中建通消息服务未配置');
    err.statusCode = 500;
    throw err;
  }

  const response = await fetch(buildMessageAuthUrl(apiUrl, appid, secret), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      msgSource: '彩云笔记',
      messageSendLogInfoList: [{
        content,
        title,
        receiveUserName,
        receiveUserCode,
      }],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!(result.result === true || result.result === 'true')) {
    const err = new Error(result.message || '中建通消息发送失败');
    err.statusCode = 500;
    throw err;
  }
  return { success: true };
}

async function ensureJiangsuOrgTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jiangsu_org_assignments (
      assignment_id TEXT PRIMARY KEY,
      source_id TEXT,
      employee_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      unit_name TEXT,
      department_name TEXT,
      department_origin_id TEXT,
      position_name TEXT,
      position_origin_id TEXT,
      position_status TEXT,
      action_name TEXT,
      begin_date TEXT,
      end_date TEXT,
      page_key TEXT NOT NULL,
      tab_title TEXT NOT NULL,
      note_id TEXT,
      archived BOOLEAN NOT NULL DEFAULT false,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jiangsu_org_plan_contents (
      assignment_id TEXT PRIMARY KEY REFERENCES jiangsu_org_assignments(assignment_id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '${EMPTY_DOC.replace(/'/g, "''")}',
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jiangsu_org_identity_bindings (
      user_id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jiangsu_org_tab_locks (
      assignment_id TEXT PRIMARY KEY REFERENCES jiangsu_org_assignments(assignment_id) ON DELETE CASCADE,
      locked_by TEXT NOT NULL,
      locked_by_name TEXT,
      locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jiangsu_org_verification_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jiangsu_org_sync_logs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      hcm_date TEXT,
      fetched_count INTEGER DEFAULT 0,
      active_count INTEGER DEFAULT 0,
      archived_count INTEGER DEFAULT 0,
      created_count INTEGER DEFAULT 0,
      moved_count INTEGER DEFAULT 0,
      renamed_count INTEGER DEFAULT 0,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jiangsu_project_locations (
      project_name TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence NUMERIC NOT NULL DEFAULT 1,
      confirmed BOOLEAN NOT NULL DEFAULT false,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('ALTER TABLE jiangsu_org_assignments ADD COLUMN IF NOT EXISTS section_title TEXT');
  await pool.query('ALTER TABLE jiangsu_org_assignments ADD COLUMN IF NOT EXISTS section_key TEXT');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_jiangsu_assignments_employee ON jiangsu_org_assignments(employee_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_jiangsu_assignments_note ON jiangsu_org_assignments(note_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_jiangsu_project_locations_city ON jiangsu_project_locations(city)');
}

async function fetchHcmJobInformationRows({ date = nowIsoDate(), pageSize = 500 } = {}) {
  const token = process.env.HCM_TOKEN || '';
  const rootDeptId = Number(process.env.HCM_ROSTER_DEPT_ID || '16412837');
  if (!token) {
    const err = new Error('HCM_TOKEN 未配置');
    err.statusCode = 500;
    throw err;
  }
  const rows = [];
  for (let pageIndex = 1; pageIndex < 50; pageIndex += 1) {
    const payload = {
      model: 'JobInformationMaster',
      filter_str: null,
      filter_dict: {
        'department.origin_id': { child_include: rootDeptId },
        date_: date,
      },
      page_index: pageIndex,
      page_size: pageSize,
      extra_property: {
        state: 'outside',
        sorts: [],
        filter_params: {
          model: 'JobInformationMaster',
          filter_str: null,
          page_size: pageSize,
          page_index: pageIndex,
          tree_id: String(rootDeptId),
          effect_date: date,
          advance_filter_dict: {},
          show_fields_key: ['action_id', 'action_reason_id', 'begin_date'],
          query_str: null,
          _menu_id: '9901!990102!99010201',
        },
        only_list: false,
      },
      biz_type: 'list',
    };
    const response = await fetch(HCM_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
        Authorization: `Bearer ${token}`,
        Origin: 'https://sshr.cscec.com',
        Referer: 'https://sshr.cscec.com/',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`HCM JobInformationMaster 请求失败: ${response.status}`);
    }
    const data = await response.json();
    const pageRows = data?.result?.list || data?.result?.data || data?.data?.list || data?.data || [];
    if (!pageRows.length) break;
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }
  return rows;
}

async function fetchHcmOrgDepartmentMap() {
  const token = process.env.HCM_TOKEN || '';
  const rootDeptId = Number(process.env.HCM_ROSTER_DEPT_ID || '16412837');
  if (!token) return new Map();
  const result = new Map();
  for (let pageIndex = 1; pageIndex < 100; pageIndex += 1) {
    const payload = {
      page_index: pageIndex,
      filter: {
        operate_time: { gte: '2020-01-01 00:00:00' },
        id: { child_include: rootDeptId },
      },
      meta: { fields: [] },
    };
    const response = await fetch(HCM_DEPARTMENT_DATA_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
        Authorization: `Bearer ${token}`,
        Origin: 'https://sshr.cscec.com',
        Referer: 'https://sshr.cscec.com/',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`HCM depart.data.list 请求失败: ${response.status}`);
    }
    const data = await response.json();
    const rows = data?.data?.list || data?.result?.list || [];
    if (!rows.length) break;
    for (const row of rows) {
      for (const id of [row.id, row.origin_id]) {
        const key = String(id || '').trim();
        if (key) result.set(key, row);
      }
      const fullPathName = String(row.org_full_path?.name || row.org_full_path || '');
      if (fullPathName.includes('_江苏公司_')) {
        for (const name of [row.name, row.org_full_name]) {
          const key = String(name || '').trim();
          if (key) result.set(`name:${key.replace(/_隐藏$/, '')}`, row);
        }
      }
    }
  }
  return result;
}

async function getOwnerId(pool, ownerEmail) {
  const { rows } = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [ownerEmail]);
  if (!rows.length) {
    const err = new Error(`未找到江苏公司笔记本所有者: ${ownerEmail}`);
    err.statusCode = 404;
    throw err;
  }
  return rows[0].id;
}

async function upsertNotebookStructure(pool, ownerId) {
  const notebookId = buildOrgNotebookId();
  const archiveSectionId = buildArchiveSectionId();
  const knowledgeSectionId = buildKnowledgeSectionId();
  const coursewarePageId = buildCoursewarePageId();
  await pool.query(
    `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at, created_at)
     VALUES ($1, '江苏公司', $2, NULL, 'notebook', $3, 9998, 'building', $1, NOW(), NOW())
     ON CONFLICT(id) DO UPDATE SET title='江苏公司', content=$2, parent_id=NULL, type='notebook', owner_id=$3, icon='building', root_notebook_id=$1, updated_at=NOW()`,
    [notebookId, JSON.stringify({ kind: 'org_plan_notebook', org: '江苏公司' }), ownerId]
  );
  await pool.query(
    `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at, created_at)
     VALUES ($1, '知识库', $2, $3, 'section', $4, 9998, 'book-open', $3, NOW(), NOW())
     ON CONFLICT(id) DO UPDATE SET title='知识库', content=$2, parent_id=$3, type='section', owner_id=$4, order_index=9998, icon='book-open', root_notebook_id=$3, updated_at=NOW()`,
    [knowledgeSectionId, JSON.stringify({ kind: 'courseware_knowledge_section', locked: true }), notebookId, ownerId]
  );
  await pool.query(
    `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at, created_at)
     VALUES ($1, '课件', $2, $3, 'page', $4, 0, 'book-open', $5, NOW(), NOW())
     ON CONFLICT(id) DO UPDATE SET title='课件', content=$2, parent_id=$3, type='page', owner_id=$4, order_index=0, icon='book-open', root_notebook_id=$5, updated_at=NOW()`,
    [coursewarePageId, buildCoursewarePageContent({ prefix: 'college/data', title: '课件' }), knowledgeSectionId, ownerId, notebookId]
  );
  await pool.query(
    `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at, created_at)
     VALUES ($1, $2, $3, $4, 'section', $5, 9999, 'archive', $4, NOW(), NOW())
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, parent_id=$4, type='section', owner_id=$5, order_index=9999, icon='archive', root_notebook_id=$4, updated_at=NOW()`,
    [archiveSectionId, ARCHIVE_SECTION_TITLE, JSON.stringify({ kind: 'org_plan_archive_section', locked: true }), notebookId, ownerId]
  );
  return { notebookId, archiveSectionId, knowledgeSectionId, coursewarePageId };
}

function sectionSortValue(title) {
  const index = SECTION_ORDER.indexOf(title);
  if (index >= 0) return index;
  if (String(title || '').startsWith(`${DEFAULT_PROJECT_SECTION_TITLE}-`)) {
    return 100;
  }
  return 1000;
}

function projectCountFromSectionTitle(title) {
  const match = String(title || '').match(/（(\d+)）$/);
  return match ? Number(match[1]) : 0;
}

async function upsertOrgSection(pool, ownerId, notebookId, sectionTitle, orderIndex) {
  const sectionId = buildOrgSectionId(sectionTitle);
  await pool.query(
    `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at, created_at)
     VALUES ($1, $2, $3, $4, 'section', $5, $6, $7, $4, NOW(), NOW())
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, parent_id=$4, type='section', owner_id=$5, order_index=$6, icon=$7, root_notebook_id=$4, updated_at=NOW()`,
    [sectionId, sectionTitle, JSON.stringify({ kind: 'org_plan_section', locked: true }), notebookId, ownerId, orderIndex, sectionTitle.startsWith(`${DEFAULT_PROJECT_SECTION_TITLE}-`) ? 'rocket' : 'briefcase']
  );
  return sectionId;
}

async function upsertOrgPage(pool, ownerId, sectionId, sectionTitle, pageKey, orderIndex) {
  const pageId = sectionId === buildArchiveSectionId()
    ? `jiangsu-company-archive-page-${crypto.createHash('sha1').update(pageKey).digest('hex').slice(0, 20)}`
    : buildOrgPageId(sectionTitle, pageKey);
  await pool.query(
    `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at, created_at)
     VALUES ($1, $2, $3, $4, 'page', $5, $6, 'users', $7, NOW(), NOW())
     ON CONFLICT(id) DO UPDATE SET title=$2, content=$3, parent_id=$4, type='page', owner_id=$5, order_index=$6, icon='users', root_notebook_id=$7, updated_at=NOW()`,
    [pageId, pageKey, buildOrgPageContent({ pageKey, sectionTitle }), sectionId, ownerId, orderIndex, ORG_PLAN_NOTEBOOK_ID]
  );
  return pageId;
}

async function cleanupOrgNotebookStructure(pool, sectionIds, pageIds) {
  await pool.query(
    `DELETE FROM notes
     WHERE root_notebook_id=$1
       AND type='page'
       AND id LIKE 'jiangsu-company-page-%'
       AND NOT (id = ANY($2::text[]))`,
    [ORG_PLAN_NOTEBOOK_ID, pageIds]
  );
  await pool.query(
    `DELETE FROM notes
     WHERE parent_id=$1
       AND type='section'
       AND id LIKE 'jiangsu-company-section-%'
       AND NOT (id = ANY($2::text[]))`,
    [ORG_PLAN_NOTEBOOK_ID, sectionIds]
  );
}

function departmentOriginIdFromRaw(row) {
  return String(row?.department?.origin_id || row?.department_origin_id || '').trim();
}

function orgDepartmentForRaw(row, orgDepartmentMap) {
  const byId = orgDepartmentMap.get(departmentOriginIdFromRaw(row));
  if (byId) return byId;
  const departmentName = String(row?.department?.name || row?.department_name || '').trim();
  if (!departmentName) return null;
  return orgDepartmentMap.get(`name:${departmentName}`) || null;
}

async function loadProjectLocationMap(pool) {
  const { rows } = await pool.query('SELECT project_name, city, source, confidence, confirmed, reason FROM jiangsu_project_locations');
  return new Map(rows.map((row) => [row.project_name, {
    city: row.city,
    source: row.source,
    confidence: Number(row.confidence || 0),
    confirmed: row.confirmed,
    reason: row.reason,
  }]));
}

async function getOwnerLlmConfig(pool, ownerEmail) {
  const { rows } = await pool.query(
    `SELECT l.provider, l.protocol, l.api_key, l.base_url, l.model_name
     FROM user_profiles u
     JOIN llm_configs l ON l.user_id = u.id::text
     WHERE u.email = $1
     LIMIT 1`,
    [ownerEmail]
  ).catch(() => ({ rows: [] }));
  return rows[0] || null;
}

async function requestAiProjectLocations(llmConfig, projectNames) {
  if (!llmConfig || !projectNames.length) return new Map();
  const prompt = [
    '你要根据项目名称判断项目所在城市。只根据名称中明确的地名、区县、常见项目地名判断；不确定时 city 为空，confidence 低于 0.75。',
    '只输出 JSON 数组或 {"items":[]}，每项格式为 {"projectName":"原项目名","city":"苏州","confidence":0.8,"reason":"简短理由"}。',
    '城市只允许：苏州、无锡、南京、徐州、宿迁、南通、泰州、淮安、常州、扬州、镇江、盐城、连云港、上海。',
    `项目名称：\n${projectNames.map((name) => `- ${name}`).join('\n')}`,
  ].join('\n');
  const baseUrl = (llmConfig.base_url || (llmConfig.protocol === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1')).replace(/\/+$/, '');
  const isAnthropic = llmConfig.protocol === 'anthropic';
  const response = await fetch(isAnthropic ? `${baseUrl}/v1/messages` : `${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: isAnthropic ? {
      'Content-Type': 'application/json',
      'x-api-key': llmConfig.api_key,
      'anthropic-version': '2023-06-01',
    } : {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llmConfig.api_key}`,
    },
    body: JSON.stringify(isAnthropic ? {
      model: llmConfig.model_name,
      max_tokens: 2048,
      temperature: 0,
      system: '你是组织数据清洗助手，只输出 JSON。',
      messages: [{ role: 'user', content: prompt }],
    } : {
      model: llmConfig.model_name,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你是组织数据清洗助手，只输出 JSON。' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`LLM location request failed: ${response.status}`);
  const data = await response.json();
  const content = isAnthropic
    ? (data.content || []).map((item) => item.text || '').join('\n')
    : (data.choices?.[0]?.message?.content || '');
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    throw new Error('LLM location response is not JSON');
  }
  const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
  const result = new Map();
  for (const item of list) {
    const projectName = String(item.projectName || item.project_name || '').trim();
    const normalized = normalizeAiLocationSuggestion(item);
    if (projectName && normalized) {
      result.set(projectName, {
        ...normalized,
        reason: String(item.reason || '').slice(0, 500),
      });
    }
  }
  return result;
}

async function upsertProjectLocation(pool, projectName, location) {
  if (!projectName || !location?.city) return;
  await pool.query(
    `INSERT INTO jiangsu_project_locations (project_name, city, source, confidence, confirmed, reason, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT(project_name) DO UPDATE SET
       city=EXCLUDED.city,
       source=EXCLUDED.source,
       confidence=EXCLUDED.confidence,
       confirmed=jiangsu_project_locations.confirmed OR EXCLUDED.confirmed,
       reason=EXCLUDED.reason,
       updated_at=NOW()
     WHERE jiangsu_project_locations.confirmed=false`,
    [
      projectName,
      location.city,
      location.source || 'ai',
      location.confidence || 0,
      !!location.confirmed,
      location.reason || null,
    ]
  );
}

async function enrichProjectLocations(pool, ownerEmail, rows, orgDepartmentMap, projectLocationMap) {
  const unknownProjectNames = new Set();
  for (const row of rows || []) {
    const orgDepartment = orgDepartmentForRaw(row, orgDepartmentMap);
    const assignment = normalizeJobInformationRecord(row, orgDepartment, projectLocationMap);
    if (assignment.unitName !== '江苏公司') continue;
    if (assignment.sectionTitle !== DEFAULT_PROJECT_FALLBACK_SECTION_TITLE) continue;
    if (!assignment.pageKey || assignment.pageKey === '未分组') continue;
    unknownProjectNames.add(assignment.pageKey);
  }
  const unknown = [...unknownProjectNames].slice(0, Number(process.env.HCM_PROJECT_LOCATION_AI_LIMIT || 80));
  if (!unknown.length) return { aiResolved: 0, unknown: 0 };
  const llmConfig = await getOwnerLlmConfig(pool, ownerEmail);
  if (!llmConfig) return { aiResolved: 0, unknown: unknown.length, skipped: 'no_llm_config' };
  try {
    const aiMap = await requestAiProjectLocations(llmConfig, unknown);
    for (const [projectName, location] of aiMap.entries()) {
      const cached = { ...location, source: 'ai' };
      await upsertProjectLocation(pool, projectName, cached);
      projectLocationMap.set(projectName, cached);
    }
    return { aiResolved: aiMap.size, unknown: unknown.length };
  } catch (error) {
    console.warn('[JiangsuOrg] AI project location unavailable:', error.message);
    return { aiResolved: 0, unknown: unknown.length, error: error.message };
  }
}

function rowsToAssignments(rows, orgDepartmentMap = new Map(), projectLocationMap = new Map()) {
  return (rows || []).map((row) => {
    const orgDepartment = orgDepartmentForRaw(row, orgDepartmentMap);
    return normalizeJobInformationRecord(row, orgDepartment, projectLocationMap);
  }).filter((row) => row.unitName === '江苏公司');
}

async function upsertActiveStructure(pool, ownerId, active) {
  const { notebookId, archiveSectionId } = await upsertNotebookStructure(pool, ownerId);
  const grouped = groupAssignmentsBySectionPage(active);
  const sectionTitles = [...grouped.keys()].sort((a, b) => {
    const rank = sectionSortValue(a) - sectionSortValue(b);
    if (rank) return rank;
    if (String(a).startsWith(`${DEFAULT_PROJECT_SECTION_TITLE}-`) && String(b).startsWith(`${DEFAULT_PROJECT_SECTION_TITLE}-`)) {
      const countRank = projectCountFromSectionTitle(b) - projectCountFromSectionTitle(a);
      if (countRank) return countRank;
      if (a.includes(DEFAULT_PROJECT_FALLBACK_SECTION_TITLE) !== b.includes(DEFAULT_PROJECT_FALLBACK_SECTION_TITLE)) {
        return a.includes(DEFAULT_PROJECT_FALLBACK_SECTION_TITLE) ? 1 : -1;
      }
    }
    return a.localeCompare(b, 'zh-CN');
  });
  const validSectionIds = [];
  const validPageIds = [];
  const pageByKey = new Map();

  for (let sectionOrder = 0; sectionOrder < sectionTitles.length; sectionOrder += 1) {
    const sectionTitle = sectionTitles[sectionOrder];
    const sectionId = await upsertOrgSection(pool, ownerId, notebookId, sectionTitle, sectionOrder);
    validSectionIds.push(sectionId);
    const pages = grouped.get(sectionTitle);
    const pageKeys = sortOrgPlanPageKeys(sectionTitle, pages);
    for (let pageOrder = 0; pageOrder < pageKeys.length; pageOrder += 1) {
      const pageKey = pageKeys[pageOrder];
      const pageId = await upsertOrgPage(pool, ownerId, sectionId, sectionTitle, pageKey, pageOrder);
      validPageIds.push(pageId);
      pageByKey.set(`${sectionTitle}\u0000${pageKey}`, pageId);
    }
  }

  await cleanupOrgNotebookStructure(pool, validSectionIds, validPageIds);
  const archivePageId = await upsertOrgPage(pool, ownerId, archiveSectionId, ARCHIVE_SECTION_TITLE, '已归档任职', 0);
  return { pageByKey, archivePageId };
}

async function refreshOrgPlanPageDocuments(pool, noteIds = null) {
  const params = [];
  let noteFilter = '';
  if (Array.isArray(noteIds) && noteIds.length) {
    params.push(noteIds);
    noteFilter = `AND a.note_id = ANY($${params.length}::text[])`;
  }
  const { rows } = await pool.query(
    `SELECT a.assignment_id, a.employee_id, a.employee_name, a.position_name, a.tab_title,
            a.note_id, a.page_key, a.section_title, c.content, l.locked_by, l.locked_by_name
     FROM jiangsu_org_assignments a
     LEFT JOIN jiangsu_org_plan_contents c ON c.assignment_id = a.assignment_id
     LEFT JOIN jiangsu_org_tab_locks l ON l.assignment_id = a.assignment_id
     WHERE a.note_id IS NOT NULL ${noteFilter}
     ORDER BY a.archived ASC, a.position_name, a.employee_name`,
    params
  );
  const byNote = new Map();
  for (const row of rows) {
    if (!byNote.has(row.note_id)) byNote.set(row.note_id, []);
    byNote.get(row.note_id).push(row);
  }
  for (const [noteId, assignments] of byNote.entries()) {
    const first = assignments[0] || {};
    const doc = buildOrgPlanTabGroupDoc({
      noteId,
      pageKey: first.page_key,
      sectionTitle: first.section_title,
      tabs: assignments,
    });
    await pool.query(
      `UPDATE notes SET content=$1, updated_at=NOW() WHERE id=$2`,
      [JSON.stringify(doc), noteId]
    );
    await pool.query('DELETE FROM collab_documents WHERE note_id=$1', [noteId]).catch(() => {});
  }
  if (Array.isArray(noteIds) && noteIds.length) {
    const missingNoteIds = noteIds.filter((noteId) => !byNote.has(noteId));
    if (missingNoteIds.length) {
      const missing = await pool.query(
        `SELECT n.id, n.title, p.title AS section_title
         FROM notes n
         LEFT JOIN notes p ON p.id = n.parent_id
         WHERE n.id = ANY($1::text[]) AND n.type='page'`,
        [missingNoteIds]
      );
      for (const note of missing.rows) {
        const doc = buildOrgPlanTabGroupDoc({
          noteId: note.id,
          pageKey: note.title,
          sectionTitle: note.section_title || note.title,
          tabs: [],
        });
        await pool.query(
          `UPDATE notes SET content=$1, updated_at=NOW() WHERE id=$2`,
          [JSON.stringify(doc), note.id]
        );
        await pool.query('DELETE FROM collab_documents WHERE note_id=$1', [note.id]).catch(() => {});
      }
    }
  }
}

async function deleteExcludedOrgPlanAssignments(pool) {
  const { rows } = await pool.query(
    `SELECT assignment_id, note_id, position_name
     FROM jiangsu_org_assignments
     WHERE position_name IS NOT NULL`
  );
  const excluded = rows.filter((row) => shouldExcludeOrgPlanAssignment(row));
  if (!excluded.length) return { deleted: 0, noteIds: [] };
  const assignmentIds = excluded.map((row) => row.assignment_id);
  const noteIds = [...new Set(excluded.map((row) => row.note_id).filter(Boolean))];
  await pool.query('DELETE FROM jiangsu_org_assignments WHERE assignment_id = ANY($1::text[])', [assignmentIds]);
  if (noteIds.length) {
    await refreshOrgPlanPageDocuments(pool, noteIds);
  }
  return { deleted: assignmentIds.length, noteIds };
}

async function syncJiangsuOrgNotebook(pool, { ownerEmail, hcmDate = nowIsoDate(), hcmRows = null } = {}) {
  const logId = crypto.randomUUID();
  try {
    const ownerId = await getOwnerId(pool, ownerEmail);
    const sourceRows = hcmRows || await fetchHcmJobInformationRows({ date: hcmDate });
    let orgDepartmentMap = new Map();
    try {
      orgDepartmentMap = await fetchHcmOrgDepartmentMap();
    } catch (error) {
      console.warn('[JiangsuOrg] OrgDepartment map unavailable, using department-name fallback:', error.message);
    }
    const projectLocationMap = await loadProjectLocationMap(pool);
    const aiLocationResult = await enrichProjectLocations(pool, ownerEmail, sourceRows, orgDepartmentMap, projectLocationMap);
    const assignments = rowsToAssignments(sourceRows, orgDepartmentMap, projectLocationMap);
    const active = applyProjectSectionCounts(assignments.filter((row) => row.isActive));
    const { pageByKey, archivePageId } = await upsertActiveStructure(pool, ownerId, active);
    const previous = await pool.query('SELECT assignment_id, section_title, page_key, tab_title, archived FROM jiangsu_org_assignments');
    const plan = planAssignmentSync(previous.rows, active);

    const upsertAssignment = async (assignment, archived = false) => {
      const sectionTitle = archived ? ARCHIVE_SECTION_TITLE : (assignment.sectionTitle || classifySectionTitle(assignment.pageKey));
      const pageKey = archived ? '归档' : assignment.pageKey;
      const noteId = archived ? archivePageId : pageByKey.get(`${sectionTitle}\u0000${pageKey}`);
      await pool.query(
        `INSERT INTO jiangsu_org_assignments
         (assignment_id, source_id, employee_id, employee_name, unit_name, department_name, department_origin_id,
          position_name, position_origin_id, position_status, action_name, begin_date, end_date, page_key, tab_title, note_id, archived,
          section_title, section_key, last_seen_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
         ON CONFLICT(assignment_id) DO UPDATE SET
          source_id=$2, employee_id=$3, employee_name=$4, unit_name=$5, department_name=$6, department_origin_id=$7,
          position_name=$8, position_origin_id=$9, position_status=$10, action_name=$11, begin_date=$12, end_date=$13,
          page_key=$14, tab_title=$15, note_id=$16, archived=$17, last_seen_at=NOW(), updated_at=NOW(), section_title=$18, section_key=$19`,
        [
          assignment.assignmentId, assignment.sourceId, assignment.employeeId, assignment.employeeName, assignment.unitName,
          assignment.departmentName, assignment.departmentOriginId, assignment.positionName, assignment.positionOriginId,
          assignment.positionStatus, assignment.actionName, assignment.beginDate, assignment.endDate,
          pageKey, assignment.tabTitle, noteId, archived, sectionTitle, sectionTitle,
        ]
      );
      await pool.query(
        `INSERT INTO jiangsu_org_plan_contents (assignment_id, content)
         VALUES ($1, $2)
         ON CONFLICT(assignment_id) DO NOTHING`,
        [assignment.assignmentId, EMPTY_DOC]
      );
    };

    for (const assignment of active) await upsertAssignment(assignment, false);
    for (const archived of plan.archive) {
      await pool.query(
        `UPDATE jiangsu_org_assignments
         SET archived=true, section_title=$3, section_key=$3, page_key='归档', note_id=$2, updated_at=NOW()
         WHERE assignment_id=$1`,
        [archived.assignmentId, archivePageId, ARCHIVE_SECTION_TITLE]
      );
    }
    const excludedCleanup = await deleteExcludedOrgPlanAssignments(pool);

    await refreshOrgPlanPageDocuments(pool);

    await pool.query(
      `INSERT INTO jiangsu_org_sync_logs
       (id, status, hcm_date, fetched_count, active_count, archived_count, created_count, moved_count, renamed_count)
       VALUES ($1,'success',$2,$3,$4,$5,$6,$7,$8)`,
      [logId, hcmDate, sourceRows.length, active.length, plan.archive.length + excludedCleanup.deleted, plan.create.length, plan.move.length, plan.rename.length]
    );
    return {
      success: true,
      notebookId: ORG_PLAN_NOTEBOOK_ID,
      fetched: sourceRows.length,
      active: active.length,
      archived: plan.archive.length + excludedCleanup.deleted,
      created: plan.create.length,
      moved: plan.move.length,
      renamed: plan.rename.length,
      projectLocationAiResolved: aiLocationResult.aiResolved || 0,
      projectLocationUnknown: aiLocationResult.unknown || 0,
    };
  } catch (error) {
    await pool.query(
      `INSERT INTO jiangsu_org_sync_logs (id, status, hcm_date, error)
       VALUES ($1,'failed',$2,$3)`,
      [logId, hcmDate, error.message]
    ).catch(() => {});
    throw error;
  }
}

async function rebuildJiangsuOrgNotebookStructure(pool, { ownerEmail } = {}) {
  const ownerId = await getOwnerId(pool, ownerEmail);
  const { rows } = await pool.query(
    `SELECT * FROM jiangsu_org_assignments WHERE archived=false ORDER BY department_name, position_name, employee_name`
  );
  const active = applyProjectSectionCounts(rows.map((row) => ({
    assignmentId: row.assignment_id,
    sourceId: row.source_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    unitName: row.unit_name,
    departmentName: row.department_name,
    departmentOriginId: row.department_origin_id,
    positionName: row.position_name,
    positionOriginId: row.position_origin_id,
    positionStatus: row.position_status,
    actionName: row.action_name,
    beginDate: row.begin_date,
    endDate: row.end_date,
    sectionTitle: row.section_title || classifySectionTitle(row.page_key || row.department_name),
    pageKey: row.page_key || row.department_name || '未分组',
    tabTitle: row.tab_title,
    isActive: true,
    archived: false,
  })).filter((assignment) => !shouldExcludeOrgPlanAssignment(assignment)));
  const { pageByKey } = await upsertActiveStructure(pool, ownerId, active);
  for (const assignment of active) {
    const sectionTitle = assignment.sectionTitle || classifySectionTitle(assignment.pageKey);
    const noteId = pageByKey.get(`${sectionTitle}\u0000${assignment.pageKey}`);
    await pool.query(
      `UPDATE jiangsu_org_assignments
       SET section_title=$2, section_key=$2, page_key=$3, note_id=$4, updated_at=NOW()
       WHERE assignment_id=$1`,
      [assignment.assignmentId, sectionTitle, assignment.pageKey, noteId]
    );
  }
  await refreshOrgPlanPageDocuments(pool);
  return { success: true, active: active.length, sections: new Set(active.map((row) => row.sectionTitle)).size };
}

async function getStatus(pool) {
  const [{ rows: assignmentRows }, { rows: logRows }] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE archived=false)::int AS active, COUNT(DISTINCT employee_id)::int AS employees FROM jiangsu_org_assignments`),
    pool.query(`SELECT * FROM jiangsu_org_sync_logs ORDER BY created_at DESC LIMIT 1`),
  ]);
  return { ...(assignmentRows[0] || { total: 0, active: 0, employees: 0 }), lastSync: logRows[0] || null };
}

async function getBinding(pool, userId) {
  const { rows } = await pool.query('SELECT * FROM jiangsu_org_identity_bindings WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

async function sendIdentityCode(pool, userId, { employeeId, employeeName }) {
  const cleanEmployeeId = String(employeeId || '').trim();
  const cleanEmployeeName = String(employeeName || '').trim();
  if (!cleanEmployeeId || !cleanEmployeeName) {
    const err = new Error('请输入员工编号和姓名');
    err.statusCode = 400;
    throw err;
  }
  const employee = await pool.query(
    `SELECT 1 FROM jiangsu_org_assignments
     WHERE employee_id=$1 AND employee_name=$2 AND archived=false
     LIMIT 1`,
    [cleanEmployeeId, cleanEmployeeName]
  );
  if (!employee.rows.length) {
    const err = new Error('员工编号与姓名不匹配，或该员工不在江苏公司当前任职范围内');
    err.statusCode = 400;
    throw err;
  }
  const recent = await pool.query(
    `SELECT 1 FROM jiangsu_org_verification_codes
     WHERE user_id=$1 AND employee_id=$2 AND created_at > NOW() - INTERVAL '60 seconds'
     LIMIT 1`,
    [userId, cleanEmployeeId]
  );
  if (recent.rows.length) {
    const err = new Error('发送太频繁，请1分钟后再试');
    err.statusCode = 429;
    throw err;
  }
  const code = generateCode();
  await pool.query(
    `INSERT INTO jiangsu_org_verification_codes (id, user_id, employee_id, employee_name, code_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5,NOW() + INTERVAL '10 minutes')`,
    [crypto.randomUUID(), userId, cleanEmployeeId, cleanEmployeeName, sha256(code)]
  );
  await sendCscecMessage(cleanEmployeeId, cleanEmployeeName, `【彩云笔记】您的江苏公司笔记本验证码是：${code}，10分钟内有效。`, '彩云笔记验证');
  return { success: true };
}

async function verifyIdentityCode(pool, userId, { employeeId, employeeName, code }) {
  const cleanEmployeeId = String(employeeId || '').trim();
  const cleanEmployeeName = String(employeeName || '').trim();
  const codeHash = sha256(String(code || '').trim());
  const { rows } = await pool.query(
    `SELECT * FROM jiangsu_org_verification_codes
     WHERE user_id=$1 AND employee_id=$2 AND employee_name=$3 AND code_hash=$4
       AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId, cleanEmployeeId, cleanEmployeeName, codeHash]
  );
  if (!rows.length) {
    const err = new Error('验证码无效或已过期');
    err.statusCode = 400;
    throw err;
  }
  await pool.query('UPDATE jiangsu_org_verification_codes SET used_at=NOW() WHERE id=$1', [rows[0].id]);
  await pool.query(
    `INSERT INTO jiangsu_org_identity_bindings (user_id, employee_id, employee_name, verified_at, updated_at)
     VALUES ($1,$2,$3,NOW(),NOW())
     ON CONFLICT(user_id) DO UPDATE SET employee_id=$2, employee_name=$3, verified_at=NOW(), updated_at=NOW()`,
    [userId, cleanEmployeeId, cleanEmployeeName]
  );
  await pool.query(
    `INSERT INTO note_shares (notebook_id, user_id, shared_by, permission)
     SELECT $1, $2, owner_id, 'edit' FROM notes WHERE id=$1
     ON CONFLICT DO NOTHING`,
    [ORG_PLAN_NOTEBOOK_ID, userId]
  );
  return { success: true, employeeId: cleanEmployeeId, employeeName: cleanEmployeeName };
}

async function getTabAccess(pool, userId, assignmentId, ownerEmail) {
  const { rows } = await pool.query(
    `SELECT a.*, c.content, c.updated_at AS content_updated_at, l.locked_by, l.locked_by_name, l.locked_at,
            up.email AS user_email, b.employee_id AS bound_employee_id
     FROM jiangsu_org_assignments a
     LEFT JOIN jiangsu_org_plan_contents c ON c.assignment_id = a.assignment_id
     LEFT JOIN jiangsu_org_tab_locks l ON l.assignment_id = a.assignment_id
     LEFT JOIN user_profiles up ON up.id::text = $2
     LEFT JOIN jiangsu_org_identity_bindings b ON b.user_id = $2
     WHERE a.assignment_id = $1`,
    [assignmentId, userId]
  );
  const row = rows[0];
  if (!row) return null;
  const isOwner = row.user_email === ownerEmail;
  const isSelf = row.bound_employee_id && row.bound_employee_id === row.employee_id;
  return {
    row,
    canRead: isOwner || isSelf,
    canWrite: !row.archived && (isOwner || isSelf),
    isOwner,
    isSelf,
  };
}

async function listTabs(pool, userId, noteId, ownerEmail) {
  const binding = await getBinding(pool, userId);
  const userProfile = await pool.query('SELECT email FROM user_profiles WHERE id::text=$1', [userId]);
  const isOwner = userProfile.rows[0]?.email === ownerEmail;
  const { rows } = await pool.query(
    `SELECT a.assignment_id, a.employee_id, a.employee_name, a.position_name, a.department_name,
            a.tab_title, a.archived, a.note_id, a.section_title, a.page_key, c.updated_at AS content_updated_at,
            l.locked_by, l.locked_by_name, l.locked_at
     FROM jiangsu_org_assignments a
     LEFT JOIN jiangsu_org_plan_contents c ON c.assignment_id = a.assignment_id
     LEFT JOIN jiangsu_org_tab_locks l ON l.assignment_id = a.assignment_id
     WHERE a.note_id = $1
     ORDER BY a.archived ASC, a.position_name, a.employee_name`,
    [noteId]
  );
  const sortedRows = sortOrgPlanTabs(rows, rows[0]?.section_title || '', rows[0]?.page_key || '');
  return {
    binding,
    isOwner,
    tabs: sortedRows.map((row) => ({
      assignmentId: row.assignment_id,
      employeeId: row.employee_id,
      title: row.tab_title,
      employeeName: row.employee_name,
      positionName: row.position_name,
      departmentName: row.department_name,
      archived: row.archived,
      canView: isOwner || binding?.employee_id === row.employee_id,
      canEdit: !row.archived && (isOwner || binding?.employee_id === row.employee_id),
      lockedBy: row.locked_by,
      lockedByName: row.locked_by_name,
      lockedAt: row.locked_at,
      updatedAt: row.content_updated_at,
    })),
  };
}

async function getTabContent(pool, userId, assignmentId, ownerEmail) {
  const access = await getTabAccess(pool, userId, assignmentId, ownerEmail);
  if (!access) {
    const err = new Error('任职页签不存在');
    err.statusCode = 404;
    throw err;
  }
  if (!access.canRead) {
    const err = new Error('无权查看该页签');
    err.statusCode = 403;
    throw err;
  }
  return { ...access.row, canWrite: access.canWrite, content: access.row.content || EMPTY_DOC };
}

async function saveTabContent(pool, userId, assignmentId, content, ownerEmail) {
  const access = await getTabAccess(pool, userId, assignmentId, ownerEmail);
  if (!access?.canWrite) {
    const err = new Error('无权编辑该页签');
    err.statusCode = 403;
    throw err;
  }
  if (access.row.locked_by && access.row.locked_by !== userId) {
    const err = new Error('TAB_LOCKED_BY_OTHER');
    err.statusCode = 423;
    throw err;
  }
  await pool.query(
    `INSERT INTO jiangsu_org_plan_contents (assignment_id, content, updated_by, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT(assignment_id) DO UPDATE SET content=$2, updated_by=$3, updated_at=NOW()`,
    [assignmentId, typeof content === 'string' ? content : JSON.stringify(content || JSON.parse(EMPTY_DOC)), userId]
  );
  if (access.row.note_id) {
    await refreshOrgPlanPageDocuments(pool, [access.row.note_id]);
  }
  return { success: true };
}

async function lockTab(pool, userId, assignmentId, userName, ownerEmail) {
  const access = await getTabAccess(pool, userId, assignmentId, ownerEmail);
  if (!access?.canWrite) {
    const err = new Error('无权锁定该页签');
    err.statusCode = 403;
    throw err;
  }
  const result = await pool.query(
    `INSERT INTO jiangsu_org_tab_locks (assignment_id, locked_by, locked_by_name, locked_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT(assignment_id) DO UPDATE SET locked_by=$2, locked_by_name=$3, locked_at=NOW()
     WHERE jiangsu_org_tab_locks.locked_by = $2
     RETURNING assignment_id`,
    [assignmentId, userId, userName || '']
  );
  if (!result.rows.length) {
    const err = new Error('TAB_LOCKED_BY_OTHER');
    err.statusCode = 409;
    throw err;
  }
  if (access.row.note_id) {
    await refreshOrgPlanPageDocuments(pool, [access.row.note_id]);
  }
  return { success: true };
}

async function unlockTab(pool, userId, assignmentId, ownerEmail) {
  const access = await getTabAccess(pool, userId, assignmentId, ownerEmail);
  if (!access) {
    const err = new Error('任职页签不存在');
    err.statusCode = 404;
    throw err;
  }
  if (access.row.locked_by && access.row.locked_by !== userId && !access.isOwner) {
    const err = new Error('无权解锁该页签');
    err.statusCode = 403;
    throw err;
  }
  await pool.query('DELETE FROM jiangsu_org_tab_locks WHERE assignment_id=$1', [assignmentId]);
  if (access.row.note_id) {
    await refreshOrgPlanPageDocuments(pool, [access.row.note_id]);
  }
  return { success: true };
}

module.exports = {
  ARCHIVE_SECTION_TITLE,
  CURRENT_SECTION_TITLE,
  EMPTY_DOC,
  ensureJiangsuOrgTables,
  fetchHcmJobInformationRows,
  fetchHcmOrgDepartmentMap,
  getBinding,
  getStatus,
  getTabContent,
  listTabs,
  lockTab,
  nowIsoDate,
  deleteExcludedOrgPlanAssignments,
  refreshOrgPlanPageDocuments,
  saveTabContent,
  sendIdentityCode,
  rebuildJiangsuOrgNotebookStructure,
  syncJiangsuOrgNotebook,
  unlockTab,
  verifyIdentityCode,
};
