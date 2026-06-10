const crypto = require('crypto');

const ORG_PLAN_PAGE_KIND = 'org_plan_page';
const ORG_PLAN_NOTEBOOK_ID = 'jiangsu-company';
const ARCHIVE_SECTION_ID = 'jiangsu-company-archive';
const KNOWLEDGE_SECTION_ID = 'jiangsu-company-knowledge';
const COURSEWARE_PAGE_ID = 'jiangsu-company-courseware';
const COURSEWARE_PAGE_KIND = 'courseware_page';
const JIANGSU_UNIT_NAME = '江苏公司';
const HCM_DEPARTMENT_GROUP_TITLE = '直属部门组';
const HCM_PROJECT_GROUP_TITLE = '直属项目组';
const DEFAULT_DEPARTMENT_SECTION_TITLE = '总部';
const DEFAULT_PROJECT_SECTION_TITLE = '项目';
const DEFAULT_PROJECT_FALLBACK_SECTION_TITLE = '项目-其他';
const EXCLUDED_POSITION_KEYWORDS = ['司机', '厨师'];
const AI_LOCATION_CONFIDENCE_THRESHOLD = 0.75;

const CITY_ALIASES = [
  { city: '苏州', aliases: ['苏州', '阳澄湖', '苏地', '相城', '吴中', '昆山', '太仓', '常熟', '张家港'] },
  { city: '无锡', aliases: ['无锡', '锡山', '梁溪', '惠山', '滨湖', '宜兴', '江阴', '宛山湖', '世贸二期', '融腾', '扬名'] },
  { city: '南京', aliases: ['南京', '秦淮', '雨花', '江北'] },
  { city: '徐州', aliases: ['徐州', '丰县', '坡里', '侯集'] },
  { city: '宿迁', aliases: ['宿迁'] },
  { city: '南通', aliases: ['南通'] },
  { city: '泰州', aliases: ['泰州', '靖江', '兴化'] },
  { city: '淮安', aliases: ['淮安'] },
  { city: '常州', aliases: ['常州'] },
  { city: '扬州', aliases: ['扬州'] },
  { city: '镇江', aliases: ['镇江'] },
  { city: '盐城', aliases: ['盐城'] },
  { city: '连云港', aliases: ['连云港'] },
  { city: '上海', aliases: ['上海', '闵行'] },
];

const MANUAL_PROJECT_RULES = [
  { patterns: ['京东智慧城'], city: '宿迁' },
  { patterns: ['数据要素产业园'], city: '苏州', pageKey: '数据要素产业园' },
  { patterns: ['脑科医院'], city: '南京' },
  { patterns: ['黄山路'], city: '宿迁' },
  { patterns: ['凤溪湾', '凤栖湾'], city: '无锡' },
  { patterns: ['XDG-2010-40'], city: '无锡' },
];

const HEADQUARTERS_PAGE_ORDER = [
  { rank: 0, patterns: ['领导班子'] },
  { rank: 1, patterns: ['综合'] },
  { rank: 2, patterns: ['市场'] },
  { rank: 3, patterns: ['工程'] },
  { rank: 4, patterns: ['安全'] },
  { rank: 5, patterns: ['财务'] },
];

const LEADERSHIP_TAB_ORDER = ['王宇震', '王彬', '董凯', '刘胜强', '张玉磊', '李晓龙', '张志东'];

const PROJECT_KEYWORDS = [
  '项目',
  'EPC',
  '工程',
  '地块',
  '施工',
  '总承包',
  '产业园',
  '安置房',
  '改造',
  '厂房',
  '中心项目',
  '公租房',
];

function sha(input, len = 20) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex').slice(0, len);
}

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function objectName(value) {
  if (!value) return '';
  if (typeof value === 'object') return text(value.name);
  return text(value);
}

function objectId(value) {
  if (!value) return '';
  if (typeof value === 'object') return text(value.origin_id || value.id);
  return text(value);
}

function buildOrgNotebookId() {
  return ORG_PLAN_NOTEBOOK_ID;
}

function buildArchiveSectionId() {
  return ARCHIVE_SECTION_ID;
}

function buildKnowledgeSectionId() {
  return KNOWLEDGE_SECTION_ID;
}

function buildCoursewarePageId() {
  return COURSEWARE_PAGE_ID;
}

function buildOrgSectionId(sectionTitle) {
  return `jiangsu-company-section-${sha(sectionTitle)}`;
}

