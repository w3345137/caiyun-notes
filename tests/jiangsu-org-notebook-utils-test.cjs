const assert = require('node:assert/strict');

const {
  ORG_PLAN_PAGE_KIND,
  buildAssignmentId,
  buildArchiveSectionId,
  buildOrgNotebookId,
  buildOrgPageContent,
  buildOrgPlanTabGroupDoc,
  buildOrgPageId,
  buildOrgSectionId,
  buildTabTitle,
  classifyAssignmentChange,
  groupAssignmentsBySectionPage,
  groupAssignmentsByPage,
  isProtectedOrgNoteContent,
  normalizeJobInformationRecord,
  parseOrgPageContent,
  planAssignmentSync,
  shouldExcludeOrgPlanAssignment,
  sortOrgPlanPageKeys,
  sortOrgPlanTabs,
} = require('../backend/jiangsuOrgNotebookUtils');
const { nowIsoDate } = require('../backend/jiangsuOrgNotebook');

const rawPrimary = {
  id: 1001,
  employee_id: 3001,
  employee: { name: '张三' },
  unit: { name: '江苏公司' },
  department: { name: '领导班子', origin_id: 9001 },
  position: { name: '总经理', origin_id: 8001 },
  position_status: { name: '在岗' },
  action: { name: '初始化(主任职)' },
  begin_date: '2024-01-01',
  end_date: '至今',
};

assert.equal(nowIsoDate(new Date('2026-06-09T16:00:00.000Z')), '2026-06-10');
assert.equal(nowIsoDate(new Date('2026-06-10T15:59:59.000Z')), '2026-06-10');

const rawMulti = {
  id: 1002,
  employee_id: 3001,
  employee: { name: '张三' },
  unit: { name: '江苏公司' },
  department: { name: '无锡项目', origin_id: 9002 },
  position: { name: '项目经理', origin_id: 8002 },
  position_status: { name: '在岗' },
  action: { name: '多任职' },
  begin_date: '2025-01-01',
  end_date: '至今',
};

const primary = normalizeJobInformationRecord(rawPrimary);
const multi = normalizeJobInformationRecord(rawMulti);
const projectWithoutKeyword = normalizeJobInformationRecord({
  ...rawMulti,
  id: 1003,
  department: { name: '无锡锡山文体二期', origin_id: 9003 },
});
const withOrgFullPath = normalizeJobInformationRecord({
  ...rawMulti,
  id: 1004,
  department: { name: '市场与客户管理部', origin_id: 9004 },
}, {
  org_full_path: { name: '中国建筑_中建科工_华东大区_江苏公司_直属项目组_无锡锡山文体二期' },
});

assert.equal(primary.assignmentId, 'hcm-job-1001');
assert.equal(primary.employeeId, '3001');
assert.equal(primary.employeeName, '张三');
assert.equal(primary.unitName, '江苏公司');
assert.equal(primary.departmentName, '领导班子');
assert.equal(primary.positionName, '总经理');
assert.equal(primary.tabTitle, '总经理 张三');
assert.equal(primary.sectionTitle, '总部');
assert.equal(primary.pageKey, '领导班子');
assert.equal(primary.isActive, true);
assert.equal(shouldExcludeOrgPlanAssignment(primary), false);
assert.equal(multi.actionName, '多任职');
assert.equal(multi.sectionTitle, '项目-无锡');
assert.equal(projectWithoutKeyword.sectionTitle, '项目-无锡');
assert.equal(withOrgFullPath.sectionTitle, '项目-无锡');
assert.equal(withOrgFullPath.pageKey, '无锡锡山文体二期');

const driver = normalizeJobInformationRecord({
  ...rawPrimary,
  id: 1005,
  position: { name: '司机', origin_id: 8005 },
});
const chef = normalizeJobInformationRecord({
  ...rawPrimary,
  id: 1006,
  position: { name: '厨师长', origin_id: 8006 },
});
assert.equal(shouldExcludeOrgPlanAssignment(driver), true);
assert.equal(shouldExcludeOrgPlanAssignment(chef), true);
assert.equal(driver.isActive, false, '司机岗位不应进入江苏公司周计划页签');
assert.equal(chef.isActive, false, '厨师岗位不应进入江苏公司周计划页签');

assert.equal(buildTabTitle({ positionName: '项目总工程师', employeeName: '李四' }), '项目总工程师 李四');
assert.equal(buildTabTitle({ positionName: '', employeeName: '王五' }), '王五');

assert.equal(buildAssignmentId({ id: 42 }), 'hcm-job-42');
assert.match(buildAssignmentId({
  employeeId: '3001',
  departmentOriginId: '9001',
  departmentName: '领导班子',
  positionOriginId: '8001',
  positionName: '总经理',
  beginDate: '2024-01-01',
}), /^hcm-job-derived-[0-9a-f]{20}$/);

