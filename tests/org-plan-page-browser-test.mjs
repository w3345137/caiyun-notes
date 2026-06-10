import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const tableDoc = {
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [120], backgroundColor: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '日期' }] }],
            },
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [260], backgroundColor: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '周重点工作' }] }],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [120], backgroundColor: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '6.1-6.7' }] }],
            },
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: [260], backgroundColor: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '重点事项' }] }],
            },
          ],
        },
      ],
    },
  ],
};

const server = await createServer({
  server: { host: '127.0.0.1', port: 5191 },
  logLevel: 'error',
});

await server.listen();

let browser;
let lastSavedContent = null;
let lockedMode = false;
let saveCalls = 0;

try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
  await page.addInitScript(() => {
    localStorage.setItem('notesapp_token', 'fixture-token');
  });

  await page.route('**/api/org-plan', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'listTabs') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            isOwner: true,
            binding: lockedMode ? { employeeId: 'employee-1' } : null,
            tabs: [
              {
                assignmentId: 'assignment-1',
                employeeId: 'employee-1',
                title: '党总支副书记 王彬',
                employeeName: '王彬',
                departmentName: '领导班子',
                canView: true,
                canEdit: !lockedMode,
                lockedBy: lockedMode ? 'other-user' : null,
                lockedByName: lockedMode ? '其他人' : null,
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
        body: JSON.stringify({ success: true, data: { content: tableDoc } }),
      });
      return;
    }
    if (body.action === 'saveTabContent') {
      saveCalls += 1;
      lastSavedContent = body.content;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.goto('http://127.0.0.1:5191/tests/tab-group-browser-fixture.html?orgPage=1');
  await page.waitForSelector('.org-plan-editor td');

  const firstCellBox = await page.locator('.org-plan-editor td').first().boundingBox();
  assert.ok(firstCellBox, 'org plan page first table cell should have a browser bounding box');

  await page.mouse.move(firstCellBox.x + firstCellBox.width - 2, firstCellBox.y + firstCellBox.height / 2);
  await page.waitForTimeout(150);

  const handleCount = await page.locator('.org-plan-editor .column-resize-handle').count();
  assert.ok(handleCount > 0, `org plan page table should expose column resize handles, got ${handleCount}`);

  const resizeHandle = page.locator('.org-plan-editor .column-resize-handle').first();
  const resizeHandleBox = await resizeHandle.boundingBox();
  assert.ok(resizeHandleBox, 'org plan page resize handle should have a browser bounding box');

  await page.mouse.move(resizeHandleBox.x + resizeHandleBox.width / 2, resizeHandleBox.y + resizeHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeHandleBox.x + 80, resizeHandleBox.y + resizeHandleBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1000);

  const firstCellWidthAfter = await page.locator('.org-plan-editor td').first().evaluate((cell) => cell.getBoundingClientRect().width);
  assert.ok(
    firstCellWidthAfter > firstCellBox.width + 30,
    `org plan page first column width should grow after dragging resize handle, before=${firstCellBox.width}, after=${firstCellWidthAfter}`
  );

  const firstCellAttrs = lastSavedContent?.content?.[0]?.content?.[0]?.content?.[0]?.attrs;
  assert.ok(
    Array.isArray(firstCellAttrs?.colwidth) && firstCellAttrs.colwidth[0] > 120,
    `org plan page resize should autosave updated colwidth attrs, got ${JSON.stringify(firstCellAttrs)}`
  );

  lockedMode = true;
  saveCalls = 0;
  lastSavedContent = null;
  await page.goto('http://127.0.0.1:5191/tests/tab-group-browser-fixture.html?orgPage=1&locked=1');
  await page.waitForSelector('.org-plan-editor td');
  await page.waitForTimeout(300);

  const lockedState = await page.evaluate(() => ({
    contentEditable: document.querySelector('.org-plan-editor .ProseMirror')?.getAttribute('contenteditable'),
    handleCount: document.querySelectorAll('.org-plan-editor .column-resize-handle').length,
  }));
  assert.deepEqual(
    lockedState,
    { contentEditable: 'false', handleCount: 0 },
    `locked org plan page should remain read-only without resize handles, got ${JSON.stringify(lockedState)}`
  );
  assert.equal(saveCalls, 0, 'locked org plan page should not autosave while opening read-only content');

  console.log('org plan page browser test passed');
} finally {
  if (browser) await browser.close();
  await server.close();
}