function buildOrgPageId(sectionTitle, pageKey) {
  if (pageKey === undefined) {
    return `jiangsu-company-page-${sha(sectionTitle)}`;
  }
  return `jiangsu-company-page-${sha(`${sectionTitle}|${pageKey}`)}`;
}

function buildAssignmentId(record) {
  if (record?.id !== undefined && record?.id !== null && String(record.id).trim()) {
    return `hcm-job-${String(record.id).trim()}`;
  }

  const seed = [
    record?.employeeId || record?.employee_id,
    record?.departmentOriginId || objectId(record?.department),
    record?.departmentName || objectName(record?.department),
    record?.positionOriginId || objectId(record?.position),
    record?.positionName || objectName(record?.position),
    record?.beginDate || record?.begin_date,
  ].map(text).join('|');
  return `hcm-job-derived-${sha(seed)}`;
}

function buildTabTitle({ positionName, employeeName }) {
  const position = text(positionName);
  const name = text(employeeName);
  return [position, name].filter(Boolean).join(' ') || '未命名';
}

function departmentPositionRank(positionName) {
  const position = text(positionName);
  if (!position) return 100;
  if (['副经理', '副部长', '副主任'].some((keyword) => position.includes(keyword))) return 1;
  if (['部门经理', '总经理', '负责人', '部长', '主任'].some((keyword) => position.includes(keyword)) || position === '经理') return 0;
  if (position.includes('助理')) return 2;
  return position.includes('员') ? 100 : 50;
}

function projectPositionRank(positionName) {
  const position = text(positionName);
  if (!position) return 100;
  const orderedRules = [
    ['指挥长'],
    ['项目经理'],
    ['项目执行经理'],
    ['项目副书记'],
    ['项目生产经理'],
    ['商务经理'],
    ['技术总工', '项目总工', '项目总工程师', '总工程师', '技术负责人'],
    ['设计经理'],
  ];
  for (let index = 0; index < orderedRules.length; index += 1) {
    if (orderedRules[index].some((keyword) => position.includes(keyword))) return index;
  }
  if (position.includes('总监')) return 8;
  if (position.includes('员')) return 100;
  return 50;
}

function orgPlanPositionRank(tab, sectionTitle) {
  const title = text(sectionTitle);
  const position = tab.positionName || tab.position_name;
  if (title.startsWith(`${DEFAULT_PROJECT_SECTION_TITLE}-`)) {
    return projectPositionRank(position);
  }
  return departmentPositionRank(position);
}

function leadershipTabRank(tab) {
  const employeeName = text(tab.employeeName || tab.employee_name);
  const index = LEADERSHIP_TAB_ORDER.indexOf(employeeName);
  return index === -1 ? 100 : index;
}

function compareOrgPlanTabs(a, b, sectionTitle, pageKey = '') {
  if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
  if (text(sectionTitle) === DEFAULT_DEPARTMENT_SECTION_TITLE && text(pageKey) === '领导班子') {
    const leaderRank = leadershipTabRank(a) - leadershipTabRank(b);
    if (leaderRank) return leaderRank;
  }
  const rank = orgPlanPositionRank(a, sectionTitle) - orgPlanPositionRank(b, sectionTitle);
  if (rank) return rank;
  const positionRank = text(a.positionName || a.position_name).localeCompare(text(b.positionName || b.position_name), 'zh-CN');
  if (positionRank) return positionRank;
  return text(a.employeeName || a.employee_name).localeCompare(text(b.employeeName || b.employee_name), 'zh-CN');
}

function sortOrgPlanTabs(tabs, sectionTitle, pageKey = '') {
  return [...(tabs || [])].sort((a, b) => compareOrgPlanTabs(a, b, sectionTitle, pageKey));
}

function shouldExcludeOrgPlanAssignment(assignment) {
  const positionName = text(assignment?.positionName || assignment?.position_name || objectName(assignment?.position));
  return EXCLUDED_POSITION_KEYWORDS.some((keyword) => positionName.includes(keyword));
}

function emptyEditorDoc() {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function parseEditorDoc(value) {
  if (!value) return emptyEditorDoc();
  if (typeof value === 'object' && value.type === 'doc') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed?.type === 'doc' ? parsed : emptyEditorDoc();
  } catch (_) {
    return emptyEditorDoc();
  }
}

function pageKeyForAssignment(assignment) {
  return text(assignment.pageKey) || text(assignment.departmentName) || '未分组';
}