assert.equal(buildOrgNotebookId(), 'jiangsu-company');
assert.equal(buildArchiveSectionId(), 'jiangsu-company-archive');
assert.match(buildOrgSectionId('领导班子'), /^jiangsu-company-section-[0-9a-f]{20}$/);
assert.match(buildOrgPageId('总部', '领导班子'), /^jiangsu-company-page-[0-9a-f]{20}$/);
assert.notEqual(buildOrgPageId('总部', '综合办公室'), buildOrgPageId('项目-无锡', '综合办公室'));

const pageContent = buildOrgPageContent({ pageKey: '领导班子', sectionTitle: '总部' });
const parsed = parseOrgPageContent(pageContent);
assert.equal(parsed.kind, ORG_PLAN_PAGE_KIND);
assert.equal(parsed.pageKey, '领导班子');
assert.equal(parsed.sectionTitle, '总部');
assert.equal(isProtectedOrgNoteContent(pageContent), true);
assert.equal(isProtectedOrgNoteContent('{"kind":"email_thread"}'), false);

const orgTabDoc = buildOrgPlanTabGroupDoc({
  noteId: 'jiangsu-company-page-1',
  pageKey: '领导班子',
  sectionTitle: '总部',
  tabs: [
    { ...primary, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '周计划' }] }] } },
    multi,
  ],
});
assert.equal(orgTabDoc.type, 'doc');
assert.equal(orgTabDoc.content[0].type, 'tabGroup');
assert.equal(orgTabDoc.content[0].attrs.structureLocked, true);
assert.equal(orgTabDoc.content[0].attrs.orgPlan.kind, ORG_PLAN_PAGE_KIND);
assert.equal(orgTabDoc.content[0].attrs.tabs[0].id, primary.assignmentId);
assert.equal(orgTabDoc.content[0].attrs.tabs[0].title, '总经理 张三');
assert.equal(orgTabDoc.content[0].attrs.contents[primary.assignmentId].content[0].content[0].text, '周计划');
assert.equal(parseOrgPageContent(JSON.stringify(orgTabDoc)).pageKey, '领导班子');
assert.equal(isProtectedOrgNoteContent(JSON.stringify(orgTabDoc)), true);

const departmentSortedDoc = buildOrgPlanTabGroupDoc({
  noteId: 'jiangsu-company-page-dept',
  pageKey: '综合办公室',
  sectionTitle: '总部',
  tabs: [
    { assignmentId: 'dept-member', positionName: '业务员', employeeName: '王五' },
    { assignmentId: 'dept-deputy', positionName: '副经理', employeeName: '李四' },
    { assignmentId: 'dept-manager', positionName: '部门经理', employeeName: '张三' },
  ],
});
assert.deepEqual(departmentSortedDoc.content[0].attrs.tabs.map((tab) => tab.id), [
  'dept-manager',
  'dept-deputy',
  'dept-member',
]);

const projectSortedDoc = buildOrgPlanTabGroupDoc({
  noteId: 'jiangsu-company-page-project',
  pageKey: '某项目',
  sectionTitle: '项目-苏州（1）',
  tabs: [
    { assignmentId: 'project-member', positionName: '安全员', employeeName: '赵六' },
    { assignmentId: 'project-director', positionName: '安全总监', employeeName: '孙七' },
    { assignmentId: 'project-business', positionName: '商务经理', employeeName: '周八' },
    { assignmentId: 'project-manager', positionName: '项目经理', employeeName: '吴九' },
    { assignmentId: 'project-commander', positionName: '指挥长', employeeName: '郑十' },
    { assignmentId: 'project-exec', positionName: '项目执行经理', employeeName: '钱一' },
    { assignmentId: 'project-deputy-secretary', positionName: '项目副书记', employeeName: '陈二' },
    { assignmentId: 'project-production', positionName: '项目生产经理', employeeName: '刘三' },
    { assignmentId: 'project-chief-engineer', positionName: '技术总工', employeeName: '冯四' },
    { assignmentId: 'project-design', positionName: '设计经理', employeeName: '蒋五' },
  ],
});
assert.deepEqual(projectSortedDoc.content[0].attrs.tabs.map((tab) => tab.id), [
  'project-commander',
  'project-manager',
  'project-exec',
  'project-deputy-secretary',
  'project-production',
  'project-business',
  'project-chief-engineer',
  'project-design',
  'project-director',
  'project-member',
]);
assert.deepEqual(sortOrgPlanTabs([
  { assignmentId: 'api-member', positionName: '安全员', employeeName: '赵六' },
  { assignmentId: 'api-business', positionName: '商务经理', employeeName: '周八' },
  { assignmentId: 'api-manager', positionName: '项目经理', employeeName: '吴九' },
  { assignmentId: 'api-director', positionName: '安全总监', employeeName: '孙七' },
], '项目-苏州（1）').map((tab) => tab.assignmentId), [
  'api-manager',
  'api-business',
  'api-director',
  'api-member',
]);
assert.deepEqual(sortOrgPlanTabs([
  { assignmentId: 'leader-zhang', positionName: '副总经理（市场）', employeeName: '张志东' },
  { assignmentId: 'leader-wang-yz', positionName: '党总支书记、总经理', employeeName: '王宇震' },
  { assignmentId: 'leader-li', positionName: '副总经理（商务）', employeeName: '李晓龙' },
  { assignmentId: 'leader-dong', positionName: '总工程师', employeeName: '董凯' },
  { assignmentId: 'leader-wang-b', positionName: '党总支副书记', employeeName: '王彬' },
  { assignmentId: 'leader-zhang-y', positionName: '安全总监', employeeName: '张玉磊' },
  { assignmentId: 'leader-liu', positionName: '副总经理（生产）', employeeName: '刘胜强' },
], '总部', '领导班子').map((tab) => tab.assignmentId), [
  'leader-wang-yz',
  'leader-wang-b',
  'leader-dong',
  'leader-liu',
  'leader-zhang-y',
  'leader-li',
  'leader-zhang',
]);

