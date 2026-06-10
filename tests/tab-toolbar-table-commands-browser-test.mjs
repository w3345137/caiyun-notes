import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({
  server: { host: '127.0.0.1', port: 5197 },
  logLevel: 'error',
});

await server.listen();

let browser;
let orgPlanSaveCalls = 0;

async function setInternalContent(page, content) {
  await page.evaluate((nextContent) => {
    window.activeInternalEditor.commands.setContent(nextContent, { emitUpdate: false });
    window.activeInternalEditor.chain().focus().run();
  }, content);
}

function paragraphDoc(text = '') {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }],
  };
}

function tableDoc(rows = 2, cols = 2) {
  return {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: Array.from({ length: rows }, (_, rowIndex) => ({
          type: 'tableRow',
          content: Array.from({ length: cols }, (_, colIndex) => ({
            type: 'tableCell',
            attrs: { colspan: 1, rowspan: 1, colwidth: [120] },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}` }] }],
          })),
        })),
      },
    ],
  };
}

async function getInternalJson(page) {
  return page.evaluate(() => window.activeInternalEditor.getJSON());
}

function firstTable(json) {
  return json.content.find((node) => node.type === 'table');
}

async function tableShape(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('.tab-content-wrapper tr')];
    return {
      rowCount: rows.length,
      firstRowColumns: rows[0]?.querySelectorAll('td,th').length || 0,
      cellCount: document.querySelectorAll('.tab-content-wrapper td,.tab-content-wrapper th').length,
      text: document.querySelector('.tab-content-wrapper')?.textContent || '',
    };
  });
}

async function clickToolbarButton(page, title, index = 0) {
  await page.locator(`button[title="${title}"]`).nth(index).click();
}

async function selectFirstRowCells(page, startCol, endCol) {
  await page.evaluate(async ({ startCol, endCol }) => {
    const { CellSelection, TableMap } = await import('/node_modules/@tiptap/pm/dist/tables/index.js');
    const editor = window.activeInternalEditor;
    const table = editor.state.doc.firstChild;
    const map = TableMap.get(table);
    const tableStart = 1;
    const anchor = tableStart + map.map[startCol];
    const head = tableStart + map.map[endCol];
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, anchor, head)));
    editor.view.focus();
  }, { startCol, endCol });
}

try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });

  await page.route('**/api/org-plan', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'listTabs') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            tabs: [
              {
                assignmentId: 'org-assignment-1',
                employeeId: 'employee-1',
                title: '总经理 张三',
                canEdit: true,
                lockedBy: null,
                lockedByName: null,
              },
            ],
          },
        }),
      });
      return;
    }
    if (body.action === 'getTabContent') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '张三内容' }] }] },
          },
        }),
      });
      return;
    }
    if (body.action === 'saveTabContent') {
      orgPlanSaveCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.addInitScript(() => localStorage.setItem('notesapp_token', 'fixture-token'));
  await page.goto('http://127.0.0.1:5197/tests/tab-group-browser-fixture.html?org=1&outerReadOnly=1&delayedPerm=1&fullToolbar=1');
  await page.waitForFunction(() => window.tabGroupEditor);
  await page.waitForSelector('.tab-group-container');
  await page.waitForSelector('text=张三内容');
  await page.locator('.tab-content-wrapper .ProseMirror').click();
  await page.waitForFunction(() => window.activeInternalEditor?.isEditable === true);

  await page.evaluate(() => {
    window.activeInternalEditor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A1' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B1' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C1' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A2' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B2' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C2' }] }] },
              ],
            },
          ],
        },
      ],
    }, { emitUpdate: false });
  });
  await page.waitForFunction(() => document.querySelectorAll('.tab-content-wrapper td').length === 6);

  await page.locator('.tab-content-wrapper td').nth(1).click();
  await page.waitForFunction(() => window.activeInternalEditor?.isActive?.('table') === true);

  const before = await page.evaluate(() => {
    const table = window.activeInternalEditor.getJSON().content.find((node) => node.type === 'table');
    return {
      cellCount: document.querySelectorAll('.tab-content-wrapper td').length,
      firstRowColumns: table.content[0].content.length,
    };
  });
  assert.equal(before.firstRowColumns, 3, `fixture should start with 3 columns, got ${JSON.stringify(before)}`);

  await page.locator('button[title="删除"]').click();
  await page.getByRole('button', { name: '删除列' }).click();
  await page.waitForTimeout(1200);

  const after = await page.evaluate(() => {
    const firstRow = document.querySelector('.tab-content-wrapper tr');
    return {
      cellCount: document.querySelectorAll('.tab-content-wrapper td').length,
      firstRowColumns: firstRow?.querySelectorAll('td').length || 0,
      text: document.querySelector('.tab-content-wrapper')?.textContent || '',
    };
  });
  assert.equal(after.firstRowColumns, 2, `toolbar delete-column should remove the selected column, before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  assert.equal(after.cellCount, 4, `toolbar delete-column should remove one cell per row, got ${JSON.stringify(after)}`);
  assert.doesNotMatch(after.text, /B1|B2/, `toolbar delete-column should remove the selected middle column content, got ${JSON.stringify(after)}`);
  assert.ok(orgPlanSaveCalls >= 1, 'toolbar table command should trigger org plan tab autosave');

  await setInternalContent(page, paragraphDoc(''));
  await page.locator('.tab-content-wrapper .ProseMirror').click();
  await clickToolbarButton(page, '粗体 (Ctrl+B)');
  await page.keyboard.type('B');
  await clickToolbarButton(page, '粗体 (Ctrl+B)');
  await clickToolbarButton(page, '斜体 (Ctrl+I)');
  await page.keyboard.type('I');
  await clickToolbarButton(page, '斜体 (Ctrl+I)');
  await clickToolbarButton(page, '删除线 (Ctrl+Shift+X)');
  await page.keyboard.type('S');
  await clickToolbarButton(page, '删除线 (Ctrl+Shift+X)');
  const formatJson = await getInternalJson(page);
  const marksByText = Object.fromEntries(formatJson.content[0].content.map((node) => [node.text, (node.marks || []).map((mark) => mark.type)]));
  assert.ok(marksByText.B?.includes('bold'), `bold toolbar should mark typed text, got ${JSON.stringify(formatJson)}`);
  assert.ok(marksByText.I?.includes('italic'), `italic toolbar should mark typed text, got ${JSON.stringify(formatJson)}`);
  assert.ok(marksByText.S?.includes('strike'), `strike toolbar should mark typed text, got ${JSON.stringify(formatJson)}`);

  await setInternalContent(page, paragraphDoc('标题测试'));
  await page.evaluate(() => window.activeInternalEditor.commands.setTextSelection(1));
  await clickToolbarButton(page, '标题1 (Ctrl+Alt+1)');
  const headingJson = await getInternalJson(page);
  assert.equal(headingJson.content[0].type, 'heading', `H1 toolbar should convert paragraph to heading, got ${JSON.stringify(headingJson)}`);
  assert.equal(headingJson.content[0].attrs.level, 1, `H1 toolbar should set level=1, got ${JSON.stringify(headingJson)}`);

  await setInternalContent(page, paragraphDoc('字号颜色'));
  await page.evaluate(() => window.activeInternalEditor.commands.setTextSelection({ from: 1, to: 5 }));
  await clickToolbarButton(page, '字号');
  await page.getByRole('button', { name: '24' }).click();
  let styleJson = await getInternalJson(page);
  assert.equal(styleJson.content[0].content[0].marks?.find((mark) => mark.type === 'textStyle')?.attrs?.fontSize, '24px', `font-size dropdown should apply inside tab editor, got ${JSON.stringify(styleJson)}`);
  await page.evaluate(() => window.activeInternalEditor.commands.setTextSelection({ from: 1, to: 5 }));
  await clickToolbarButton(page, '文字颜色');
  await page.locator('button[style*="rgb(220, 38, 38)"], button[style*="#dc2626"]').first().click();
  styleJson = await getInternalJson(page);
  assert.equal(styleJson.content[0].content[0].marks?.find((mark) => mark.type === 'textStyle')?.attrs?.color, '#dc2626', `text-color dropdown should apply inside tab editor, got ${JSON.stringify(styleJson)}`);

  await setInternalContent(page, paragraphDoc('列表测试'));
  await page.evaluate(() => window.activeInternalEditor.commands.setTextSelection(1));
  await clickToolbarButton(page, '无序列表 (Ctrl+.) | Tab缩进');
  assert.equal((await getInternalJson(page)).content[0].type, 'bulletList', 'bullet list toolbar should wrap paragraph inside tab editor');
  await setInternalContent(page, paragraphDoc('列表测试'));
  await page.evaluate(() => window.activeInternalEditor.commands.setTextSelection(1));
  await clickToolbarButton(page, '有序列表');
  assert.equal((await getInternalJson(page)).content[0].type, 'orderedList', 'ordered list toolbar should wrap paragraph inside tab editor');
  await setInternalContent(page, paragraphDoc('列表测试'));
  await page.evaluate(() => window.activeInternalEditor.commands.setTextSelection(1));
  await clickToolbarButton(page, '待办列表 (Ctrl+1) | Tab缩进');
  assert.equal((await getInternalJson(page)).content[0].type, 'taskList', 'task list toolbar should wrap paragraph inside tab editor');

  await setInternalContent(page, tableDoc(2, 2));
  await page.waitForFunction(() => document.querySelectorAll('.tab-content-wrapper td').length === 4);
  await page.locator('.tab-content-wrapper td').first().click();
  await clickToolbarButton(page, '插入', 1);
  await page.getByRole('button', { name: '右侧插入列' }).click();
  let shape = await tableShape(page);
  assert.equal(shape.firstRowColumns, 3, `toolbar add-column-after should add a column, got ${JSON.stringify(shape)}`);
  await page.locator('.tab-content-wrapper td').first().click();
  await clickToolbarButton(page, '插入', 1);
  await page.getByRole('button', { name: '下方插入行' }).click();
  shape = await tableShape(page);
  assert.equal(shape.rowCount, 3, `toolbar add-row-after should add a row, got ${JSON.stringify(shape)}`);
  await page.locator('.tab-content-wrapper td').first().click();
  await clickToolbarButton(page, '删除');
  await page.getByRole('button', { name: '删除行' }).click();
  shape = await tableShape(page);
  assert.equal(shape.rowCount, 2, `toolbar delete-row should remove selected row, got ${JSON.stringify(shape)}`);

  await setInternalContent(page, tableDoc(2, 2));
  await page.waitForFunction(() => document.querySelectorAll('.tab-content-wrapper td').length === 4);
  await selectFirstRowCells(page, 0, 1);
  await clickToolbarButton(page, '单元格操作');
  await page.getByRole('button', { name: '合并' }).click();
  let tableJson = firstTable(await getInternalJson(page));
  assert.equal(tableJson.content[0].content[0].attrs.colspan, 2, `toolbar merge-cells should merge selected cells, got ${JSON.stringify(tableJson)}`);
  await page.locator('.tab-content-wrapper td').first().click();
  await clickToolbarButton(page, '单元格操作');
  await page.getByRole('button', { name: '拆分' }).click();
  tableJson = firstTable(await getInternalJson(page));
  assert.equal(tableJson.content[0].content.length, 2, `toolbar split-cell should split merged cell, got ${JSON.stringify(tableJson)}`);

  await page.locator('.tab-content-wrapper td').first().click();
  await clickToolbarButton(page, '单元格底色');
  await page.locator('.grid button').first().click();
  tableJson = firstTable(await getInternalJson(page));
  assert.equal(tableJson.content[0].content[0].attrs.backgroundColor, '#fef3c7', `cell background color should apply to tab editor cell, got ${JSON.stringify(tableJson.content[0].content[0].attrs)}`);
  await page.locator('.tab-content-wrapper td').first().click();
  await clickToolbarButton(page, '单元格垂直对齐');
  await page.getByRole('button', { name: '垂直居中' }).click();
  tableJson = firstTable(await getInternalJson(page));
  assert.equal(tableJson.content[0].content[0].attrs.verticalAlign, 'center', `cell vertical-align should apply to tab editor cell, got ${JSON.stringify(tableJson.content[0].content[0].attrs)}`);

  console.log('tab toolbar table commands browser test passed');
} finally {
  if (browser) await browser.close();
  await server.close();
}
