const path = require('path');

function normalizeAttachmentFileName(fileName) {
  return String(fileName || '').trim();
}

function getFileExtension(fileName) {
  const baseName = path.basename(normalizeAttachmentFileName(fileName));
  const dotIndex = baseName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) return '';
  return baseName.slice(dotIndex).toLowerCase();
}

function hasUnsafeFileNameChars(fileName) {
  return /[\/\\\x00-\x1F\x7F]/.test(fileName);
}

function validateAttachmentRename(currentFileName, nextFileName) {
  const fileName = normalizeAttachmentFileName(nextFileName);
  if (!fileName) return { ok: false, error: '文件名不能为空' };
  if (fileName.length > 255) return { ok: false, error: '文件名不能超过 255 个字符' };
  if (fileName === '.' || fileName === '..' || hasUnsafeFileNameChars(fileName)) {
    return { ok: false, error: '文件名不能包含路径分隔符或控制字符' };
  }
  if (getFileExtension(currentFileName) !== getFileExtension(fileName)) {
    return { ok: false, error: '不允许修改文件扩展名' };
  }
  return { ok: true, fileName };
}

function replaceFileNameInPath(filePath, nextFileName) {
  const value = String(filePath || '');
  const slashIndex = value.lastIndexOf('/');
  if (slashIndex < 0) return nextFileName;
  return `${value.slice(0, slashIndex + 1)}${nextFileName}`;
}

module.exports = {
  getFileExtension,
  normalizeAttachmentFileName,
  replaceFileNameInPath,
  validateAttachmentRename,
};