function stripProjectSectionCount(sectionTitle) {
  return text(sectionTitle).replace(/（\d+）$/, '');
}

function normalizeProjectPageKey(projectName) {
  const name = text(projectName).replace(/_隐藏$/, '');
  const rule = MANUAL_PROJECT_RULES.find((item) => item.patterns.some((pattern) => name.includes(pattern)));
  return rule?.pageKey || name;
}

function isProjectDepartment(departmentName) {
  const name = text(departmentName);
  if (!name || ['未分组', '领导班子', '其他领导'].includes(name)) return false;
  if (name.includes('办公室') || name.endsWith('部') || /部[）)]$/.test(name)) return false;
  if (PROJECT_KEYWORDS.some((keyword) => name.includes(keyword))) return true;
  return true;
}

function classifySectionTitle(pageKey) {
  return isProjectDepartment(pageKey) ? DEFAULT_PROJECT_FALLBACK_SECTION_TITLE : DEFAULT_DEPARTMENT_SECTION_TITLE;
}

function splitOrgFullName(value) {
  return text(value)
    .split(/[/>｜|!_]+/)
    .map((part) => text(part))
    .filter(Boolean);
}

function orgPathText(value) {
  if (!value) return '';
  if (typeof value === 'object') return text(value.name);
  return text(value);
}

function extractJiangsuHierarchy(fullName) {
  const parts = splitOrgFullName(fullName);
  if (!parts.length) return null;
  const jiangsuIndex = parts.findIndex((part) => part === JIANGSU_UNIT_NAME || part.endsWith(JIANGSU_UNIT_NAME));
  if (jiangsuIndex < 0) return null;
  const sectionTitle = parts[jiangsuIndex + 1] || '';
  const pageKey = parts[jiangsuIndex + 2] || '';
  if (!sectionTitle) return null;
  return {
    sectionTitle,
    pageKey: pageKey || sectionTitle,
  };
}

function firstOrgFullName(row, orgDepartment) {
  const candidates = [
    row?.org_full_name,
    orgPathText(row?.org_full_path),
    row?.department?.org_full_name,
    orgPathText(row?.department?.org_full_path),
    row?.unit?.org_full_name,
    row?.position?.parent?.org_full_name,
    orgPathText(orgDepartment?.org_full_path),
    orgDepartment?.org_full_name,
  ];
  return candidates.map(text).find(Boolean) || '';
}

function objectValue(value) {
  if (!value) return '';
  if (typeof value === 'object') return text(value.name || value.value || value.number || value.id);
  return text(value);
}

function normalizeCityName(rawValue) {
  const value = objectValue(rawValue).replace(/^江苏省?/, '').replace(/^上海市?/, '上海');
  if (!value) return '';
  for (const item of CITY_ALIASES) {
    if (item.city === value) return item.city;
    if (item.aliases.some((alias) => value.includes(alias))) return item.city;
  }
  return value.length <= 6 ? value : '';
}

function inferProjectCityFromName(projectName) {
  const name = text(projectName);
  if (!name) return null;
  for (const item of CITY_ALIASES) {
    if (item.aliases.some((alias) => name.includes(alias))) {
      return { city: item.city, source: 'rule', confidence: 0.9 };
    }
  }
  return null;
}

function resolveManualProjectLocation(projectName) {
  const name = text(projectName);
  if (!name) return null;
  const rule = MANUAL_PROJECT_RULES.find((item) => item.patterns.some((pattern) => name.includes(pattern)));
  return rule?.city ? { city: rule.city, source: 'manual', confidence: 1 } : null;
}

function normalizeAiLocationSuggestion(suggestion) {
  if (!suggestion) return null;
  const confidence = Number(suggestion.confidence || 0);
  const city = normalizeCityName(suggestion.city || suggestion.location || suggestion.place);
  if (!city || confidence < AI_LOCATION_CONFIDENCE_THRESHOLD) return null;
  if (!CITY_ALIASES.some((item) => item.city === city)) return null;
  return {
    city,
    source: suggestion.source || 'ai',
    confidence,
  };
}

function projectLocationFromMap(projectLocations, projectName) {
  if (!projectLocations || !projectName) return null;
  const candidates = [
    text(projectName),
    text(projectName).replace(/_隐藏$/, ''),
  ].filter(Boolean);
  for (const key of candidates) {
    const value = projectLocations instanceof Map ? projectLocations.get(key) : projectLocations[key];
    const normalized = normalizeAiLocationSuggestion(value);
    if (normalized) return { ...normalized, source: value.source || normalized.source || 'manual' };
  }
  return null;
}

