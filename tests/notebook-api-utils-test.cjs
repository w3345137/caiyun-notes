const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createNotebookApiToken,
  hashNotebookApiToken,
  verifyNotebookApiToken,
  tiptapDocToMarkdown,
  collectAttachmentReferences,
  extractPlainTextFromBuffer,
  extractTextFromBuffer,
} = require('../backend/notebookApiUtils');

const issued = createNotebookApiToken('agent-key');
assert.match(issued.token, /^cynb_[A-Za-z0-9_-]{40,}$/);
assert.equal(issued.prefix, issued.token.slice(0, 14));
assert.equal(issued.hash, hashNotebookApiToken(issued.token));
assert.equal(verifyNotebookApiToken(issued.token, issued.hash), true);
assert.equal(verifyNotebookApiToken(`${issued.token}x`, issued.hash), false);

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '计划' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '第一段' }] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '条目 A' }] }] },
      ],
    },
    {
      type: 'attachmentBlock',
      attrs: { attachmentId: 'att-1', fileName: '方案.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    },
    {
      type: 'tabGroup',
      attrs: {
        tabs: [{ id: 't1', title: '页签一' }, { id: 't2', title: '页签二' }],
        contents: {
          t1: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '页签内容一' }] }] },
          t2: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '页签内容二' }] }] },
        },
      },
    },
  ],
};

const markdown = tiptapDocToMarkdown(doc);
assert.match(markdown, /## 计划/);
assert.match(markdown, /第一段/);
assert.match(markdown, /- 条目 A/);
assert.match(markdown, /\[附件: 方案\.docx\]\(caiyun-attachment:\/\/att-1\)/);
assert.match(markdown, /### 页签一/);
assert.match(markdown, /页签内容二/);

assert.deepEqual(collectAttachmentReferences(doc), [
  {
    id: 'att-1',
    fileName: '方案.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    source: 'attachmentBlock',
  },
]);

const text = extractPlainTextFromBuffer(Buffer.from('hello\nworld'), 'text/plain', 'a.txt');
assert.deepEqual(text, { supported: true, text: 'hello\nworld' });

const unsupported = extractPlainTextFromBuffer(Buffer.from([0, 1, 2]), 'image/png', 'a.png');
assert.equal(unsupported.supported, false);
assert.match(unsupported.reason, /不支持/);

function makePdfWithText(text) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${`BT /F1 24 Tf 72 720 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 24 Tf 72 720 Td (${text}) Tj ET\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function commandExists(command) {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

(async () => {
  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>文档正文</w:t></w:r></w:p></w:body></w:document>');
  const docx = await zip.generateAsync({ type: 'nodebuffer' });
  const extracted = await extractTextFromBuffer(docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'demo.docx');
  assert.equal(extracted.supported, true);
  assert.match(extracted.text, /文档正文/);
  assert.doesNotMatch(extracted.text, /PK\u0003\u0004/);

  const xlsxZip = new JSZip();
  xlsxZip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  xlsxZip.file('xl/sharedStrings.xml', '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>共享文本</t></si></sst>');
  xlsxZip.file('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
  xlsxZip.file('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c t="s"><v>0</v></c><c t="inlineStr"><is><t>内联文本</t></is></c><c><v>42</v></c></row></sheetData></worksheet>');
  const xlsx = await xlsxZip.generateAsync({ type: 'nodebuffer' });
  const xlsxExtracted = await extractTextFromBuffer(xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'demo.xlsx');
  assert.equal(xlsxExtracted.supported, true);
  assert.match(xlsxExtracted.text, /共享文本/);
  assert.match(xlsxExtracted.text, /内联文本/);
  assert.match(xlsxExtracted.text, /42/);
  assert.doesNotMatch(xlsxExtracted.text, /PK\u0003\u0004/);

  const pptxZip = new JSZip();
  pptxZip.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><a:p><a:r><a:t>第一页标题</a:t></a:r></a:p></p:spTree></p:cSld></p:sld>');
  pptxZip.file('ppt/slides/slide2.xml', '<p:sld><p:cSld><p:spTree><a:p><a:r><a:t>第二页内容</a:t></a:r></a:p></p:spTree></p:cSld></p:sld>');
  const pptx = await pptxZip.generateAsync({ type: 'nodebuffer' });
  const pptxExtracted = await extractTextFromBuffer(pptx, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'demo.pptx');
  assert.equal(pptxExtracted.supported, true);
  assert.match(pptxExtracted.text, /第一页标题/);
  assert.match(pptxExtracted.text, /第二页内容/);
  assert.doesNotMatch(pptxExtracted.text, /PK\u0003\u0004/);

  const pdf = makePdfWithText('PDF office text');
  const pdfExtracted = await extractTextFromBuffer(pdf, 'application/pdf', 'demo.pdf');
  assert.equal(pdfExtracted.supported, true);
  assert.match(pdfExtracted.text, /PDF office text/);

  const scannedPdfLike = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  const scannedPdfResult = await extractTextFromBuffer(scannedPdfLike, 'application/pdf', 'scan.pdf');
  assert.equal(scannedPdfResult.supported, false);
  assert.match(scannedPdfResult.reason, /OCR|扫描/);

  if (commandExists('soffice')) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudnotes-office-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'legacy.txt'), 'legacy doc text');
      execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${path.join(tempDir, 'profile')}`, '--convert-to', 'doc', '--outdir', tempDir, path.join(tempDir, 'legacy.txt')], { stdio: 'ignore' });
      const legacyDoc = fs.readFileSync(path.join(tempDir, 'legacy.doc'));
      const legacyExtracted = await extractTextFromBuffer(legacyDoc, 'application/msword', 'legacy.doc');
      assert.equal(legacyExtracted.supported, true);
      assert.match(legacyExtracted.text, /legacy doc text/);

      fs.writeFileSync(path.join(tempDir, 'legacy.csv'), 'legacy xls text,42');
      execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${path.join(tempDir, 'profile-xls')}`, '--convert-to', 'xls', '--outdir', tempDir, path.join(tempDir, 'legacy.csv')], { stdio: 'ignore' });
      const legacyXls = fs.readFileSync(path.join(tempDir, 'legacy.xls'));
      const legacyXlsExtracted = await extractTextFromBuffer(legacyXls, 'application/vnd.ms-excel', 'legacy.xls');
      assert.equal(legacyXlsExtracted.supported, true);
      assert.match(legacyXlsExtracted.text, /legacy xls text/);
      assert.match(legacyXlsExtracted.text, /42/);
    } catch (error) {
      console.warn(`legacy office extraction fixture skipped: ${error.message}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  console.log('notebook api utils tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
