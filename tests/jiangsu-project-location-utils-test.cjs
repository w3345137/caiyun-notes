const assert = require('node:assert/strict');

const {
  DEFAULT_DEPARTMENT_SECTION_TITLE,
  DEFAULT_PROJECT_FALLBACK_SECTION_TITLE,
  DEFAULT_PROJECT_SECTION_TITLE,
  applyProjectSectionCounts,
  normalizeAiLocationSuggestion,
  normalizeJobInformationRecord,
  normalizeProjectPageKey,
  resolveProjectLocation,
} = require('../backend/jiangsuOrgNotebookUtils');

assert.equal(DEFAULT_DEPARTMENT_SECTION_TITLE, '总部');
assert.equal(DEFAULT_PROJECT_SECTION_TITLE, '项目');
assert.equal(DEFAULT_PROJECT_FALLBACK_SECTION_TITLE, '项目-其他');

const headquarters = normalizeJobInformationRecord({
  id: 1,
  employee_id: '1001',
  employee: { name: '张三' },
  unit: { name: '江苏公司' },
  department: { name: '财务部', origin_id: 11 },
  position: { name: '部门经理' },
  position_status: { name: '在岗' },
});
assert.equal(headquarters.sectionTitle, '总部');
assert.equal(headquarters.pageKey, '财务部');

const cityFromOrg = normalizeJobInformationRecord({
  id: 2,
  employee_id: '1002',
  employee: { name: '李四' },
  unit: { name: '江苏公司' },
  department: { name: '华润怡宝华东宜兴工厂项目', origin_id: 12 },
  position: { name: '项目经理' },
  position_status: { name: '在岗' },
}, {
  city: { name: '江苏宜兴' },
  org_full_path: { name: '中国建筑_中建科工_华东大区_江苏公司_直属项目组_华润怡宝华东宜兴工厂项目' },
});
assert.equal(cityFromOrg.sectionTitle, '项目-无锡');
assert.equal(cityFromOrg.pageKey, '华润怡宝华东宜兴工厂项目');

const cityFromName = normalizeJobInformationRecord({
  id: 3,
  employee_id: '1003',
  employee: { name: '王五' },
  unit: { name: '江苏公司' },
  department: { name: '苏州花木城项目', origin_id: 13 },
  position: { name: '项目经理' },
  position_status: { name: '在岗' },
});
assert.equal(cityFromName.sectionTitle, '项目-苏州');

const dataElementProject = normalizeJobInformationRecord({
  id: 4,
  employee_id: '1004',
  employee: { name: '赵六' },
  unit: { name: '江苏公司' },
  department: { name: '数据要素产业园项目(B地块)标段项目施工总承包', origin_id: 14 },
  position: { name: '项目经理' },
  position_status: { name: '在岗' },
});
assert.equal(dataElementProject.sectionTitle, '项目-苏州');
assert.equal(dataElementProject.pageKey, '数据要素产业园');
assert.equal(normalizeProjectPageKey('数据要素产业园项目 (C地块) 标段项目施工总承包'), '数据要素产业园');

assert.deepEqual(resolveProjectLocation({
  projectName: '秦淮区新华社地块充电站',
}), { city: '南京', source: 'rule', confidence: 0.9 });
assert.deepEqual(resolveProjectLocation({ projectName: '中建钢构京东智慧城三标段' }), { city: '宿迁', source: 'manual', confidence: 1 });
assert.deepEqual(resolveProjectLocation({ projectName: '江苏省脑科医院项目施工总承包' }), { city: '南京', source: 'manual', confidence: 1 });
assert.deepEqual(resolveProjectLocation({ projectName: '黄山路初中及特教学校' }), { city: '宿迁', source: 'manual', confidence: 1 });
assert.deepEqual(resolveProjectLocation({ projectName: '凤栖湾智造产业基地（C地块）项目' }), { city: '无锡', source: 'manual', confidence: 1 });
assert.deepEqual(resolveProjectLocation({ projectName: '凤溪湾智造产业基地（C地块）项目' }), { city: '无锡', source: 'manual', confidence: 1 });
assert.deepEqual(resolveProjectLocation({ projectName: 'XDG-2010-40 号地块（二期）开发建设项目 EPC 工程总承包' }), { city: '无锡', source: 'manual', confidence: 1 });

const counted = applyProjectSectionCounts([
  { sectionTitle: '总部', pageKey: '财务部' },
  { sectionTitle: '项目-苏州', pageKey: '苏州花木城项目' },
  { sectionTitle: '项目-苏州', pageKey: '数据要素产业园' },
  { sectionTitle: '项目-苏州', pageKey: '数据要素产业园' },
  { sectionTitle: '项目-无锡', pageKey: '凤栖湾智造产业基地（C地块）项目' },
  { sectionTitle: '项目-其他', pageKey: '未知项目' },
]);
assert.deepEqual(counted.map((item) => item.sectionTitle), [
  '总部',
  '项目-苏州（2）',
  '项目-苏州（2）',
  '项目-苏州（2）',
  '项目-无锡（1）',
  '项目-其他（1）',
]);

assert.equal(normalizeAiLocationSuggestion({ city: '苏州', confidence: 0.83 }).city, '苏州');
assert.equal(normalizeAiLocationSuggestion({ city: '苏州', confidence: 0.6 }), null);
assert.equal(normalizeAiLocationSuggestion({ city: '不存在', confidence: 0.95 }), null);

console.log('jiangsu-project-location-utils-test passed');