function resolveProjectLocation({ projectName, orgDepartment = null, projectLocations = null } = {}) {
  const manual = resolveManualProjectLocation(projectName);
  if (manual) return manual;

  const cached = projectLocationFromMap(projectLocations, projectName);
  if (cached) return cached;

  const cityFromHcm = normalizeCityName(orgDepartment?.city);
  if (cityFromHcm) return { city: cityFromHcm, source: 'hcm', confidence: 1 };

  const inferred = inferProjectCityFromName(projectName);
  if (inferred) return inferred;

  return null;
}

function sectionTitleForOrgHierarchy(orgHierarchy, pageKey, orgDepartment, projectLocations) {
  const rawSectionTitle = text(orgHierarchy?.sectionTitle);
  if (rawSectionTitle === HCM_DEPARTMENT_GROUP_TITLE) return DEFAULT_DEPARTMENT_SECTION_TITLE;
  if (rawSectionTitle === HCM_PROJECT_GROUP_TITLE || isProjectDepartment(pageKey)) {
    const location = resolveProjectLocation({ projectName: pageKey, orgDepartment, projectLocations });
    return location?.city ? `${DEFAULT_PROJECT_SECTION_TITLE}-${location.city}` : DEFAULT_PROJECT_FALLBACK_SECTION_TITLE;
  }
  return rawSectionTitle || classifySectionTitle(pageKey);
}

function normalizeJobInformationRecord(row, orgDepartment = null, projectLocations = null) {
  const employeeName = objectName(row.employee) || text(row.employee_name || row.name);
  const positionName = objectName(row.position) || text(row.position_name);
  const departmentName = objectName(row.department) || text(row.department_name);
  const unitName = objectName(row.unit) || text(row.unit_name || row.unit3);
  const positionStatus = objectName(row.position_status) || text(row.position_status);
  const endDate = text(row.end_date || row.endDate);
  const isEnded = !!endDate && endDate !== '至今';
  const departmentOriginId = objectId(row.department) || text(row.department_origin_id);
  const orgHierarchy = extractJiangsuHierarchy(firstOrgFullName(row, orgDepartment));
  const rawPageKey = text(orgHierarchy?.pageKey) || departmentName || '未分组';
  const isProject = text(orgHierarchy?.sectionTitle) === HCM_PROJECT_GROUP_TITLE || isProjectDepartment(rawPageKey);
  const pageKey = isProject ? normalizeProjectPageKey(rawPageKey) : rawPageKey;
  const sectionTitle = sectionTitleForOrgHierarchy(orgHierarchy, pageKey, orgDepartment, projectLocations);

  const normalized = {
    assignmentId: buildAssignmentId(row),
    sourceId: text(row.id),
    employeeId: text(row.employee_id || row.employeeId),
    employeeName,
    unitName,
    departmentName,
    departmentOriginId,
    positionName,
    positionOriginId: objectId(row.position) || text(row.position_origin_id),
    positionStatus,
    actionName: objectName(row.action) || text(row.action_name || row.action),
    beginDate: text(row.begin_date || row.beginDate),
    endDate,
    sectionTitle,
    pageKey,
    isJiangsu: unitName === JIANGSU_UNIT_NAME,
  };

  normalized.tabTitle = buildTabTitle(normalized);
  normalized.excludedFromOrgPlan = shouldExcludeOrgPlanAssignment(normalized);
  normalized.isActive = normalized.isJiangsu && !normalized.excludedFromOrgPlan && !isEnded && !['离职', '退休'].includes(positionStatus);
  normalized.archived = !normalized.isActive;
  return normalized;
}

function buildOrgPageContent({ pageKey, sectionTitle }) {
  return JSON.stringify({
    kind: ORG_PLAN_PAGE_KIND,
    pageKey: text(pageKey),
    sectionTitle: text(sectionTitle || pageKey),
  });
}

function buildCoursewarePageContent({ prefix = 'college/data', title = '课件' } = {}) {
  const cleanedPrefix = text(prefix).replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/?$/, '');
  return JSON.stringify({
    kind: COURSEWARE_PAGE_KIND,
    title: text(title) || '课件',
    prefix: cleanedPrefix ? `${cleanedPrefix}/` : '',
    readonly: true,
  });
}

