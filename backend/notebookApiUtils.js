const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const NOTEBOOK_API_TOKEN_PREFIX = 'cynb_';
const execFileAsync = promisify(execFile);
const OFFICE_EXTRACT_TIMEOUT_MS = 30_000;
const OFFICE_EXTRACT_MAX_BUFFER = 30 * 1024 * 1024;

function hashNotebookApiToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function createNotebookApiToken(name = '') {
  const entropy = crypto.randomBytes(36).toString('base64url');
  const token = `${NOTEBOOK_API_TOKEN_PREFIX}${entropy}`;
  return {
    token,
    prefix: token.slice(0, 14),
    hash: hashNotebookApiToken(token),
    name: String(name || '').trim() || '智能体 API',
  };
}

function verifyNotebookApiToken(token, expectedHash) {
  const actual = Buffer.from(hashNotebookApiToken(token), 'hex');
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function parseTiptapDoc(content) {
  if (!content) return { type: 'doc', content: [] };
  if (typeof content === 'object') return content?.type === 'doc' ? content : { type: 'doc', content: [] };
  try {
    const parsed = JSON.parse(content);
    return parsed?.type === 'doc' ? parsed : { type: 'doc', content: [] };
  } catch (_) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: String(content) }] }] };
  }
}

function textMarksToMarkdown(text, marks = []) {
  let result = text || '';
  for (const mark of marks || []) {
    if (mark.type === 'bold') result = `**${result}**`;
    if (mark.type === 'italic') result = `*${result}*`;
    if (mark.type === 'strike') result = `~~${result}~~`;
    if (mark.type === 'code') result = `\`${result}\``;
    if (mark.type === 'link' && mark.attrs?.href) result = `[${result}](${mark.attrs.href})`;
  }
  return result;
}

function inlineToMarkdown(nodes = []) {
  return (nodes || []).map((node) => {
    if (node.type === 'text') return textMarksToMarkdown(node.text || '', node.marks);
    if (node.type === 'hardBreak') return '\n';
    if (Array.isArray(node.content)) return inlineToMarkdown(node.content);
    return '';
  }).join('');
}

function tableToMarkdown(table) {
  const rows = (table.content || []).map((row) => (row.content || []).map((cell) => {
    const text = (cell.content || []).map(nodeToMarkdown).join(' ').replace(/\s+/g, ' ').trim();
    return text.replace(/\|/g, '\\|');
  }));
  if (!rows.length) return '';
  const width = Math.max(...rows.map(r => r.length));
  const normalized = rows.map(r => [...r, ...Array(Math.max(0, width - r.length)).fill('')]);
  const header = normalized[0];
  const separator = Array(width).fill('---');
  const body = normalized.slice(1);
  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...body.map(r => `| ${r.join(' | ')} |`),
  ].join('\n');
}

function listToMarkdown(node, ordered = false, depth = 0) {
  const items = node.content || [];
  return items.map((item, index) => {
    const children = item.content || [];
    const firstParagraph = children.find(child => child.type === 'paragraph');
    const nested = children.filter(child => child.type === 'bulletList' || child.type === 'orderedList');
    const prefix = ordered ? `${index + 1}. ` : '- ';
    const line = `${'  '.repeat(depth)}${prefix}${firstParagraph ? inlineToMarkdown(firstParagraph.content || []) : ''}`;
    const nestedText = nested.map(child => listToMarkdown(child, child.type === 'orderedList', depth + 1)).filter(Boolean).join('\n');
    return nestedText ? `${line}\n${nestedText}` : line;
  }).join('\n');
}

