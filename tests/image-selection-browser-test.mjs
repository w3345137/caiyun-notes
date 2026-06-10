import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({
  server: { host: '127.0.0.1', port: 5190 },
  logLevel: 'error',
});

await server.listen();

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });

  await page.goto('http://127.0.0.1:5190/tests/image-selection-browser-fixture.html');
  await page.waitForFunction(() => window.editor && document.querySelector('.resizable-image-wrapper img'));

  const controlsCount = () => page.locator('button[title="删除图片"]').count();
  assert.equal(await controlsCount(), 0, 'image resize controls should be hidden before the image is selected');

  await page.locator('.resizable-image-wrapper img').click();
  await page.waitForTimeout(150);
  assert.equal(await controlsCount(), 1, 'image resize controls should appear when the image is selected');

  await page.locator('#outside-editor').click();
  await page.waitForTimeout(150);
  assert.equal(await controlsCount(), 0, 'image resize controls should hide when focus moves outside the editor');

  await page.locator('.resizable-image-wrapper img').click();
  await page.waitForTimeout(150);
  assert.equal(await controlsCount(), 1, 'image resize controls should appear again when the image is reselected');

  await page.getByText('after image').click();
  await page.waitForTimeout(150);
  assert.equal(await controlsCount(), 0, 'image resize controls should hide after selecting regular text');

  console.log('image selection browser test passed');
} finally {
  if (browser) await browser.close();
  await server.close();
}
