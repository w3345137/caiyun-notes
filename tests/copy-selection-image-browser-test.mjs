import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({
  server: { host: '127.0.0.1', port: 5195 },
  logLevel: 'error',
});

await server.listen();

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 720 } });

  await page.goto('http://127.0.0.1:5195/tests/table-selection-browser-fixture.html');
  await page.waitForFunction(() => window.editor && document.querySelectorAll('td').length === 9);

  const result = await page.evaluate(async () => {
    const { CellSelection, TableMap } = await import('/node_modules/prosemirror-tables/dist/index.js');
    const { default: html2canvas } = await import('/node_modules/html2canvas/dist/html2canvas.esm.js');
    const { PROSEMIRROR_CSS } = await import('/src/lib/editorStyles.ts');
    const { buildSelectionCopyContainer, finalizeSelectionCopyContainerSize, getSelectionCopyRenderSize } = await import('/src/lib/copySelectionAsImage.ts');

    const cell = (text) => ({
      type: 'tableCell',
      attrs: { colwidth: [220] },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });

    window.editor.commands.setContent({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          { type: 'tableRow', content: ['A1 long content', 'B1 more words', 'C1 third column', 'D1 fourth column', 'E1 fifth column'].map(cell) },
          { type: 'tableRow', content: ['A2 detail text', 'B2 detail text', 'C2 detail text', 'D2 detail text', 'E2 detail text'].map(cell) },
        ],
      }],
    });

    const table = window.editor.state.doc.firstChild;
    const map = TableMap.get(table);
    const tableStart = 1;
    const anchor = tableStart + map.map[0];
    const head = tableStart + map.map[9];
    window.editor.view.dispatch(
      window.editor.state.tr.setSelection(CellSelection.create(window.editor.state.doc, anchor, head))
    );

    const container = buildSelectionCopyContainer(window.editor, PROSEMIRROR_CSS);
    if (!container) return { missingContainer: true };

    const sourceEditor = document.querySelector('#editor .ProseMirror');
    const sourceWidthBeforeAppend = sourceEditor ? getComputedStyle(sourceEditor).width : null;
    document.body.appendChild(container);
    const sourceWidthAfterAppend = sourceEditor ? getComputedStyle(sourceEditor).width : null;
    finalizeSelectionCopyContainerSize(container);
    const clonedTable = container.querySelector('table');
    const size = getSelectionCopyRenderSize(container);
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      width: size.width,
      height: size.height,
      windowWidth: size.width,
      windowHeight: size.height,
    });
    const metrics = {
      missingContainer: false,
      selectedCellCount: clonedTable?.querySelectorAll('td, th').length || 0,
      tableText: clonedTable?.textContent || '',
      containerOffsetWidth: container.offsetWidth,
      containerScrollWidth: container.scrollWidth,
      tableOffsetWidth: clonedTable?.offsetWidth || 0,
      tableScrollWidth: clonedTable?.scrollWidth || 0,
      renderWidth: size.width,
      canvasWidth: canvas.width,
      maxWidth: getComputedStyle(container).maxWidth,
      sourceWidthBeforeAppend,
      sourceWidthAfterAppend,
    };
    document.body.removeChild(container);
    return metrics;
  });

  assert.equal(result.missingContainer, false, 'copy container should be created for a table cell selection');
  assert.equal(result.selectedCellCount, 10, `wide selected table copy should keep all selected cells: ${JSON.stringify(result)}`);
  assert.match(result.tableText, /E2 detail text/, `wide selected table copy should include rightmost selected content: ${JSON.stringify(result)}`);
  assert.ok(result.tableScrollWidth > 1000, `fixture should be wide enough to catch clipping: ${JSON.stringify(result)}`);
  assert.ok(result.containerOffsetWidth >= result.tableScrollWidth, `copy container must expand to selected table width: ${JSON.stringify(result)}`);
  assert.ok(result.renderWidth >= result.containerScrollWidth, `render size must include full scroll width: ${JSON.stringify(result)}`);
  assert.ok(result.canvasWidth >= result.renderWidth * 2, `html2canvas output must include full render width at scale 2: ${JSON.stringify(result)}`);
  assert.notEqual(result.maxWidth, '800px', `copy container must not use the old 800px cap: ${JSON.stringify(result)}`);
  assert.equal(
    result.sourceWidthAfterAppend,
    result.sourceWidthBeforeAppend,
    `temporary copy styles must not resize the visible editor: ${JSON.stringify(result)}`,
  );

  const formatResult = await page.evaluate(async () => {
    const { CellSelection, TableMap } = await import('/node_modules/prosemirror-tables/dist/index.js');
    const { PROSEMIRROR_CSS } = await import('/src/lib/editorStyles.ts');
    const { buildSelectionCopyContainer, finalizeSelectionCopyContainerSize } = await import('/src/lib/copySelectionAsImage.ts');

    const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const taskList = {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: false }, content: [paragraph('待办事项 A')] },
        { type: 'taskItem', attrs: { checked: true }, content: [paragraph('已完成事项 B')] },
      ],
    };
    const cell = (content, colwidth = 220) => ({
      type: 'tableCell',
      attrs: { colwidth: [colwidth] },
      content,
    });

    window.editor.commands.setContent({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              cell([paragraph('第一行文字'), paragraph('第二行文字')]),
              cell([taskList]),
              cell([paragraph('普通单元格')]),
            ],
          },
        ],
      }],
    });

    const style = document.createElement('style');
    style.textContent = PROSEMIRROR_CSS;
    document.head.appendChild(style);

    const table = window.editor.state.doc.firstChild;
    const map = TableMap.get(table);
    const tableStart = 1;
    window.editor.view.dispatch(
      window.editor.state.tr.setSelection(
        CellSelection.create(window.editor.state.doc, tableStart + map.map[0], tableStart + map.map[2])
      )
    );

    const container = buildSelectionCopyContainer(window.editor, PROSEMIRROR_CSS);
    if (!container) return { missingContainer: true };
    document.body.appendChild(container);
    finalizeSelectionCopyContainerSize(container);

    const originalCell = document.querySelector('.ProseMirror table td');
    const copiedCell = container.querySelector('table td');
    const originalParagraph = originalCell?.querySelector('p');
    const copiedParagraph = copiedCell?.querySelector('p');
    const originalTaskList = document.querySelector('.ProseMirror table td:nth-child(2) ul[data-type="taskList"]');
    const copiedTaskList = container.querySelector('table td:nth-child(2) ul[data-type="taskList"]');
    const originalTaskItem = originalTaskList?.querySelector('li');
    const copiedTaskItem = copiedTaskList?.querySelector('li');
    const originalCheckbox = originalTaskList?.querySelector('input[type="checkbox"]');
    const copiedVisualCheckbox = copiedTaskList?.querySelector('[data-copy-task-checkbox]');
    const copiedCheckedDot = copiedTaskList?.querySelector('[data-copy-task-checkbox-dot]');

    const pick = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        display: style.display,
        alignItems: style.alignItems,
        gap: style.gap,
        lineHeight: style.lineHeight,
        marginTop: style.marginTop,
        marginBottom: style.marginBottom,
        paddingLeft: style.paddingLeft,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    const pickCheckbox = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        borderTopColor: style.borderTopColor,
        borderTopStyle: style.borderTopStyle,
        borderTopWidth: style.borderTopWidth,
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    const result = {
      missingContainer: false,
      originalCell: pick(originalCell),
      copiedCell: pick(copiedCell),
      originalParagraph: pick(originalParagraph),
      copiedParagraph: pick(copiedParagraph),
      originalTaskList: pick(originalTaskList),
      copiedTaskList: pick(copiedTaskList),
      originalTaskItem: pick(originalTaskItem),
      copiedTaskItem: pick(copiedTaskItem),
      originalCheckbox: pickCheckbox(originalCheckbox),
      copiedVisualCheckbox: pickCheckbox(copiedVisualCheckbox),
      copiedCheckedDot: pickCheckbox(copiedCheckedDot),
      nativeCheckboxCount: container.querySelectorAll('input[type="checkbox"]').length,
      visualCheckboxCount: container.querySelectorAll('[data-copy-task-checkbox]').length,
      copiedText: container.textContent || '',
    };

    document.body.removeChild(container);
    style.remove();
    return result;
  });

  assert.equal(formatResult.missingContainer, false, `format copy container should exist: ${JSON.stringify(formatResult)}`);
  assert.deepEqual(formatResult.copiedCell, formatResult.originalCell, `table cell style should match original: ${JSON.stringify(formatResult)}`);
  assert.deepEqual(formatResult.copiedParagraph, formatResult.originalParagraph, `paragraph line-height/margins should match original: ${JSON.stringify(formatResult)}`);
  assert.deepEqual(formatResult.copiedTaskList, formatResult.originalTaskList, `task list layout should match original: ${JSON.stringify(formatResult)}`);
  assert.deepEqual(formatResult.copiedTaskItem, formatResult.originalTaskItem, `task item layout should match original: ${JSON.stringify(formatResult)}`);
  assert.equal(formatResult.nativeCheckboxCount, 0, `copy source must not keep native checkboxes because html2canvas renders them as square controls: ${JSON.stringify(formatResult)}`);
  assert.equal(formatResult.visualCheckboxCount, 2, `copy source should replace task checkboxes with static circular marks: ${JSON.stringify(formatResult)}`);
  assert.deepEqual(formatResult.copiedVisualCheckbox, formatResult.originalCheckbox, `task checkbox visual style should match original: ${JSON.stringify(formatResult)}`);
  const expectedDotSize = Math.round(formatResult.originalCheckbox.width / 2);
  assert.deepEqual(
    formatResult.copiedCheckedDot,
    {
      borderTopColor: 'rgba(0, 0, 0, 0)',
      borderTopStyle: 'none',
      borderTopWidth: '0px',
      borderRadius: '50%',
      backgroundColor: formatResult.originalCheckbox.borderTopColor,
      width: expectedDotSize,
      height: expectedDotSize,
    },
    `checked task dot should render as a centered circular mark: ${JSON.stringify(formatResult)}`,
  );
  assert.match(formatResult.copiedText, /待办事项 A/, `copied image source should include task text: ${JSON.stringify(formatResult)}`);

  const alignmentResult = await page.evaluate(async () => {
    await import('/index.css');
    await import('/src/App.css');
    const { CellSelection, TableMap } = await import('/node_modules/prosemirror-tables/dist/index.js');
    const { default: html2canvas } = await import('/node_modules/html2canvas/dist/html2canvas.esm.js');
    const { PROSEMIRROR_CSS } = await import('/src/lib/editorStyles.ts');
    const { buildSelectionCopyContainer, finalizeSelectionCopyContainerSize, getSelectionCopyRenderSize } = await import('/src/lib/copySelectionAsImage.ts');

    const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const task = (text) => ({ type: 'taskItem', attrs: { checked: false }, content: [paragraph(text)] });
    const taskList = {
      type: 'taskList',
      content: [
        task('干部变革下一步工作研讨-赵晶'),
        task('安全月青年工作开展研讨-赵晶'),
        task('新员工培训策划-建豪'),
      ],
    };
    const cell = (content, colwidth) => ({
      type: 'tableCell',
      attrs: { colwidth: [colwidth] },
      content,
    });

    window.editor.commands.setContent({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [
            cell([paragraph('6.1-6.7')], 90),
            cell([taskList], 360),
            cell([paragraph('【周一】任职资格迭代内部评审')], 300),
          ],
        }],
      }],
    });

    document.querySelectorAll('ul[data-type="taskList"] li').forEach((li) => {
      li.className = 'flex items-start gap-2 py-1';
    });
    document.querySelectorAll('ul[data-type="taskList"]').forEach((ul) => {
      ul.className = 'not-prose pl-0 list-none';
    });

    const table = window.editor.state.doc.firstChild;
    const map = TableMap.get(table);
    const tableStart = 1;
    window.editor.view.dispatch(
      window.editor.state.tr.setSelection(
        CellSelection.create(window.editor.state.doc, tableStart + map.map[0], tableStart + map.map[2])
      )
    );

    const container = buildSelectionCopyContainer(window.editor, PROSEMIRROR_CSS);
    if (!container) return { missingContainer: true };
    document.body.appendChild(container);
    finalizeSelectionCopyContainerSize(container);

    const marker = container.querySelector('[data-copy-task-checkbox]');
    const containerRect = container.getBoundingClientRect();
    const markerRect = marker?.getBoundingClientRect();
    if (!markerRect) return { missingMarker: true };

    const size = getSelectionCopyRenderSize(container);
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      width: size.width,
      height: size.height,
      windowWidth: size.width,
      windowHeight: size.height,
    });

    const context = canvas.getContext('2d');
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const scale = 2;
    const markerX = Math.round((markerRect.left - containerRect.left) * scale);
    const markerY = Math.round((markerRect.top - containerRect.top) * scale);
    const markerRight = Math.round((markerRect.right - containerRect.left) * scale);

    const bbox = (predicate, region) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -1;
      let maxY = -1;
      let count = 0;
      const x0 = Math.max(0, region.x0);
      const y0 = Math.max(0, region.y0);
      const x1 = Math.min(canvas.width, region.x1);
      const y1 = Math.min(canvas.height, region.y1);
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = (y * image.width + x) * 4;
          const r = image.data[index];
          const g = image.data[index + 1];
          const b = image.data[index + 2];
          const a = image.data[index + 3];
          if (predicate(r, g, b, a)) {
            count += 1;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (!count) return null;
      return {
        minX,
        minY,
        maxX,
        maxY,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        count,
      };
    };

    const circle = bbox(
      (r, g, b, a) => a > 220 && r > 80 && r < 170 && g > 80 && g < 170 && b > 80 && b < 180 && Math.abs(r - g) < 30,
      { x0: markerX - 10, y0: markerY - 8, x1: markerX + 50, y1: markerY + 48 }
    );
    const text = bbox(
      (r, g, b, a) => a > 220 && r < 80 && g < 80 && b < 80,
      { x0: markerRight + 4, y0: markerY - 12, x1: markerRight + 460, y1: markerY + 52 }
    );

    document.body.removeChild(container);
    return {
      missingContainer: false,
      circle,
      text,
      dyCenter: circle && text ? circle.cy - text.cy : null,
    };
  });

  assert.equal(alignmentResult.missingContainer, false, `alignment copy container should exist: ${JSON.stringify(alignmentResult)}`);
  assert.ok(alignmentResult.circle, `alignment test should detect copied task circle pixels: ${JSON.stringify(alignmentResult)}`);
  assert.ok(alignmentResult.text, `alignment test should detect task text pixels: ${JSON.stringify(alignmentResult)}`);
  assert.ok(
    Math.abs(alignmentResult.dyCenter) <= 4,
    `copied task circle should be vertically aligned with rendered text center: ${JSON.stringify(alignmentResult)}`,
  );

  const contextualStyleResult = await page.evaluate(async () => {
    const { CellSelection, TableMap } = await import('/node_modules/prosemirror-tables/dist/index.js');
    const { PROSEMIRROR_CSS } = await import('/src/lib/editorStyles.ts');
    const { buildSelectionCopyContainer, finalizeSelectionCopyContainerSize } = await import('/src/lib/copySelectionAsImage.ts');

    const style = document.createElement('style');
    style.textContent = `
      #editor .ProseMirror td.contextual-source-cell {
        background-color: rgb(226, 246, 235) !important;
        color: rgb(17, 24, 39);
        text-align: center;
        padding: 14px 18px !important;
        line-height: 2.1;
        vertical-align: middle;
      }
      #editor .ProseMirror td.contextual-source-cell p {
        font-weight: 500;
        line-height: 2.1;
      }
      #editor .ProseMirror td.contextual-source-cell ul[data-type="taskList"] li {
        gap: 12px;
      }
    `;
    document.head.appendChild(style);

    const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const taskList = {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: false }, content: [paragraph('上下文样式待办')] },
      ],
    };
    const cell = (content, colwidth = 260) => ({
      type: 'tableCell',
      attrs: { colwidth: [colwidth] },
      content,
    });

    window.editor.commands.setContent({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [
            cell([taskList]),
            cell([paragraph('右侧文字')]),
          ],
        }],
      }],
    });

    const sourceCell = document.querySelector('#editor .ProseMirror table td');
    sourceCell?.classList.add('contextual-source-cell');

    const table = window.editor.state.doc.firstChild;
    const map = TableMap.get(table);
    const tableStart = 1;
    window.editor.view.dispatch(
      window.editor.state.tr.setSelection(
        CellSelection.create(window.editor.state.doc, tableStart + map.map[0], tableStart + map.map[1])
      )
    );

    const container = buildSelectionCopyContainer(window.editor, PROSEMIRROR_CSS);
    if (!container) return { missingContainer: true };
    document.body.appendChild(container);
    finalizeSelectionCopyContainerSize(container);

    const copiedCell = container.querySelector('table td.contextual-source-cell');
    const sourceParagraph = sourceCell?.querySelector('p');
    const copiedParagraph = copiedCell?.querySelector('p');
    const sourceTaskItem = sourceCell?.querySelector('ul[data-type="taskList"] li');
    const copiedTaskItem = copiedCell?.querySelector('ul[data-type="taskList"] li');

    const pick = (element) => {
      if (!element) return null;
      const computedStyle = getComputedStyle(element);
      return {
        backgroundColor: computedStyle.backgroundColor,
        color: computedStyle.color,
        textAlign: computedStyle.textAlign,
        paddingTop: computedStyle.paddingTop,
        paddingLeft: computedStyle.paddingLeft,
        lineHeight: computedStyle.lineHeight,
        verticalAlign: computedStyle.verticalAlign,
        fontWeight: computedStyle.fontWeight,
        gap: computedStyle.gap,
      };
    };

    const result = {
      missingContainer: false,
      sourceCell: pick(sourceCell),
      copiedCell: pick(copiedCell),
      sourceParagraph: pick(sourceParagraph),
      copiedParagraph: pick(copiedParagraph),
      sourceTaskItem: pick(sourceTaskItem),
      copiedTaskItem: pick(copiedTaskItem),
    };

    document.body.removeChild(container);
    style.remove();
    return result;
  });

  assert.equal(contextualStyleResult.missingContainer, false, `contextual style copy container should exist: ${JSON.stringify(contextualStyleResult)}`);
  assert.deepEqual(contextualStyleResult.copiedCell, contextualStyleResult.sourceCell, `copy should preserve styles that depend on the original editor context: ${JSON.stringify(contextualStyleResult)}`);
  assert.deepEqual(contextualStyleResult.copiedParagraph, contextualStyleResult.sourceParagraph, `copy should preserve paragraph computed styles from the original editor context: ${JSON.stringify(contextualStyleResult)}`);
  assert.deepEqual(contextualStyleResult.copiedTaskItem, contextualStyleResult.sourceTaskItem, `copy should preserve task item computed styles from the original editor context: ${JSON.stringify(contextualStyleResult)}`);

  const bulletListResult = await page.evaluate(async () => {
    const { CellSelection, TableMap } = await import('/node_modules/prosemirror-tables/dist/index.js');
    const { PROSEMIRROR_CSS } = await import('/src/lib/editorStyles.ts');
    const { buildSelectionCopyContainer, finalizeSelectionCopyContainerSize } = await import('/src/lib/copySelectionAsImage.ts');

    const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const bulletList = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [paragraph('大区班子责任书')] },
        { type: 'listItem', content: [paragraph('系统完善')] },
      ],
    };
    const cell = (content, colwidth = 260) => ({
      type: 'tableCell',
      attrs: { colwidth: [colwidth] },
      content,
    });

    window.editor.commands.setContent({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [
            cell([paragraph('5.25-5.31')], 120),
            cell([bulletList], 260),
          ],
        }],
      }],
    });

    const table = window.editor.state.doc.firstChild;
    const map = TableMap.get(table);
    const tableStart = 1;
    window.editor.view.dispatch(
      window.editor.state.tr.setSelection(
        CellSelection.create(window.editor.state.doc, tableStart + map.map[0], tableStart + map.map[1])
      )
    );

    const container = buildSelectionCopyContainer(window.editor, PROSEMIRROR_CSS);
    if (!container) return { missingContainer: true };
    document.body.appendChild(container);
    finalizeSelectionCopyContainerSize(container);

    const markers = Array.from(container.querySelectorAll('[data-copy-list-marker]')).map((marker) => marker.textContent);
    const nativeMarkerItems = Array.from(container.querySelectorAll('ul:not([data-type="taskList"]) > li')).map((item) => getComputedStyle(item).listStyleType);
    const listText = container.querySelector('ul:not([data-type="taskList"])')?.textContent || '';

    document.body.removeChild(container);
    return {
      missingContainer: false,
      markers,
      nativeMarkerItems,
      listText,
    };
  });

  assert.equal(bulletListResult.missingContainer, false, `bullet list copy container should exist: ${JSON.stringify(bulletListResult)}`);
  assert.deepEqual(bulletListResult.markers, ['•', '•'], `unordered list prefixes should be explicit and stable in copied image source: ${JSON.stringify(bulletListResult)}`);
  assert.deepEqual(bulletListResult.nativeMarkerItems, ['none', 'none'], `copied unordered list should not rely on native marker rendering: ${JSON.stringify(bulletListResult)}`);
  assert.match(bulletListResult.listText, /•大区班子责任书/, `copied list text should include explicit bullet prefix before content: ${JSON.stringify(bulletListResult)}`);

  await page.evaluate(async () => {
    await import('/index.css');
    await import('/src/App.css');
    const { CellSelection, TableMap } = await import('/node_modules/prosemirror-tables/dist/index.js');

    const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const taskList = {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: false }, content: [paragraph('干部变革下一步工作研讨-赵晶')] },
        { type: 'taskItem', attrs: { checked: true }, content: [paragraph('使用薪酬系统完成5月份工资')] },
      ],
    };
    const cell = (content, colwidth = 260) => ({
      type: 'tableCell',
      attrs: { colwidth: [colwidth], verticalAlign: 'top' },
      content,
    });

    window.editor.commands.setContent({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [
            cell([taskList], 360),
            cell([paragraph('【周一】任职资格迭代内部评审')], 300),
          ],
        }],
      }],
    });

    const style = document.createElement('style');
    style.textContent = `
      #editor .ProseMirror table {
        width: 660px;
      }
      #editor .ProseMirror td {
        padding: 12px 10px !important;
        font-size: 18px;
        line-height: 1.4;
      }
      #editor .ProseMirror .selectedCell {
        box-shadow: none !important;
        outline: none !important;
      }
    `;
    document.head.appendChild(style);

    const table = window.editor.state.doc.firstChild;
    const map = TableMap.get(table);
    const tableStart = 1;
    window.editor.view.dispatch(
      window.editor.state.tr.setSelection(
        CellSelection.create(window.editor.state.doc, tableStart + map.map[0], tableStart + map.map[1])
      )
    );
  });

  const sourceScreenshot = await page.locator('#editor .ProseMirror table').screenshot({ type: 'png' });
  const trueBrowserTaskResult = await page.evaluate(async (sourceDataUrl) => {
    const { default: html2canvas } = await import('/node_modules/html2canvas/dist/html2canvas.esm.js');
    const { PROSEMIRROR_CSS } = await import('/src/lib/editorStyles.ts');
    const { renderSelectionCopyCanvas } = await import('/src/lib/copySelectionAsImage.ts');

    const table = document.querySelector('#editor .ProseMirror table');
    const checkbox = table?.querySelector('ul[data-type="taskList"] input[type="checkbox"]');
    const taskText = table?.querySelector('ul[data-type="taskList"] li > div p');
    if (!table || !checkbox || !taskText) {
      return { missingFixture: true };
    }

    const relativeRect = (element) => {
      const tableRect = table.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - tableRect.left,
        top: rect.top - tableRect.top,
        right: rect.right - tableRect.left,
        bottom: rect.bottom - tableRect.top,
        width: rect.width,
        height: rect.height,
      };
    };
    const tableRect = table.getBoundingClientRect();
    const geometry = {
      table: { width: tableRect.width, height: tableRect.height },
      checkbox: relativeRect(checkbox),
      text: relativeRect(taskText),
    };

    const copyCanvas = await renderSelectionCopyCanvas(window.editor, PROSEMIRROR_CSS, html2canvas);
    if (!copyCanvas) return { missingCanvas: true, geometry };

    const loadImage = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
    const sourceImage = await loadImage(sourceDataUrl);
    const copyImage = await loadImage(copyCanvas.toDataURL('image/png'));

    const imageData = (image) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    };

    const analyze = (image, scaleX, scaleY, offsetX, offsetY) => {
      const source = imageData(image);
      const markerRegion = {
        x0: Math.floor(offsetX + geometry.checkbox.left * scaleX - 4),
        y0: Math.floor(offsetY + geometry.checkbox.top * scaleY - 4),
        x1: Math.ceil(offsetX + geometry.checkbox.right * scaleX + 4),
        y1: Math.ceil(offsetY + geometry.checkbox.bottom * scaleY + 4),
      };
      const textRegion = {
        x0: Math.floor(offsetX + geometry.text.left * scaleX - 6),
        y0: Math.floor(offsetY + geometry.text.top * scaleY - 8),
        x1: Math.ceil(offsetX + geometry.text.right * scaleX + 6),
        y1: Math.ceil(offsetY + geometry.text.bottom * scaleY + 8),
      };

      const isMarker = (r, g, b, a) => a > 180 && r > 80 && r < 180 && g > 80 && g < 180 && b > 80 && b < 190 && Math.abs(r - g) < 35;
      const isText = (r, g, b, a) => a > 180 && r < 90 && g < 90 && b < 90;
      const bbox = (predicate, region) => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -1;
        let maxY = -1;
        let count = 0;
        for (let y = Math.max(0, region.y0); y < Math.min(source.height, region.y1); y += 1) {
          for (let x = Math.max(0, region.x0); x < Math.min(source.width, region.x1); x += 1) {
            const index = (y * source.width + x) * 4;
            const r = source.data[index];
            const g = source.data[index + 1];
            const b = source.data[index + 2];
            const a = source.data[index + 3];
            if (predicate(r, g, b, a)) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
              count += 1;
            }
          }
        }
        return count ? { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, count } : null;
      };

      const cornerMarkerPixels = () => {
        let count = 0;
        const corners = [
          [markerRegion.x0, markerRegion.y0],
          [markerRegion.x1 - 1, markerRegion.y0],
          [markerRegion.x0, markerRegion.y1 - 1],
          [markerRegion.x1 - 1, markerRegion.y1 - 1],
        ];
        corners.forEach(([cornerX, cornerY]) => {
          for (let y = cornerY - 1; y <= cornerY + 1; y += 1) {
            for (let x = cornerX - 1; x <= cornerX + 1; x += 1) {
              if (x < 0 || y < 0 || x >= source.width || y >= source.height) continue;
              const index = (y * source.width + x) * 4;
              if (isMarker(source.data[index], source.data[index + 1], source.data[index + 2], source.data[index + 3])) {
                count += 1;
              }
            }
          }
        });
        return count;
      };

      const marker = bbox(isMarker, markerRegion);
      const text = bbox(isText, textRegion);
      return {
        marker,
        text,
        dy: marker && text ? marker.cy - text.cy : null,
        cornerMarkerPixels: cornerMarkerPixels(),
      };
    };

    const sourceScaleX = sourceImage.naturalWidth / geometry.table.width;
    const sourceScaleY = sourceImage.naturalHeight / geometry.table.height;
    const copyPadding = 32;
    const copyScaleX = (copyImage.naturalWidth - copyPadding * 2) / geometry.table.width;
    const copyScaleY = (copyImage.naturalHeight - copyPadding * 2) / geometry.table.height;
    return {
      missingFixture: false,
      geometry,
      source: analyze(sourceImage, sourceScaleX, sourceScaleY, 0, 0),
      copy: analyze(copyImage, copyScaleX, copyScaleY, copyPadding, copyPadding),
    };
  }, `data:image/png;base64,${sourceScreenshot.toString('base64')}`);

  assert.equal(trueBrowserTaskResult.missingFixture, false, `true browser task fixture should exist: ${JSON.stringify(trueBrowserTaskResult)}`);
  assert.equal(trueBrowserTaskResult.missingCanvas, undefined, `copy canvas should exist for true browser task comparison: ${JSON.stringify(trueBrowserTaskResult)}`);
  assert.ok(trueBrowserTaskResult.source.marker, `true browser screenshot should contain task marker pixels: ${JSON.stringify(trueBrowserTaskResult)}`);
  assert.ok(trueBrowserTaskResult.copy.marker, `copied image should contain task marker pixels: ${JSON.stringify(trueBrowserTaskResult)}`);
  assert.ok(trueBrowserTaskResult.source.text, `true browser screenshot should contain task text pixels: ${JSON.stringify(trueBrowserTaskResult)}`);
  assert.ok(trueBrowserTaskResult.copy.text, `copied image should contain task text pixels: ${JSON.stringify(trueBrowserTaskResult)}`);
  assert.ok(
    trueBrowserTaskResult.copy.cornerMarkerPixels <= 2,
    `copied task prefix must stay circular, not fall back to native square checkbox: ${JSON.stringify(trueBrowserTaskResult)}`,
  );
  assert.ok(
    Math.abs(trueBrowserTaskResult.copy.dy - trueBrowserTaskResult.source.dy) <= 4,
    `copied task prefix/text vertical alignment should match the real browser rendering: ${JSON.stringify(trueBrowserTaskResult)}`,
  );

  console.log('copy selection image browser test passed');
} finally {
  if (browser) await browser.close();
  await server.close();
}