function nodeToMarkdown(node) {
  if (!node) return '';
  switch (node.type) {
    case 'doc':
      return (node.content || []).map(nodeToMarkdown).filter(Boolean).join('\n\n').trim();
    case 'paragraph':
      return inlineToMarkdown(node.content || []).trim();
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level || 1), 1), 6);
      return `${'#'.repeat(level)} ${inlineToMarkdown(node.content || []).trim()}`.trim();
    }
    case 'blockquote':
      return (node.content || []).map(nodeToMarkdown).join('\n').split('\n').map(line => `> ${line}`).join('\n');
    case 'codeBlock':
      return `\`\`\`\n${inlineToMarkdown(node.content || [])}\n\`\`\``;
    case 'bulletList':
      return listToMarkdown(node, false);
    case 'orderedList':
      return listToMarkdown(node, true);
    case 'table':
      return tableToMarkdown(node);
    case 'horizontalRule':
      return '---';
    case 'image':
      return node.attrs?.src ? `![${node.attrs?.alt || ''}](${node.attrs.src})` : '';
    case 'attachmentBlock': {
      const id = node.attrs?.attachmentId || '';
      const name = node.attrs?.fileName || id || '附件';
      return id ? `[附件: ${name}](caiyun-attachment://${id})` : `[附件: ${name}]`;
    }
    case 'folderBlock':
      return `[附件文件夹: ${node.attrs?.folderName || '附件文件夹'}]`;
    case 'audioBlock': {
      const lines = [`[录音: ${node.attrs?.audioFileName || node.attrs?.audioAttachmentId || '音频'}]`];
      if (node.attrs?.transcriptionText) lines.push(String(node.attrs.transcriptionText));
      return lines.join('\n');
    }
    case 'mindmap':
      return node.attrs?.content ? `[思维导图]\n${node.attrs.content}` : '[思维导图]';
    case 'routeBlock':
      return '[路线]';
    case 'tabGroup': {
      const tabs = Array.isArray(node.attrs?.tabs) ? node.attrs.tabs : [];
      const contents = node.attrs?.contents || {};
      return tabs.map((tab) => {
        const title = tab.title || tab.id || '页签';
        return `### ${title}\n\n${tiptapDocToMarkdown(contents[tab.id])}`;
      }).join('\n\n').trim();
    }
    default:
      if (Array.isArray(node.content)) return node.content.map(nodeToMarkdown).filter(Boolean).join('\n\n');
      return '';
  }
}

function tiptapDocToMarkdown(doc) {
  return nodeToMarkdown(parseTiptapDoc(doc));
}