function buildOrgPlanTabGroupDoc({ noteId, pageKey, sectionTitle, tabs = [] }) {
  const sortedTabs = sortOrgPlanTabs(tabs, sectionTitle, pageKey);
  const normalizedTabs = sortedTabs.map((tab) => {
    const id = text(tab.assignmentId || tab.assignment_id || tab.id);
    return {
      id,
      assignmentId: id,
      employeeId: text(tab.employeeId || tab.employee_id),
      employeeName: text(tab.employeeName || tab.employee_name),
      positionName: text(tab.positionName || tab.position_name),
      title: text(tab.tabTitle || tab.tab_title || tab.title) || buildTabTitle({
        positionName: tab.positionName || tab.position_name,
        employeeName: tab.employeeName || tab.employee_name,
      }),
      lockedBy: tab.lockedBy || tab.locked_by || null,
      lockedByName: tab.lockedByName || tab.locked_by_name || null,
    };
  }).filter((tab) => tab.id);
  const contents = {};
  for (const tab of sortedTabs) {
    const id = text(tab.assignmentId || tab.assignment_id || tab.id);
    if (!id) continue;
    contents[id] = parseEditorDoc(tab.content);
  }
  return {
    type: 'doc',
    content: [{
      type: 'tabGroup',
      attrs: {
        activeIndex: 0,
        structureLocked: true,
        orgPlan: {
          kind: ORG_PLAN_PAGE_KIND,
          noteId: text(noteId),
          pageKey: text(pageKey),
          sectionTitle: text(sectionTitle || pageKey),
        },
        tabs: normalizedTabs.length ? normalizedTabs : [{ id: 'empty', title: '暂无人员' }],
        contents: normalizedTabs.length ? contents : { empty: emptyEditorDoc() },
      },
    }],
  };
}

function parseOrgPageContent(rawContent) {
  if (!rawContent) return null;
  try {
    const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
    if (parsed && parsed.kind === ORG_PLAN_PAGE_KIND && typeof parsed.pageKey === 'string') {
      return parsed;
    }
    const tabGroup = (parsed?.content || []).find((node) => node?.type === 'tabGroup' && node?.attrs?.orgPlan);
    if (tabGroup?.attrs?.orgPlan?.kind === ORG_PLAN_PAGE_KIND) {
      return tabGroup.attrs.orgPlan;
    }
  } catch (_) {
    return null;
  }
  return null;
}

function isProtectedOrgNoteContent(rawContent) {
  return !!parseOrgPageContent(rawContent);
}

function groupAssignmentsByPage(assignments) {
  const grouped = new Map();
  for (const assignment of assignments || []) {
    const key = pageKeyForAssignment(assignment);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(assignment);
  }
  return grouped;
}

function groupAssignmentsBySectionPage(assignments) {
  const grouped = new Map();
  for (const assignment of assignments || []) {
    const sectionTitle = text(assignment.sectionTitle) || classifySectionTitle(assignment.pageKey);
    const pageKey = pageKeyForAssignment(assignment);
    if (!grouped.has(sectionTitle)) grouped.set(sectionTitle, new Map());
    const pages = grouped.get(sectionTitle);
    if (!pages.has(pageKey)) pages.set(pageKey, []);
    pages.get(pageKey).push(assignment);
  }
  return grouped;
}

function isPrimaryAssignment(assignment) {
  const actionName = text(assignment?.actionName || assignment?.action_name || objectName(assignment?.action));
  return !actionName.includes('多任职');
}

function sortOrgPlanPageKeys(sectionTitle, pages) {
  const keys = [...(pages?.keys?.() || [])];
  const isProjectSection = text(sectionTitle).startsWith(`${DEFAULT_PROJECT_SECTION_TITLE}-`);
  return keys.sort((a, b) => {
    if (isProjectSection) {
      const aPrimaryCount = (pages.get(a) || []).filter(isPrimaryAssignment).length;
      const bPrimaryCount = (pages.get(b) || []).filter(isPrimaryAssignment).length;
      const primaryRank = bPrimaryCount - aPrimaryCount;
      if (primaryRank) return primaryRank;
    }
    if (text(sectionTitle) === DEFAULT_DEPARTMENT_SECTION_TITLE) {
      const headquartersRank = headquartersPageRank(a) - headquartersPageRank(b);
      if (headquartersRank) return headquartersRank;
    }
    return text(a).localeCompare(text(b), 'zh-CN');
  });
}

