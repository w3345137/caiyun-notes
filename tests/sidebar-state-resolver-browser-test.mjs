import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({
  server: { host: '127.0.0.1', port: 5191 },
  logLevel: 'error',
});

await server.listen();

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5191/tests/tab-group-browser-fixture.html');

  const result = await page.evaluate(async () => {
    const { resolveSidebarStateForNotes } = await import('/src/lib/sidebarStateResolver.ts');
    const previousNotes = [
      { id: 'jiangsu-company', title: '江苏公司', type: 'notebook' },
      {
        id: 'old-suzhou-section',
        title: '项目-苏州（2）',
        type: 'section',
        parent_id: 'jiangsu-company',
        root_notebook_id: 'jiangsu-company',
      },
      {
        id: 'old-suzhou-page',
        title: '数据要素产业园',
        type: 'page',
        parent_id: 'old-suzhou-section',
        root_notebook_id: 'jiangsu-company',
      },
      {
        id: 'deleted-page',
        title: '已删除页面',
        type: 'page',
        parent_id: 'old-suzhou-section',
        root_notebook_id: 'jiangsu-company',
      },
    ];
    const nextNotes = [
      { id: 'jiangsu-company', title: '江苏公司', type: 'notebook' },
      {
        id: 'new-suzhou-section',
        title: '项目-苏州（3）',
        type: 'section',
        parent_id: 'jiangsu-company',
        root_notebook_id: 'jiangsu-company',
      },
      {
        id: 'new-suzhou-page',
        title: '数据要素产业园',
        type: 'page',
        parent_id: 'new-suzhou-section',
        root_notebook_id: 'jiangsu-company',
      },
    ];

    return resolveSidebarStateForNotes(nextNotes, previousNotes, {
      selectedNoteId: 'old-suzhou-page',
      expandedNodes: ['jiangsu-company', 'old-suzhou-section', 'deleted-page'],
    });
  });

  assert.equal(result.selectedNoteId, 'new-suzhou-page', 'stale Jiangsu selected page id should map to the regenerated equivalent page');
  assert.deepEqual(
    result.expandedNodes,
    ['jiangsu-company', 'new-suzhou-section'],
    `stale Jiangsu expanded section id should map and deleted ids should drop, got ${JSON.stringify(result)}`
  );

  console.log('sidebar state resolver browser test passed');
} finally {
  if (browser) await browser.close();
  await server.close();
}
