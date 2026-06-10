const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/lib/naturalSort.ts');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-natural-sort-'));

execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  [
    source,
    '--target',
    'ES2020',
    '--module',
    'CommonJS',
    '--outDir',
    outDir,
    '--skipLibCheck',
    '--esModuleInterop',
  ],
  { stdio: 'inherit' },
);

const { compareNaturalText } = require(path.join(outDir, 'naturalSort.js'));

const fileNames = [
  '人函【2026】10-关于开展华东大区2026年职称评审工作的通知.pdf',
  '人函【2026】12号-关于开展华东大区AI赋能基础管理专项行动的通知.pdf',
  '人函【2026】1号-关于华东大区2025年度项目经理任职资格评估结果的公示 最终.pdf',
  '人函【2026】2号-关于开展城市公司领导班子和领导人员2025年度综合考核评价和选拔任用“一报告两评议”工作的通知.pdf',
  '人函【2026】9号-关于开展华东大区2026年一般员工二季度PBC制定和一季度绩效考核和绩效反馈面谈工作的通知.pdf',
];

assert.deepStrictEqual(
  [...fileNames].sort(compareNaturalText),
  [
    '人函【2026】1号-关于华东大区2025年度项目经理任职资格评估结果的公示 最终.pdf',
    '人函【2026】2号-关于开展城市公司领导班子和领导人员2025年度综合考核评价和选拔任用“一报告两评议”工作的通知.pdf',
    '人函【2026】9号-关于开展华东大区2026年一般员工二季度PBC制定和一季度绩效考核和绩效反馈面谈工作的通知.pdf',
    '人函【2026】10-关于开展华东大区2026年职称评审工作的通知.pdf',
    '人函【2026】12号-关于开展华东大区AI赋能基础管理专项行动的通知.pdf',
  ],
  'Chinese file names with embedded numbers should use natural numeric order',
);

assert.deepStrictEqual(
  [...fileNames].sort((a, b) => compareNaturalText(b, a)),
  [
    '人函【2026】12号-关于开展华东大区AI赋能基础管理专项行动的通知.pdf',
    '人函【2026】10-关于开展华东大区2026年职称评审工作的通知.pdf',
    '人函【2026】9号-关于开展华东大区2026年一般员工二季度PBC制定和一季度绩效考核和绩效反馈面谈工作的通知.pdf',
    '人函【2026】2号-关于开展城市公司领导班子和领导人员2025年度综合考核评价和选拔任用“一报告两评议”工作的通知.pdf',
    '人函【2026】1号-关于华东大区2025年度项目经理任职资格评估结果的公示 最终.pdf',
  ],
  'Descending natural order should also keep multi-digit numbers together',
);