function collectAttachmentReferences(doc) {
  const refs = [];
  const visit = (node) => {
    if (!node) return;
    if (node.type === 'attachmentBlock' && node.attrs?.attachmentId) {
      refs.push({
        id: node.attrs.attachmentId,
        fileName: node.attrs.fileName || '',
        mimeType: node.attrs.mimeType || '',
        source: 'attachmentBlock',
      });
    }
    if (node.type === 'audioBlock' && node.attrs?.audioAttachmentId) {
      refs.push({
        id: node.attrs.audioAttachmentId,
        fileName: node.attrs.audioFileName || '',
        mimeType: 'audio/*',
        source: 'audioBlock',
      });
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
    if (node.type === 'tabGroup' && node.attrs?.contents) {
      Object.values(node.attrs.contents).forEach(content => visit(parseTiptapDoc(content)));
    }
  };
  visit(parseTiptapDoc(doc));
  const seen = new Set();
  return refs.filter((ref) => {
    if (seen.has(ref.id)) return false;
    seen.add(ref.id);
    return true;
  });
}

function extractPlainTextFromBuffer(buffer, mimeType = '', fileName = '') {
  const lowerName = String(fileName || '').toLowerCase();
  const type = String(mimeType || '').toLowerCase();
  const isText = type.startsWith('text/')
    || type.includes('json')
    || type === 'application/xml'
    || type === 'text/xml'
    || type.endsWith('+xml')
    || type.includes('csv')
    || lowerName.endsWith('.txt')
    || lowerName.endsWith('.md')
    || lowerName.endsWith('.csv')
    || lowerName.endsWith('.json')
    || lowerName.endsWith('.xml');
  if (!isText) {
    return { supported: false, reason: `暂不支持从 ${mimeType || fileName || '该类型'} 抽取文本` };
  }
  return { supported: true, text: Buffer.from(buffer).toString('utf8') };
}

function decodeXmlText(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function collapseExtractedText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function stripOfficeXml(xml) {
  return collapseExtractedText(decodeXmlText(String(xml || '')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/a:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')));
}

function xmlTextValues(xml) {
  const values = [];
  const re = /<[^:>]*:?t(?:\s[^>]*)?>([\s\S]*?)<\/[^:>]*:?t>/g;
  let match;
  while ((match = re.exec(String(xml || '')))) {
    values.push(decodeXmlText(match[1]));
  }
  return values;
}

function numericSuffix(name) {
  const match = String(name || '').match(/(\d+)(?=\.[^.]+$)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function sortOfficeParts(names) {
  return [...names].sort((a, b) => numericSuffix(a) - numericSuffix(b) || a.localeCompare(b));
}

function isLegacyOfficeFile(mimeType = '', fileName = '') {
  const lowerName = String(fileName || '').toLowerCase();
  const type = String(mimeType || '').toLowerCase();
  return lowerName.endsWith('.doc')
    || lowerName.endsWith('.xls')
    || lowerName.endsWith('.ppt')
    || lowerName.endsWith('.rtf')
    || lowerName.endsWith('.odt')
    || lowerName.endsWith('.ods')
    || lowerName.endsWith('.odp')
    || lowerName.endsWith('.wps')
    || lowerName.endsWith('.wpt')
    || lowerName.endsWith('.et')
    || lowerName.endsWith('.ett')
    || lowerName.endsWith('.dps')
    || lowerName.endsWith('.dpt')
    || type === 'application/msword'
    || type === 'application/vnd.ms-excel'
    || type === 'application/vnd.ms-powerpoint'
    || type.includes('opendocument')
    || type.includes('rtf');
}

function isLegacySpreadsheetFile(mimeType = '', fileName = '') {
  const lowerName = String(fileName || '').toLowerCase();
  const type = String(mimeType || '').toLowerCase();
  return lowerName.endsWith('.xls')
    || lowerName.endsWith('.ods')
    || lowerName.endsWith('.et')
    || lowerName.endsWith('.ett')
    || type === 'application/vnd.ms-excel'
    || type.includes('spreadsheet')
    || type.includes('opendocument.spreadsheet');
}

function isModernOfficeFile(mimeType = '', fileName = '') {
  const lowerName = String(fileName || '').toLowerCase();
  const type = String(mimeType || '').toLowerCase();
  return lowerName.endsWith('.docx')
    || lowerName.endsWith('.xlsx')
    || lowerName.endsWith('.pptx')
    || type.includes('officedocument');
}

async function commandExists(command) {
  try {
    await execFileAsync('which', [command], { timeout: 5_000 });
    return true;
  } catch (_) {
    return false;
  }
}

async function firstAvailableCommand(commands) {
  for (const command of commands) {
    if (await commandExists(command)) return command;
  }
  return null;
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cloudnotes-office-'));
}

function safeExtension(fileName = '', fallback = '.bin') {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return ext && /^[.[a-z0-9]+$/.test(ext) ? ext : fallback;
}

function decodePdfLiteral(text) {
  return String(text || '')
    .replace(/\\([nrtbf()\\])/g, (_, ch) => {
      if (ch === 'n') return '\n';
      if (ch === 'r') return '\r';
      if (ch === 't') return '\t';
      if (ch === 'b') return '\b';
      if (ch === 'f') return '\f';
      return ch;
    })
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function extractSimplePdfText(buffer) {
  const source = Buffer.from(buffer).toString('latin1');
  const parts = [];
  const literalTj = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  const arrayTj = /\[(.*?)\]\s*TJ/gs;
  let match;
  while ((match = literalTj.exec(source))) {
    const literal = match[0].match(/\(((?:\\.|[^\\)])*)\)/);
    if (literal) parts.push(decodePdfLiteral(literal[1]));
  }
  while ((match = arrayTj.exec(source))) {
    const inner = match[1];
    const literals = inner.match(/\((?:\\.|[^\\)])*\)/g) || [];
    const text = literals.map(item => decodePdfLiteral(item.slice(1, -1))).join('');
    if (text) parts.push(text);
  }
  return collapseExtractedText(parts.join('\n'));
}

async function extractPdfText(buffer) {
  const pdftotext = await firstAvailableCommand(['pdftotext']);
  if (pdftotext) {
    const tempDir = makeTempDir();
    const inputPath = path.join(tempDir, 'input.pdf');
    try {
      fs.writeFileSync(inputPath, buffer);
      const { stdout } = await execFileAsync(pdftotext, ['-layout', '-enc', 'UTF-8', inputPath, '-'], {
        timeout: OFFICE_EXTRACT_TIMEOUT_MS,
        maxBuffer: OFFICE_EXTRACT_MAX_BUFFER,
      });
      const text = collapseExtractedText(stdout);
      if (text) return { supported: true, text };
    } catch (_) {
      // Fall through to lightweight parsing.
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  const fallbackText = extractSimplePdfText(buffer);
  if (fallbackText) return { supported: true, text: fallbackText };
  return { supported: false, reason: 'PDF 未提取到文本，可能是扫描版 PDF 或图片型 PDF；当前接口不做 OCR' };
}

async function extractWithLibreOffice(buffer, fileName = '', mimeType = '') {
  const command = await firstAvailableCommand(['soffice', 'libreoffice']);
  if (!command) return { supported: false, reason: '服务器未安装 LibreOffice，暂不能解析旧版 Office/WPS 文件' };
  const tempDir = makeTempDir();
  const inputPath = path.join(tempDir, `input${safeExtension(fileName)}`);
  const profilePath = path.join(tempDir, 'lo-profile');
  const targetExt = isLegacySpreadsheetFile(mimeType, fileName) ? '.csv' : '.txt';
  const convertArgs = targetExt === '.csv' ? ['--convert-to', 'csv'] : ['--convert-to', 'txt:Text'];
  try {
    fs.writeFileSync(inputPath, buffer);
    await execFileAsync(command, ['--headless', `-env:UserInstallation=file://${profilePath}`, ...convertArgs, '--outdir', tempDir, inputPath], {
      timeout: OFFICE_EXTRACT_TIMEOUT_MS,
      maxBuffer: OFFICE_EXTRACT_MAX_BUFFER,
    });
    const outputPath = path.join(tempDir, `input${targetExt}`);
    if (!fs.existsSync(outputPath)) {
      const generated = fs.readdirSync(tempDir)
        .filter(name => name !== path.basename(inputPath) && name !== 'lo-profile')
        .map(name => path.join(tempDir, name))
        .find(item => fs.statSync(item).isFile());
      if (!generated) return { supported: false, reason: 'LibreOffice 转换完成但未生成文本文件' };
      const text = collapseExtractedText(fs.readFileSync(generated, 'utf8'));
      if (!text) return { supported: false, reason: '文件已解析但未提取到文本' };
      return { supported: true, text };
    }
    const text = collapseExtractedText(fs.readFileSync(outputPath, 'utf8'));
    if (!text) return { supported: false, reason: '文件已解析但未提取到文本' };
    return { supported: true, text };
  } catch (error) {
    return { supported: false, reason: `LibreOffice 解析失败: ${error.message}` };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function extractDocxText(zip) {
  const partNames = sortOfficeParts(Object.keys(zip.files).filter(name =>
    name === 'word/document.xml'
    || /^word\/header\d+\.xml$/.test(name)
    || /^word\/footer\d+\.xml$/.test(name)
    || name === 'word/footnotes.xml'
    || name === 'word/endnotes.xml'
  ));
  if (!partNames.length) return { supported: false, reason: 'docx 缺少可读取的正文 XML' };
  const parts = [];
  for (const name of partNames) {
    parts.push(stripOfficeXml(await zip.file(name).async('string')));
  }
  return { supported: true, text: collapseExtractedText(parts.filter(Boolean).join('\n\n')) };
}

async function extractXlsxText(zip) {
  const sharedStrings = [];
  const sharedFile = zip.file('xl/sharedStrings.xml');
  if (sharedFile) {
    const sharedXml = await sharedFile.async('string');
    const itemRegex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    let item;
    while ((item = itemRegex.exec(sharedXml))) {
      sharedStrings.push(collapseExtractedText(xmlTextValues(item[1]).join('')));
    }
  }

  const sheetNames = sortOfficeParts(Object.keys(zip.files).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)));
  if (!sheetNames.length && !sharedStrings.length) {
    return { supported: false, reason: 'xlsx 暂未发现可抽取的工作表文本' };
  }

  const lines = [];
  for (const sheetName of sheetNames) {
    const xml = await zip.file(sheetName).async('string');
    const cells = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cell;
    while ((cell = cellRegex.exec(xml))) {
      const attrs = cell[1] || '';
      const body = cell[2] || '';
      let value = '';
      if (/t=["']s["']/.test(attrs)) {
        const v = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        value = sharedStrings[Number(v ? decodeXmlText(v[1]) : -1)] || '';
      } else if (/t=["']inlineStr["']/.test(attrs)) {
        value = xmlTextValues(body).join('');
      } else {
        const v = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        value = v ? decodeXmlText(v[1]) : xmlTextValues(body).join('');
      }
      value = collapseExtractedText(value);
      if (value) cells.push(value);
    }
    if (cells.length) lines.push(cells.join('\t'));
  }

  const text = collapseExtractedText(lines.join('\n'));
  if (text) return { supported: true, text };
  if (sharedStrings.some(Boolean)) return { supported: true, text: collapseExtractedText(sharedStrings.filter(Boolean).join('\n')) };
  return { supported: false, reason: 'xlsx 已读取但未提取到文本' };
}

async function extractPptxText(zip) {
  const slideFiles = sortOfficeParts(Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)));
  const noteFiles = sortOfficeParts(Object.keys(zip.files).filter(name => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)));
  const parts = [];
  for (const slideName of slideFiles) {
    parts.push(stripOfficeXml(await zip.file(slideName).async('string')));
  }
  for (const noteName of noteFiles) {
    parts.push(stripOfficeXml(await zip.file(noteName).async('string')));
  }
  const text = collapseExtractedText(parts.filter(Boolean).join('\n\n'));
  if (text) return { supported: true, text };
  return { supported: false, reason: 'pptx 已读取但未提取到文本' };
}

async function extractOfficeTextFromZip(buffer, fileName = '') {
  let JSZip;
  try {
    JSZip = require('jszip');
  } catch (_) {
    return { supported: false, reason: '服务器未安装 Office 文档解析依赖' };
  }
  const zip = await JSZip.loadAsync(buffer);
  const lowerName = String(fileName || '').toLowerCase();
  if (lowerName.endsWith('.docx')) {
    return extractDocxText(zip);
  }
  if (lowerName.endsWith('.xlsx')) {
    return extractXlsxText(zip);
  }
  if (lowerName.endsWith('.pptx')) {
    return extractPptxText(zip);
  }
  return { supported: false, reason: '暂不支持该 Office 格式' };
}

async function extractTextFromBuffer(buffer, mimeType = '', fileName = '') {
  const lowerName = String(fileName || '').toLowerCase();
  const type = String(mimeType || '').toLowerCase();
  if (lowerName.endsWith('.pdf') || type.includes('pdf')) {
    return extractPdfText(buffer);
  }
  if (isModernOfficeFile(mimeType, fileName)) {
    return extractOfficeTextFromZip(buffer, fileName);
  }
  if (isLegacyOfficeFile(mimeType, fileName)) {
    return extractWithLibreOffice(buffer, fileName, mimeType);
  }
  return extractPlainTextFromBuffer(buffer, mimeType, fileName);
}

module.exports = {
  NOTEBOOK_API_TOKEN_PREFIX,
  createNotebookApiToken,
  hashNotebookApiToken,
  verifyNotebookApiToken,
  parseTiptapDoc,
  tiptapDocToMarkdown,
  collectAttachmentReferences,
  extractPlainTextFromBuffer,
  extractTextFromBuffer,
};