function headquartersPageRank(pageKey) {
  const key = text(pageKey);
  const matched = HEADQUARTERS_PAGE_ORDER.find((item) => item.patterns.some((pattern) => key.includes(pattern)));
  return matched ? matched.rank : 100;
}

function applyProjectSectionCounts(assignments) {
  const projectPages = new Map();
  for (const assignment of assignments || []) {
    const baseTitle = stripProjectSectionCount(assignment.sectionTitle);
    if (!baseTitle.startsWith(`${DEFAULT_PROJECT_SECTION_TITLE}-`)) continue;
    if (!projectPages.has(baseTitle)) projectPages.set(baseTitle, new Set());
    projectPages.get(baseTitle).add(pageKeyForAssignment(assignment));
  }
  return (assignments || []).map((assignment) => {
    const baseTitle = stripProjectSectionCount(assignment.sectionTitle);
    const pages = projectPages.get(baseTitle);
    if (!pages) return assignment;
    return {
      ...assignment,
      sectionTitle: `${baseTitle}（${pages.size}）`,
      sectionKey: `${baseTitle}（${pages.size}）`,
    };
  });
}

function classifyAssignmentChange(current, next) {
  if (!next || next.archived || next.isActive === false) return 'archive';
  if (!current) return 'create';
  if ((current.sectionTitle || '') !== (next.sectionTitle || '')) return 'move';
  if (current.pageKey !== next.pageKey) return 'move';
  if (current.tabTitle !== next.tabTitle) return 'rename';
  return 'unchanged';
}

function normalizeStoredAssignment(row) {
  return {
    assignmentId: row.assignment_id || row.assignmentId,
    sectionTitle: row.section_title || row.sectionTitle || '',
    pageKey: row.page_key || row.pageKey,
    tabTitle: row.tab_title || row.tabTitle,
    archived: !!(row.archived || row.is_archived),
  };
}

function planAssignmentSync(previousRows, nextAssignments) {
  const previous = new Map((previousRows || []).map((row) => {
    const normalized = normalizeStoredAssignment(row);
    return [normalized.assignmentId, normalized];
  }));
  const next = new Map((nextAssignments || []).map((assignment) => [assignment.assignmentId, assignment]));
  const plan = {
    create: [],
    move: [],
    rename: [],
    archive: [],
    unchanged: [],
  };

  for (const assignment of next.values()) {
    const current = previous.get(assignment.assignmentId);
    const change = classifyAssignmentChange(current, assignment);
    plan[change].push(assignment);
  }

  for (const [assignmentId, row] of previous.entries()) {
    if (!next.has(assignmentId) && !row.archived) {
      plan.archive.push({
        assignmentId,
        pageKey: row.pageKey,
        tabTitle: row.tabTitle,
        archived: true,
      });
    }
  }

  return plan;
}

module.exports = {
  ARCHIVE_SECTION_ID,
  COURSEWARE_PAGE_ID,
  COURSEWARE_PAGE_KIND,
  DEFAULT_DEPARTMENT_SECTION_TITLE,
  DEFAULT_PROJECT_FALLBACK_SECTION_TITLE,
  DEFAULT_PROJECT_SECTION_TITLE,
  HCM_DEPARTMENT_GROUP_TITLE,
  HCM_PROJECT_GROUP_TITLE,
  JIANGSU_UNIT_NAME,
  KNOWLEDGE_SECTION_ID,
  ORG_PLAN_NOTEBOOK_ID,
  ORG_PLAN_PAGE_KIND,
  EXCLUDED_POSITION_KEYWORDS,
  buildArchiveSectionId,
  buildAssignmentId,
  buildCoursewarePageContent,
  buildCoursewarePageId,
  buildKnowledgeSectionId,
  buildOrgNotebookId,
  buildOrgPageContent,
  buildOrgPlanTabGroupDoc,
  buildOrgPageId,
  buildOrgSectionId,
  buildTabTitle,
  classifyAssignmentChange,
  classifySectionTitle,
  extractJiangsuHierarchy,
  groupAssignmentsBySectionPage,
  groupAssignmentsByPage,
  isProtectedOrgNoteContent,
  isProjectDepartment,
  parseEditorDoc,
  normalizeJobInformationRecord,
  normalizeAiLocationSuggestion,
  normalizeProjectPageKey,
  planAssignmentSync,
  parseOrgPageContent,
  resolveProjectLocation,
  applyProjectSectionCounts,
  shouldExcludeOrgPlanAssignment,
  sortOrgPlanPageKeys,
  sortOrgPlanTabs,
};
