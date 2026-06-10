const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const backendDir = process.env.BACKEND_DIR || process.cwd();
require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') });

const { Pool } = require(path.join(backendDir, 'node_modules/pg'));
const JSZip = require(path.join(backendDir, 'node_modules/jszip'));
const { createNotebookApiToken } = require(path.join(backendDir, 'notebookApiUtils'));

const baseUrl = process.env.VERIFY_BASE_URL || 'https://notes.binapp.top';
const notebookId = process.env.VERIFY_NOTEBOOK_ID || '1774663093409-hvxvqnl4h';
const noteId = `codex-office-api-${Date.now()}`;

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'notesapp',
  user: process.env.DB_USER || 'notesapp_user',
  password: process.env.DB_PASSWORD || '',
});

function signJwt(user, ttlSeconds = 3600) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    email: user.email,
    display_name: user.display_name || user.email.split('@')[0],
    role: 'authenticated',
    iat: now,
    exp: now + ttlSeconds,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function makePdfWithText(text) {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
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

async function makeDocxBuffer() {
  const zip = new JSZip();
  zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>API DOCX verification text</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function makeXlsxBuffer() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  zip.file('xl/sharedStrings.xml', '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>API XLSX shared text</t></si></sst>');
  zip.file('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c t="s"><v>0</v></c><c t="inlineStr"><is><t>API XLSX inline text</t></is></c><c><v>42</v></c></row></sheetData></worksheet>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function makePptxBuffer() {
  const zip = new JSZip();
  zip.file('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree><a:p><a:r><a:t>API PPTX slide one</a:t></a:r></a:p></p:spTree></p:cSld></p:sld>');
  zip.file('ppt/slides/slide2.xml', '<p:sld><p:cSld><p:spTree><a:p><a:r><a:t>API PPTX slide two</a:t></a:r></a:p></p:spTree></p:cSld></p:sld>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

function makeLegacyDocBuffer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudnotes-e2e-office-'));
  try {
    fs.writeFileSync(path.join(tempDir, 'legacy.txt'), 'API legacy DOC verification text');
    execFileSync('soffice', [
      '--headless',
      `-env:UserInstallation=file://${path.join(tempDir, 'profile')}`,
      '--convert-to',
      'doc',
      '--outdir',
      tempDir,
      path.join(tempDir, 'legacy.txt'),
    ], { stdio: 'ignore' });
    return fs.readFileSync(path.join(tempDir, 'legacy.doc'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function makeLegacyXlsBuffer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudnotes-e2e-office-'));
  try {
    fs.writeFileSync(path.join(tempDir, 'legacy.csv'), 'API legacy XLS verification text,42');
    execFileSync('soffice', [
      '--headless',
      `-env:UserInstallation=file://${path.join(tempDir, 'profile')}`,
      '--convert-to',
      'xls',
      '--outdir',
      tempDir,
      path.join(tempDir, 'legacy.csv'),
    ], { stdio: 'ignore' });
    return fs.readFileSync(path.join(tempDir, 'legacy.xls'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    data = { raw };
  }
  if (!res.ok || data.error || data.success === false) {
    throw new Error(`${options?.method || 'GET'} ${url} failed: ${res.status} ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing');

  const ownerResult = await pool.query(
    `SELECT root.owner_id, up.email, up.display_name
     FROM notes root
     JOIN user_profiles up ON up.id = root.owner_id
     WHERE root.id = $1`,
    [notebookId]
  );
  if (!ownerResult.rows.length) throw new Error(`notebook not found: ${notebookId}`);
  const owner = ownerResult.rows[0];
  const jwt = signJwt({ id: owner.owner_id, email: owner.email, display_name: owner.display_name });

  await pool.query(
    `INSERT INTO notes (id, title, content, parent_id, type, owner_id, order_index, icon, root_notebook_id, updated_at)
     VALUES ($1, $2, $3, $4, 'page', $5, 999999, 'doc', $4, NOW())`,
    [noteId, `Codex Office API Verify ${Date.now()}`, '{"type":"doc","content":[]}', notebookId, owner.owner_id]
  );

  const issued = createNotebookApiToken('codex-office-api-e2e');
  const tokenId = `verify-${Date.now()}`;
  await pool.query(
    `INSERT INTO notebook_api_tokens (id, notebook_id, creator_user_id, name, token_hash, token_prefix, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '1 hour')`,
    [tokenId, notebookId, owner.owner_id, issued.name, issued.hash, issued.prefix]
  );

  const uploaded = [];
  try {
    const files = [
      { name: `codex-office-api-${Date.now()}.pdf`, marker: 'API PDF verification text', buffer: makePdfWithText('API PDF verification text') },
      { name: `codex-office-api-${Date.now()}.docx`, marker: 'API DOCX verification text', buffer: await makeDocxBuffer() },
      { name: `codex-office-api-${Date.now()}.xlsx`, marker: 'API XLSX shared text', buffer: await makeXlsxBuffer() },
      { name: `codex-office-api-${Date.now()}.pptx`, marker: 'API PPTX slide one', buffer: await makePptxBuffer() },
      { name: `codex-office-api-${Date.now()}.doc`, marker: 'API legacy DOC verification text', buffer: makeLegacyDocBuffer() },
      { name: `codex-office-api-${Date.now()}.xls`, marker: 'API legacy XLS verification text', buffer: makeLegacyXlsBuffer() },
    ];

    const results = [];
    for (const file of files) {
      const upload = await jsonFetch(`${baseUrl}/api/onedrive/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          note_id: noteId,
          file_name: file.name,
          file_content: file.buffer.toString('base64'),
          folder_path: '/',
          folder_name: '根目录',
        }),
      });
      uploaded.push(upload.data.id);

      const extracted = await jsonFetch(`${baseUrl}/api/notebook-api/v1/attachments/${encodeURIComponent(upload.data.id)}/text`, {
        headers: { Authorization: `Bearer ${issued.token}` },
      });
      const text = extracted.text || '';
      if (!text.includes(file.marker)) {
        throw new Error(`${file.name} text missing marker; got ${text.slice(0, 200)}`);
      }
      if (text.includes('PK\u0003\u0004')) {
        throw new Error(`${file.name} returned raw Office zip bytes instead of extracted text`);
      }
      results.push({
        file: file.name.replace(/codex-office-api-\d+/, 'codex-office-api-*'),
        status: 'ok',
        textLength: text.length,
        sample: text.slice(0, 80),
      });
    }

    console.log(JSON.stringify({ success: true, noteId, results }, null, 2));
  } finally {
    for (const attachmentId of uploaded.reverse()) {
      try {
        await jsonFetch(`${baseUrl}/api/onedrive/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ attachment_id: attachmentId }),
        });
      } catch (error) {
        console.error(`cleanup attachment failed ${attachmentId}: ${error.message}`);
      }
    }
    await pool.query('DELETE FROM notebook_api_tokens WHERE id = $1', [tokenId]).catch(() => {});
    await pool.query('DELETE FROM attachments WHERE note_id = $1', [noteId]).catch(() => {});
    await pool.query('DELETE FROM collab_documents WHERE note_id = $1', [noteId]).catch(() => {});
    await pool.query('DELETE FROM notes WHERE id = $1', [noteId]).catch(() => {});
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
