import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({
  server: { host: '127.0.0.1', port: 5198 },
  logLevel: 'error',
});

await server.listen();

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });

  await page.goto('http://127.0.0.1:5198/tests/app-update-modal-fixture.html?phase=available');
  await page.getByRole('dialog', { name: '发现新版本' }).waitFor();
  let bodyText = await page.locator('body').innerText();
  assert.match(bodyText, /p7\s*→\s*p8/, 'available state should show the app release upgrade path');
  assert.match(bodyText, /客户端版本 v2\.5\.0\s*→\s*v2\.5\.1/, 'available state should keep semver as secondary detail');
  await assert.rejects(
    page.getByRole('progressbar').waitFor({ timeout: 500 }),
    /Timeout/,
    'available state should not show a progressbar yet',
  );
  await page.getByRole('button', { name: '立即更新' }).click();
  assert.equal(
    await page.evaluate(() => window.updateStartClicks),
    1,
    'clicking update should call the start callback',
  );
  await page.getByRole('button', { name: '稍后' }).click();
  assert.equal(
    await page.evaluate(() => window.updateDismissClicks),
    1,
    'clicking later should call the dismiss callback',
  );

  await page.goto('http://127.0.0.1:5198/tests/app-update-modal-fixture.html?phase=downloading');
  const progress = page.locator('[role="progressbar"]');
  await progress.waitFor({ state: 'attached' });
  assert.equal(await progress.getAttribute('aria-valuenow'), '42');
  bodyText = await page.locator('body').innerText();
  assert.match(bodyText, /p7\s*→\s*p8/, 'downloading state should keep the app release upgrade path visible');
  assert.match(bodyText, /42%/);
  assert.ok(bodyText.includes('420 B / 1000 B'));
  assert.equal(await page.getByRole('button', { name: '立即更新' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '稍后' }).count(), 0);

  await page.goto('http://127.0.0.1:5198/tests/app-update-modal-fixture.html?phase=installing');
  await page.getByRole('dialog', { name: '正在安装' }).waitFor();
  assert.equal(await page.locator('[role="progressbar"]').getAttribute('aria-valuenow'), '100');

  await page.goto('http://127.0.0.1:5198/tests/app-update-modal-fixture.html?phase=error');
  await page.getByRole('dialog', { name: '更新失败' }).waitFor();
  assert.match(await page.locator('body').innerText(), /自动同步未完成/);
  assert.equal(await page.getByRole('button', { name: '立即更新' }).count(), 1);

  console.log('app update modal browser test passed');
} finally {
  if (browser) await browser.close();
  await server.close();
}
