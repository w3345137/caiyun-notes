import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({
  server: { host: '127.0.0.1', port: 5189 },
  logLevel: 'error',
});

await server.listen();

function getTextFromDoc(doc) {
  const chunks = [];
  function walk(node) {
    if (!node) return;
    if (node.text) chunks.push(node.text);
    for (const child of node.content || []) walk(child);
  }
  walk(doc);
  return chunks.join('');
}

function hasMarkedText(doc, text, markType) {
  let found = false;
  function walk(node) {
    if (!node || found) return;
    if (node.text === text && (node.marks || []).some((mark) => mark.type === markType)) {
      found = true;
      return;
    }
    for (const child of node.content || []) walk(child);
  }
  walk(doc);
  return found;
}

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  await page.goto('http://127.0.0.1:5189/tests/tab-group-browser-fixture.html');
  await page.waitForFunction(() => window.tabGroupEditor);

  await page.locator('#insert-tab-group').click();
  await page.waitForSelector('.tab-group-container');

  const tabContent = page.locator('.tab-content-wrapper .ProseMirror');
  await tabContent.click();
  await page.locator('#toolbar-bold').click();
  await page.keyboard.type('Bolded ');
  await page.locator('#toolbar-bold').click();
  await page.keyboard.type('Alpha content');

  const toolbarTarget = await page.evaluate(() => window.lastToolbarTarget);
  assert.equal(toolbarTarget, 'internal', 'toolbar commands should route to the active tab editor');

  await page.locator('.tab-group-container button[title="添加页签"]').click();
  await tabContent.click();
  await page.keyboard.type('Beta content');

  await page.locator('.tab-group-container button', { hasText: '页签1' }).click();
  await page.waitForTimeout(100);

  const firstTabVisibleText = await tabContent.innerText();
  assert.match(
    firstTabVisibleText,
    /Alpha content/,
    `first tab should keep text typed immediately before adding a tab, got: ${firstTabVisibleText}`
  );

  const snapshot = await page.evaluate(() => window.getTabGroupSnapshot?.());
  assert.equal(snapshot.tabGroups.length, 1, 'should keep one top-level tab group');
  const firstGroup = snapshot.tabGroups[0];
  assert.equal(firstGroup.attrs.tabs.length, 2, 'should add a second sibling tab');

  const firstTabId = firstGroup.attrs.tabs[0].id;
  const secondTabId = firstGroup.attrs.tabs[1].id;
  assert.ok(
    hasMarkedText(firstGroup.attrs.contents[firstTabId], 'Bolded ', 'bold'),
    'toolbar bold should apply inside the active tab content'
  );
  assert.match(getTextFromDoc(firstGroup.attrs.contents[firstTabId]), /Alpha content/);
  assert.match(getTextFromDoc(firstGroup.attrs.contents[secondTabId]), /Beta content/);

  await page.locator('.tab-group-container button', { hasText: '页签2' }).click();
  await page.locator('.tab-group-container .relative').nth(1).locator('button').nth(1).click();
  await page.locator('button', { hasText: '重命名' }).click();
  await page.locator('.tab-group-container input').fill('第二页');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);

  const renamedSnapshot = await page.evaluate(() => window.getTabGroupSnapshot?.());
  assert.equal(renamedSnapshot.tabGroups[0].attrs.tabs[1].title, '第二页', 'tab title should rename with Enter');

  await page.locator('.tab-group-container .relative').nth(1).locator('button').nth(1).click();
  await page.locator('button', { hasText: '删除页签' }).click();
  await page.waitForTimeout(100);

  const deletedSnapshot = await page.evaluate(() => window.getTabGroupSnapshot?.());
  assert.equal(deletedSnapshot.tabGroups[0].attrs.tabs.length, 1, 'should delete selected tab');
  assert.equal(deletedSnapshot.tabGroups[0].attrs.tabs[0].title, '页签1', 'remaining tab title should stay intact');
  assert.match(
    getTextFromDoc(deletedSnapshot.tabGroups[0].attrs.contents[deletedSnapshot.tabGroups[0].attrs.tabs[0].id]),
    /Alpha content/
  );

  await page.goto('http://127.0.0.1:5189/tests/tab-group-browser-fixture.html?collab=1');
  await page.waitForFunction(() => window.tabGroupEditor);
  await page.locator('#insert-tab-group').click();
  await page.waitForSelector('.tab-group-container');
  const latestTabContent = page.locator('.tab-group-container').nth(0).locator('.tab-content-wrapper .ProseMirror');
  await latestTabContent.click();
  await page.waitForFunction(() => window.activeInternalEditor);
  await page.evaluate(() => {
    window.activeInternalEditor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run();
  });
  await page.waitForFunction(() => document.querySelectorAll('.tab-group-container')[0]?.querySelectorAll('td').length === 4);
  const firstCellBox = await page.locator('.tab-group-container').nth(0).locator('td').first().boundingBox();
  assert.ok(firstCellBox, 'tab table first cell should have a browser bounding box');
  await page.mouse.move(firstCellBox.x + firstCellBox.width - 2, firstCellBox.y + firstCellBox.height / 2);
  await page.waitForTimeout(100);

  const resizeBefore = await page.evaluate(() => {
    const group = document.querySelectorAll('.tab-group-container')[0];
    const firstCell = group?.querySelector('td');
    return {
      handleCount: group?.querySelectorAll('.column-resize-handle').length || 0,
      firstCellWidth: firstCell?.getBoundingClientRect().width || 0,
    };
  });
  assert.ok(
    resizeBefore.handleCount > 0,
    `tab table should expose column resize handles, got ${JSON.stringify(resizeBefore)}`
  );
  const resizeHandle = page.locator('.tab-group-container .column-resize-handle').first();
  const resizeHandleBox = await resizeHandle.boundingBox();
  assert.ok(resizeHandleBox, 'tab table resize handle should have a browser bounding box');
  await page.mouse.move(resizeHandleBox.x + resizeHandleBox.width / 2, resizeHandleBox.y + resizeHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeHandleBox.x + 70, resizeHandleBox.y + resizeHandleBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const resizeAfter = await page.evaluate(() => {
    const group = document.querySelectorAll('.tab-group-container')[0];
    const firstCell = group?.querySelector('td');
    const table = window.activeInternalEditor?.getJSON?.().content?.find?.((node) => node.type === 'table');
    const firstCellAttrs = table?.content?.[0]?.content?.[0]?.attrs || {};
    return {
      firstCellWidth: firstCell?.getBoundingClientRect().width || 0,
      firstCellAttrs,
    };
  });
  assert.ok(
    resizeAfter.firstCellWidth > resizeBefore.firstCellWidth + 30,
    `tab table first column width should grow after dragging resize handle, before=${JSON.stringify(resizeBefore)} after=${JSON.stringify(resizeAfter)}`
  );
  assert.ok(
    Array.isArray(resizeAfter.firstCellAttrs.colwidth) && resizeAfter.firstCellAttrs.colwidth[0] > 0,
    `tab table resize should persist colwidth attrs in editor JSON, got ${JSON.stringify(resizeAfter)}`
  );

	  const targetCell = page.locator('.tab-group-container').nth(0).locator('td').nth(2);
  await targetCell.click();
  await page.keyboard.type('ABC');
  await page.waitForTimeout(1300);
  await page.keyboard.type('DEF');
  await page.waitForTimeout(150);

  const tableInputResult = await page.evaluate(() => {
    const group = document.querySelectorAll('.tab-group-container')[0];
    const cells = [...group.querySelectorAll('td')].map((cell) => cell.textContent);
    const selection = window.getSelection();
    const anchorElement = selection?.anchorNode?.nodeType === Node.TEXT_NODE
      ? selection.anchorNode.parentElement
      : selection?.anchorNode;
    const anchorCell = anchorElement?.closest?.('td') || null;
    const allCells = [...group.querySelectorAll('td')];
    return {
      cells,
      anchorCellIndex: anchorCell ? allCells.indexOf(anchorCell) : -1,
    };
  });

  assert.equal(
    tableInputResult.cells[2],
    'ABCDEF',
    `tab table typing should stay in the selected cell after debounced parent attrs save, got ${JSON.stringify(tableInputResult)}`
  );
  assert.equal(
    tableInputResult.anchorCellIndex,
    2,
    `tab table cursor should remain in the edited cell after debounced parent attrs save, got ${JSON.stringify(tableInputResult)}`
  );

  const richBlockResult = await page.evaluate(() => {
    const editor = window.activeInternalEditor;
    const commandTypes = {
      insertMindmap: typeof editor?.commands?.insertMindmap,
      insertRouteBlock: typeof editor?.commands?.insertRouteBlock,
      insertFolderBlock: typeof editor?.commands?.insertFolderBlock,
      insertAudioBlock: typeof editor?.commands?.insertAudioBlock,
    };

    const insertAndReadTypes = (insert) => {
      editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] }, { emitUpdate: false });
      insert();
      return editor.getJSON().content?.map((node) => node.type) || [];
    };

    return {
      commandTypes,
      insertedTypes: {
        mindmap: insertAndReadTypes(() => editor.chain().focus().insertMindmap().run()),
        routeBlock: insertAndReadTypes(() => editor.chain().focus().insertRouteBlock().run()),
        folderBlock: insertAndReadTypes(() => editor.chain().focus().insertFolderBlock({ noteId: 'tab-fixture-note', folderName: '附件文件夹', storageProvider: 'onedrive' }).run()),
        audioBlock: insertAndReadTypes(() => editor.chain().focus().insertAudioBlock({ noteId: 'tab-fixture-note', uploadEnabled: true, transcriptionEnabled: false, storageProvider: 'onedrive' }).run()),
      },
    };
  });

  assert.equal(richBlockResult.commandTypes.insertMindmap, 'function', 'tab internal editor should support inserting mind maps');
  assert.equal(richBlockResult.commandTypes.insertRouteBlock, 'function', 'tab internal editor should support inserting route blocks');
  assert.equal(richBlockResult.commandTypes.insertFolderBlock, 'function', 'tab internal editor should support inserting folder blocks');
  assert.equal(richBlockResult.commandTypes.insertAudioBlock, 'function', 'tab internal editor should support inserting audio blocks');
  assert.ok(richBlockResult.insertedTypes.mindmap.includes('mindmap'), `tab content should include inserted mindmap: ${JSON.stringify(richBlockResult)}`);
  assert.ok(richBlockResult.insertedTypes.routeBlock.includes('routeBlock'), `tab content should include inserted route block: ${JSON.stringify(richBlockResult)}`);
  assert.ok(richBlockResult.insertedTypes.folderBlock.includes('folderBlock'), `tab content should include inserted folder block: ${JSON.stringify(richBlockResult)}`);
  assert.ok(richBlockResult.insertedTypes.audioBlock.includes('audioBlock'), `tab content should include inserted audio block: ${JSON.stringify(richBlockResult)}`);

  await page.goto('http://127.0.0.1:5189/tests/tab-group-browser-fixture.html?locked=1');
  await page.waitForFunction(() => window.tabGroupEditor);
  await page.waitForSelector('.tab-group-container');
  assert.equal(
    await page.locator('.tab-group-container button[title="添加页签"]').count(),
    0,
    'structure-locked native tab group should not expose add-tab button'
  );
  assert.equal(
    await page.locator('.tab-group-container svg path[d="M7 10l5 5 5-5z"]').count(),
    0,
    'structure-locked native tab group should not expose rename/delete menu buttons'
  );

  await page.locator('.tab-group-container button', { hasText: '副经理 李四' }).click();
  await page.waitForTimeout(100);
  const lockedTabVisibleText = await page.locator('.tab-content-wrapper .ProseMirror').innerText();
  assert.match(
    lockedTabVisibleText,
    /李四内容/,
    `structure-locked native tab group should still switch tabs, got: ${lockedTabVisibleText}`
  );

  const lockedSnapshot = await page.evaluate(() => window.getTabGroupSnapshot?.());
  const lockedGroup = lockedSnapshot.tabGroups[0];
  assert.equal(lockedGroup.attrs.structureLocked, true, 'locked fixture should preserve structureLocked attr');
  assert.deepEqual(
    lockedGroup.attrs.tabs.map((tab) => tab.title),
    ['总经理 张三', '副经理 李四'],
    'structure-locked native tab group should keep server-controlled tab titles'
  );

  await page.evaluate(() => {
    const editor = window.tabGroupEditor;
    const firstTabGroup = window.getTabGroupSnapshot?.().tabGroups?.[0];
    const pos = 1;
    editor?.commands.setNodeSelection(pos);
    return firstTabGroup;
  });
  await page.waitForTimeout(100);
  const lockedClassName = await page.locator('.tab-group-container').evaluate((el) => el.className);
  assert.doesNotMatch(
    lockedClassName,
    /ring-2|ring-blue-500/,
    `tab group node selection should not paint the whole tab block blue, got classes: ${lockedClassName}`
  );

  await page.goto('http://127.0.0.1:5189/tests/tab-group-browser-fixture.html?many=1');
  await page.waitForFunction(() => window.tabGroupEditor);
  await page.waitForSelector('.tab-group-container');
  const tabBarMetrics = await page.evaluate(() => {
    const scrollArea = document.querySelector('.tab-group-tab-scroll');
    const lockArea = document.querySelector('.tab-group-actions');
    return {
      exists: !!scrollArea,
      clientWidth: scrollArea?.clientWidth || 0,
      scrollWidth: scrollArea?.scrollWidth || 0,
      overflowX: scrollArea ? getComputedStyle(scrollArea).overflowX : '',
      lockAreaPosition: lockArea ? getComputedStyle(lockArea).position : '',
    };
  });
  assert.equal(tabBarMetrics.exists, true, `many-tab title area should expose a dedicated scroll area: ${JSON.stringify(tabBarMetrics)}`);
  assert.equal(tabBarMetrics.overflowX, 'auto', `many-tab title area should scroll horizontally: ${JSON.stringify(tabBarMetrics)}`);
  assert.ok(
    tabBarMetrics.scrollWidth > tabBarMetrics.clientWidth,
    `many-tab title area should have hidden overflow available through horizontal scroll: ${JSON.stringify(tabBarMetrics)}`
  );
  assert.equal(tabBarMetrics.lockAreaPosition, 'sticky', `tab lock/actions area should stay visible while titles scroll: ${JSON.stringify(tabBarMetrics)}`);

  const tabBarHeightBefore = await page.evaluate(() => {
    const scrollArea = document.querySelector('.tab-group-tab-scroll');
    const header = scrollArea?.parentElement;
    const actionArea = document.querySelector('.tab-group-actions');
    return {
      header: header?.getBoundingClientRect().height || 0,
      scroll: scrollArea?.getBoundingClientRect().height || 0,
      actions: actionArea?.getBoundingClientRect().height || 0,
    };
  });
  assert.ok(
    tabBarHeightBefore.header >= 38,
    `tab title bar should use the taller stable height, got: ${JSON.stringify(tabBarHeightBefore)}`
  );
  await page.locator('.tab-group-tab-scroll button').nth(1).click();
  await page.waitForTimeout(100);
  const tabBarHeightAfter = await page.evaluate(() => {
    const scrollArea = document.querySelector('.tab-group-tab-scroll');
    const header = scrollArea?.parentElement;
    const actionArea = document.querySelector('.tab-group-actions');
    return {
      header: header?.getBoundingClientRect().height || 0,
      scroll: scrollArea?.getBoundingClientRect().height || 0,
      actions: actionArea?.getBoundingClientRect().height || 0,
    };
  });
  assert.deepEqual(
    tabBarHeightAfter,
    tabBarHeightBefore,
    `tab title bar height should not change after clicking a tab: before=${JSON.stringify(tabBarHeightBefore)} after=${JSON.stringify(tabBarHeightAfter)}`
  );

  let orgPlanSaveCalls = 0;
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
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.evaluate(() => localStorage.setItem('notesapp_token', 'fixture-token'));
  await page.goto('http://127.0.0.1:5189/tests/tab-group-browser-fixture.html?org=1');
  await page.waitForFunction(() => window.tabGroupEditor);
  await page.waitForSelector('.tab-group-container');
  await page.waitForSelector('text=张三内容');
  await page.locator('.tab-content-wrapper .ProseMirror').click();
  await page.waitForFunction(() => window.activeInternalEditor?.getJSON?.().content?.some?.((node) => JSON.stringify(node).includes('张三内容')));
  await page.evaluate(() => {
    window.activeInternalEditor.chain().focus().insertContent(' 新增计划').run();
  });
  await page.waitForTimeout(1250);
  assert.ok(orgPlanSaveCalls >= 1, 'org plan tab typing should still trigger autosave');
  assert.equal(
    await page.getByText('正在保存页签...').count(),
    0,
    'org plan tab autosave should be silent and must not insert a flashing saving row'
  );

  orgPlanSaveCalls = 0;
  await page.goto('http://127.0.0.1:5189/tests/tab-group-browser-fixture.html?org=1&outerReadOnly=1&delayedPerm=1');
  await page.waitForFunction(() => window.tabGroupEditor);
  await page.waitForSelector('.tab-group-container');
  await page.waitForSelector('text=张三内容');
  await page.locator('.tab-content-wrapper .ProseMirror').click();
  await page.waitForFunction(() => window.activeInternalEditor?.getJSON?.().content?.some?.((node) => JSON.stringify(node).includes('张三内容')));
  const orgEditorEditable = await page.evaluate(() => window.activeInternalEditor?.isEditable);
  assert.equal(
    orgEditorEditable,
    true,
    'org plan own tab should stay editable even when the outer page editor is read-only'
  );
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
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'D' }] }] },
              ],
            },
          ],
        },
      ],
    }, { emitUpdate: false });
  });
  await page.waitForFunction(() => document.querySelectorAll('.tab-group-container')[0]?.querySelectorAll('td').length === 4);
  const orgFirstCellBox = await page.locator('.tab-group-container').nth(0).locator('td').first().boundingBox();
  assert.ok(orgFirstCellBox, 'org plan tab table first cell should have a browser bounding box');
  await page.mouse.move(orgFirstCellBox.x + orgFirstCellBox.width - 2, orgFirstCellBox.y + orgFirstCellBox.height / 2);
  await page.waitForTimeout(100);
  const orgResizeHandle = page.locator('.tab-group-container .column-resize-handle').first();
  const orgResizeHandleBox = await orgResizeHandle.boundingBox();
  assert.ok(orgResizeHandleBox, 'org plan tab table resize handle should have a browser bounding box');
  const orgWidthBefore = orgFirstCellBox.width;
  await page.mouse.move(orgResizeHandleBox.x + orgResizeHandleBox.width / 2, orgResizeHandleBox.y + orgResizeHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(orgResizeHandleBox.x + 70, orgResizeHandleBox.y + orgResizeHandleBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1250);
  const orgResizeAfter = await page.evaluate(() => {
    const group = document.querySelectorAll('.tab-group-container')[0];
    const firstCell = group?.querySelector('td');
    const table = window.activeInternalEditor?.getJSON?.().content?.find?.((node) => node.type === 'table');
    const firstCellAttrs = table?.content?.[0]?.content?.[0]?.attrs || {};
    return {
      firstCellWidth: firstCell?.getBoundingClientRect().width || 0,
      firstCellAttrs,
    };
  });
  assert.ok(
    orgResizeAfter.firstCellWidth > orgWidthBefore + 30,
    `org plan tab table first column width should grow after dragging resize handle, before=${orgWidthBefore} after=${JSON.stringify(orgResizeAfter)}`
  );
  assert.ok(
    Array.isArray(orgResizeAfter.firstCellAttrs.colwidth) && orgResizeAfter.firstCellAttrs.colwidth[0] > 0,
    `org plan tab table resize should persist colwidth attrs in editor JSON, got ${JSON.stringify(orgResizeAfter)}`
  );
  assert.ok(orgPlanSaveCalls >= 1, 'org plan table column resize should trigger tab autosave');

  console.log('tab group browser test passed');
} finally {
  if (browser) await browser.close();
  await server.close();
}
