import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({
  server: { host: '127.0.0.1', port: 5188 },
  logLevel: 'error',
});

await server.listen();

async function verifyTableSelectionAndTyping(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.editor && document.querySelectorAll('td').length === 9);

  const firstCell = await page.locator('td').nth(0).boundingBox();
  const targetCell = await page.locator('td').nth(4).boundingBox();
  assert.ok(firstCell, 'first table cell should be visible');
  assert.ok(targetCell, 'target table cell should be visible');

  await page.mouse.move(firstCell.x + firstCell.width / 2, firstCell.y + firstCell.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetCell.x + targetCell.width / 2, targetCell.y + targetCell.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const result = await page.evaluate(() => ({
    selectionName: window.editor.state.selection.constructor.name,
    selectedCellCount: document.querySelectorAll('.selectedCell').length,
  }));

  assert.match(result.selectionName, /^CellSelection/);
  assert.ok(result.selectedCellCount >= 2, `expected selected cells, got ${result.selectedCellCount}`);

  await page.locator('td').nth(4).click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.type('XYZ');
  await page.waitForTimeout(150);

  const inputResult = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('td')].map((cell) => cell.textContent);
    const { selection } = window.editor.state;
    const resolved = window.editor.state.doc.resolve(selection.from);
    const tableCellDepth = (() => {
      for (let depth = resolved.depth; depth >= 0; depth -= 1) {
        if (resolved.node(depth).type.name === 'tableCell' || resolved.node(depth).type.name === 'tableHeader') {
          return depth;
        }
      }
      return -1;
    })();
    const tableCellText = tableCellDepth >= 0 ? resolved.node(tableCellDepth).textContent : '';
    return {
      cells,
      selectionFrom: selection.from,
      selectionName: selection.constructor.name,
      selectionParent: resolved.parent.type.name,
      tableCellText,
    };
  });

  assert.equal(inputResult.cells[0], 'A1', 'typing in the middle cell must not prepend text to the first cell');
  assert.equal(inputResult.cells[4], 'B2XYZ', 'typing should append inside the focused table cell');
  assert.equal(inputResult.selectionParent, 'paragraph', `selection should remain inside table cell text, got ${JSON.stringify(inputResult)}`);
  assert.equal(inputResult.tableCellText, 'B2XYZ', `selection should remain in edited cell, got ${JSON.stringify(inputResult)}`);
}

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });

  await verifyTableSelectionAndTyping(page, 'http://127.0.0.1:5188/tests/table-selection-browser-fixture.html');
  await verifyTableSelectionAndTyping(page, 'http://127.0.0.1:5188/tests/table-selection-browser-fixture.html?collab=1');

  console.log('table selection browser test passed');
} finally {
  if (browser) await browser.close();
  await server.close();
}