const grouped = groupAssignmentsByPage([primary, multi]);
assert.equal(grouped.get('领导班子').length, 1);
assert.equal(grouped.get('无锡项目').length, 1);
const sectionGrouped = groupAssignmentsBySectionPage([primary, multi]);
assert.equal(sectionGrouped.get('总部').get('领导班子').length, 1);
assert.equal(sectionGrouped.get('项目-无锡').get('无锡项目').length, 1);
const countedSectionGrouped = groupAssignmentsBySectionPage([{ ...multi, sectionTitle: '项目-无锡（1）' }]);
assert.equal(countedSectionGrouped.get('项目-无锡（1）').get('无锡项目').length, 1);
const projectPageOrder = sortOrgPlanPageKeys('项目-无锡（3）', new Map([
  ['A项目', [
    { actionName: '多任职' },
    { actionName: '多任职' },
  ]],
  ['B项目', [
    { actionName: '调动' },
    { actionName: '多任职' },
  ]],
  ['C项目', [
    { actionName: '初始化(主任职)' },
    { actionName: '主任职' },
  ]],
]));
assert.deepEqual(projectPageOrder, ['C项目', 'B项目', 'A项目']);
const departmentPageOrder = sortOrgPlanPageKeys('总部', new Map([
  ['C部门', [{ actionName: '初始化(主任职)' }, { actionName: '主任职' }]],
  ['A部门', [{ actionName: '多任职' }]],
]));
assert.deepEqual(departmentPageOrder, ['A部门', 'C部门']);
const headquartersPageOrder = sortOrgPlanPageKeys('总部', new Map([
  ['财务部', [{}]],
  ['工程中心', [{}]],
  ['领导班子', [{}]],
  ['市场与客户管理部', [{}]],
  ['安全生产监督管理部', [{}]],
  ['综合办公室（党建工作部）', [{}]],
]));
assert.deepEqual(headquartersPageOrder, [
  '领导班子',
  '综合办公室（党建工作部）',
  '市场与客户管理部',
  '工程中心',
  '安全生产监督管理部',
  '财务部',
]);

assert.equal(classifyAssignmentChange(primary, { ...primary, pageKey: '领导班子', tabTitle: '总经理 张三' }), 'unchanged');
assert.equal(classifyAssignmentChange(primary, { ...primary, sectionTitle: '项目-无锡', pageKey: '领导班子', tabTitle: '总经理 张三' }), 'move');
assert.equal(classifyAssignmentChange(primary, { ...primary, pageKey: '领导班子', tabTitle: '董事长 张三' }), 'rename');
assert.equal(classifyAssignmentChange(primary, { ...primary, pageKey: '市场部', tabTitle: '总经理 张三' }), 'move');
assert.equal(classifyAssignmentChange(primary, { ...primary, archived: true }), 'archive');

const previousRows = [
  {
    assignment_id: primary.assignmentId,
    page_key: '领导班子',
    tab_title: '总经理 张三',
    archived: false,
  },
  {
    assignment_id: 'hcm-job-ended',
    page_key: '旧项目',
    tab_title: '项目经理 赵六',
    archived: false,
  },
];
const syncPlan = planAssignmentSync(previousRows, [
  { ...primary, pageKey: '新领导班子', departmentName: '新领导班子', tabTitle: '董事长 张三' },
  multi,
]);

assert.deepEqual(syncPlan.create.map((x) => x.assignmentId), [multi.assignmentId]);
assert.deepEqual(syncPlan.move.map((x) => x.assignmentId), [primary.assignmentId]);
assert.deepEqual(syncPlan.archive.map((x) => x.assignmentId), ['hcm-job-ended']);
