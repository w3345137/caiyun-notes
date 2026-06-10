const assert = require('assert');

const {
  getFileExtension,
  replaceFileNameInPath,
  validateAttachmentRename,
} = require('../backend/attachmentRenameUtils');

assert.equal(getFileExtension('通知.pdf'), '.pdf');
assert.equal(getFileExtension('通知.PDF'), '.pdf');
assert.equal(getFileExtension('无扩展名'), '');

assert.equal(
  replaceFileNameInPath('/彩云笔记/page-1/旧文件.pdf', '新文件.pdf'),
  '/彩云笔记/page-1/新文件.pdf',
);

assert.equal(
  replaceFileNameInPath('/彩云笔记/page-1/子目录/旧文件.pdf', '新文件.pdf'),
  '/彩云笔记/page-1/子目录/新文件.pdf',
);

assert.deepStrictEqual(
  validateAttachmentRename('旧文件.pdf', '新文件.pdf'),
  { ok: true, fileName: '新文件.pdf' },
);

assert.deepStrictEqual(
  validateAttachmentRename('旧文件.PDF', '新文件.pdf'),
  { ok: true, fileName: '新文件.pdf' },
);

assert.deepStrictEqual(
  validateAttachmentRename('旧文件.pdf', '新文件.docx'),
  { ok: false, error: '不允许修改文件扩展名' },
);

assert.deepStrictEqual(
  validateAttachmentRename('旧文件', '新文件.pdf'),
  { ok: false, error: '不允许修改文件扩展名' },
);

assert.deepStrictEqual(
  validateAttachmentRename('旧文件.pdf', '../新文件.pdf'),
  { ok: false, error: '文件名不能包含路径分隔符或控制字符' },
);

assert.deepStrictEqual(
  validateAttachmentRename('旧文件.pdf', '   '),
  { ok: false, error: '文件名不能为空' },
);

console.log('attachment rename utils tests passed');
