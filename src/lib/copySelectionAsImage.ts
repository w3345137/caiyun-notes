import { CellSelection, TableMap } from 'prosemirror-tables';

const COPY_PADDING = 16;
const COPY_CONTAINER_SCOPE_CLASS = 'copy-selection-image-source';

function getSafeEditorView(editor: any) {
  if (!editor || editor.isDestroyed) return null;
  try {
    return editor.view || null;
  } catch {
    return null;
  }
}

function getTableElementFromSelection(editorView: any, tableStart: number): HTMLTableElement | null {
  const tableDom = editorView.nodeDOM(tableStart - 1);
  if (tableDom instanceof HTMLTableElement) return tableDom;
  if (tableDom instanceof HTMLElement) {
    return tableDom.querySelector('table') || tableDom.closest('table');
  }
  return null;
}

function getSelectedCellTableInfo(editor: any): {
  tableEl: HTMLTableElement;
  rect: { top: number; bottom: number; left: number; right: number; tableStart: number };
} | null {
  const editorView = getSafeEditorView(editor);
  if (!editorView) return null;

  const selection = editor.state.selection as any;
  const anchorCell = selection.$anchorCell;
  const headCell = selection.$headCell;
  if (!anchorCell || !headCell) return null;

  const table = anchorCell.node(-1);
  const tableStart = anchorCell.start(-1);
  const map = TableMap.get(table);
  const rect = {
    ...map.rectBetween(anchorCell.pos - tableStart, headCell.pos - tableStart),
    tableStart,
  };
  const tableEl = getTableElementFromSelection(editorView, rect.tableStart);
  if (!tableEl) return null;

  return { tableEl, rect };
}

function removeUnselectedRowsAndColumns(table: HTMLTableElement, rect: { top: number; bottom: number; left: number; right: number }) {
  const rows = Array.from(table.querySelectorAll('tr'));

  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    if (rowIndex < rect.top || rowIndex >= rect.bottom) {
      rows[rowIndex].remove();
    }
  }

  Array.from(table.querySelectorAll('tr')).forEach((row) => {
    let visualCol = 0;
    Array.from(row.children).forEach((cell) => {
      if (!(cell instanceof HTMLTableCellElement)) return;
      const colspan = Math.max(1, Number(cell.getAttribute('colspan') || '1'));
      const start = visualCol;
      const end = visualCol + colspan;
      visualCol = end;

      if (end <= rect.left || start >= rect.right) {
        cell.remove();
      }
    });
  });

  const colgroup = table.querySelector('colgroup');
  if (colgroup) {
    const cols = Array.from(colgroup.querySelectorAll('col'));
    for (let colIndex = cols.length - 1; colIndex >= 0; colIndex -= 1) {
      if (colIndex < rect.left || colIndex >= rect.right) {
        cols[colIndex].remove();
      }
    }
  }
}

function inlineComputedStyles(source: Element, target: Element) {
  if (source instanceof HTMLElement && target instanceof HTMLElement) {
    const computedStyle = window.getComputedStyle(source);
    for (let index = 0; index < computedStyle.length; index += 1) {
      const property = computedStyle.item(index);
      if (!property) continue;
      target.style.setProperty(
        property,
        computedStyle.getPropertyValue(property),
        'important',
      );
    }

    if (source.classList.contains('selectedCell')) {
      target.style.removeProperty('box-shadow');
      target.style.removeProperty('outline');
      target.style.removeProperty('outline-offset');
    }
  }

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  sourceChildren.forEach((sourceChild, index) => {
    const targetChild = targetChildren[index];
    if (targetChild) {
      inlineComputedStyles(sourceChild, targetChild);
    }
  });
}

function cloneSelectedCellTable(editor: any): HTMLTableElement | null {
  const tableInfo = getSelectedCellTableInfo(editor);
  if (!tableInfo) return null;
  const { tableEl, rect } = tableInfo;

  const clonedTable = tableEl.cloneNode(true) as HTMLTableElement;
  inlineComputedStyles(tableEl, clonedTable);
  removeUnselectedRowsAndColumns(clonedTable, rect);
  clonedTable.querySelectorAll('.selectedCell').forEach((el) => el.classList.remove('selectedCell'));
  clonedTable.style.setProperty('max-width', 'none', 'important');
  clonedTable.style.setProperty('width', 'max-content', 'important');
  return clonedTable;
}

function isTableCellSelection(selection: any): boolean {
  return selection instanceof CellSelection || !!(selection?.$anchorCell && selection?.$headCell);
}

function cloneRegularSelection(editor: any): Node | null {
  const editorView = getSafeEditorView(editor);
  if (!editorView) return null;

  const { from, to } = editor.state.selection;
  const domStart = editorView.domAtPos(from);
  const domEnd = editorView.domAtPos(to);
  const range = document.createRange();
  range.setStart(domStart.node, domStart.offset);
  range.setEnd(domEnd.node, domEnd.offset);

  const tempDiv = document.createElement('div');
  tempDiv.appendChild(range.cloneContents());

  const orphanCells = tempDiv.querySelectorAll('td, th');
  if (orphanCells.length > 0 && !tempDiv.querySelector('table')) {
    const firstCellDom = editorView.domAtPos(from).node;
    const origTable = firstCellDom instanceof HTMLElement
      ? firstCellDom.closest('table')
      : firstCellDom.parentElement?.closest('table');
    if (origTable) {
      const clonedTable = origTable.cloneNode(true) as HTMLTableElement;
      inlineComputedStyles(origTable, clonedTable);
      clonedTable.querySelectorAll('.selectedCell').forEach((el) => el.classList.remove('selectedCell'));
      clonedTable.style.setProperty('max-width', 'none', 'important');
      clonedTable.style.setProperty('width', 'max-content', 'important');
      return clonedTable;
    }
  }

  return tempDiv;
}

function applyCopyContainerSize(container: HTMLDivElement) {
  const width = Math.ceil(Math.max(container.scrollWidth, container.getBoundingClientRect().width));
  const height = Math.ceil(Math.max(container.scrollHeight, container.getBoundingClientRect().height));
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
}

function getTaskCheckboxChecked(input: HTMLInputElement) {
  const taskItem = input.closest('li[data-checked]');
  return input.checked || input.hasAttribute('checked') || taskItem?.getAttribute('data-checked') === 'true';
}

function replaceTaskCheckboxInputs(container: HTMLElement) {
  const checkboxes = Array.from(container.querySelectorAll('ul[data-type="taskList"] input[type="checkbox"]'));

  checkboxes.forEach((checkbox) => {
    if (!(checkbox instanceof HTMLInputElement)) return;

    const computedStyle = window.getComputedStyle(checkbox);
    const rect = checkbox.getBoundingClientRect();
    const width = computedStyle.width || `${rect.width}px`;
    const height = computedStyle.height || `${rect.height}px`;
    const borderColor = computedStyle.borderTopColor || '#6b7280';
    const dotSize = Math.max(1, Math.round((rect.width || Number.parseFloat(width) || 14) / 2));

    const visualCheckbox = document.createElement('span');
    visualCheckbox.setAttribute('data-copy-task-checkbox', 'true');
    visualCheckbox.setAttribute('aria-hidden', 'true');
    visualCheckbox.style.boxSizing = 'border-box';
    visualCheckbox.style.display = 'inline-block';
    visualCheckbox.style.width = width;
    visualCheckbox.style.height = height;
    visualCheckbox.style.border = `${computedStyle.borderTopWidth || '1px'} ${computedStyle.borderTopStyle || 'solid'} ${borderColor}`;
    visualCheckbox.style.borderRadius = computedStyle.borderRadius || '50%';
    visualCheckbox.style.backgroundColor = computedStyle.backgroundColor || 'transparent';
    visualCheckbox.style.margin = computedStyle.margin;
    visualCheckbox.style.padding = computedStyle.padding;
    visualCheckbox.style.position = 'relative';
    visualCheckbox.style.flexShrink = computedStyle.flexShrink || '0';
    visualCheckbox.style.verticalAlign = computedStyle.verticalAlign || 'middle';
    if (checkbox.closest('td, th')) {
      visualCheckbox.style.transform = 'translateY(0.5em)';
    }

    if (getTaskCheckboxChecked(checkbox)) {
      const dot = document.createElement('span');
      dot.setAttribute('data-copy-task-checkbox-dot', 'true');
      dot.style.position = 'absolute';
      dot.style.top = '50%';
      dot.style.left = '50%';
      dot.style.transform = 'translate(-50%, -50%)';
      dot.style.width = `${dotSize}px`;
      dot.style.height = `${dotSize}px`;
      dot.style.border = '0 solid transparent';
      dot.style.borderStyle = 'none';
      dot.style.borderRadius = '50%';
      dot.style.backgroundColor = borderColor;
      visualCheckbox.appendChild(dot);
    }

    checkbox.replaceWith(visualCheckbox);
  });
}

function cssContentToText(content: string) {
  if (!content || content === 'none' || content === 'normal') return null;
  return content.replace(/^['"]|['"]$/g, '');
}

function getListMarkerText(item: HTMLLIElement) {
  const beforeContent = cssContentToText(window.getComputedStyle(item, '::before').content);
  if (beforeContent) return beforeContent;

  const parent = item.parentElement;
  if (parent instanceof HTMLOListElement) {
    const index = Array.from(parent.children).filter((child) => child instanceof HTMLLIElement).indexOf(item);
    return `${index + 1}.`;
  }

  const listStyleType = window.getComputedStyle(item).listStyleType || window.getComputedStyle(parent as Element).listStyleType;
  if (listStyleType === 'none') return null;
  if (listStyleType === 'circle') return '◦';
  if (listStyleType === 'square') return '▪';
  return '•';
}

function materializeListMarkers(container: HTMLElement) {
  const items = Array.from(container.querySelectorAll('li')).filter((item): item is HTMLLIElement => {
    if (!(item instanceof HTMLLIElement)) return false;
    const parent = item.parentElement;
    if (!(parent instanceof HTMLUListElement || parent instanceof HTMLOListElement)) return false;
    return parent.getAttribute('data-type') !== 'taskList';
  });

  items.forEach((item) => {
    if (item.querySelector(':scope > [data-copy-list-marker]')) return;

    const markerText = getListMarkerText(item);
    if (!markerText) return;

    const itemStyle = window.getComputedStyle(item);
    const marker = document.createElement('span');
    marker.setAttribute('data-copy-list-marker', 'true');
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = markerText;
    marker.style.display = 'inline-block';
    marker.style.flex = '0 0 auto';
    marker.style.minWidth = markerText.endsWith('.') ? '1.4em' : '1em';
    marker.style.textAlign = 'center';
    marker.style.color = itemStyle.color;
    marker.style.font = itemStyle.font;
    marker.style.lineHeight = itemStyle.lineHeight;

    const content = document.createElement('span');
    content.setAttribute('data-copy-list-content', 'true');
    content.style.display = 'block';
    content.style.flex = '1 1 auto';
    content.style.minWidth = '0';

    while (item.firstChild) {
      content.appendChild(item.firstChild);
    }

    item.append(marker, content);
    item.style.setProperty('list-style-type', 'none', 'important');
    item.style.setProperty('display', 'flex', 'important');
    item.style.setProperty('align-items', 'baseline', 'important');
    item.style.setProperty('gap', itemStyle.gap === 'normal' ? '0.25em' : itemStyle.gap, 'important');
  });
}

export function buildSelectionCopyContainer(editor: any, proseMirrorCss: string): HTMLDivElement | null {
  if (!editor || editor.isDestroyed) return null;

  const selection = editor.state.selection;
  if (selection.from === selection.to && !isTableCellSelection(selection)) return null;

  const editorView = getSafeEditorView(editor);
  if (!editorView) return null;

  const editorEl = editorView.dom as HTMLElement;
  const computedStyle = window.getComputedStyle(editorEl);
  const container = document.createElement('div');
  container.classList.add('ProseMirror', COPY_CONTAINER_SCOPE_CLASS);
  container.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'background:#fff',
    `padding:${COPY_PADDING}px`,
    'font-family:inherit',
    'width:max-content',
    'max-width:none',
    'overflow:visible',
    'box-sizing:border-box',
  ].join(';');
  container.style.fontSize = computedStyle.fontSize;
  container.style.lineHeight = computedStyle.lineHeight;
  container.style.color = computedStyle.color;

  const styleEl = document.createElement('style');
  const scopedProseMirrorCss = proseMirrorCss.replaceAll(
    '.ProseMirror',
    `.${COPY_CONTAINER_SCOPE_CLASS}.ProseMirror`,
  );
  styleEl.textContent = `
    ${scopedProseMirrorCss}
    .${COPY_CONTAINER_SCOPE_CLASS}.ProseMirror { width: max-content !important; max-width: none !important; overflow: visible !important; }
    .${COPY_CONTAINER_SCOPE_CLASS}.ProseMirror table { width: max-content !important; max-width: none !important; }
    .${COPY_CONTAINER_SCOPE_CLASS}.ProseMirror .tableWrapper { width: max-content !important; max-width: none !important; overflow: visible !important; }
  `;
  container.appendChild(styleEl);

  const content = isTableCellSelection(selection)
    ? cloneSelectedCellTable(editor)
    : cloneRegularSelection(editor);

  if (!content) return null;
  container.appendChild(content);
  return container;
}

export function getSelectionCopyRenderSize(container: HTMLElement) {
  return {
    width: Math.ceil(Math.max(container.scrollWidth, container.getBoundingClientRect().width)),
    height: Math.ceil(Math.max(container.scrollHeight, container.getBoundingClientRect().height)),
  };
}

export function finalizeSelectionCopyContainerSize(container: HTMLDivElement) {
  replaceTaskCheckboxInputs(container);
  materializeListMarkers(container);
  applyCopyContainerSize(container);
}

export async function renderSelectionCopyCanvas(
  editor: any,
  proseMirrorCss: string,
  html2canvas: any,
): Promise<HTMLCanvasElement | null> {
  if (!editor || editor.isDestroyed) return null;

  const selection = editor.state.selection;
  if (selection.from === selection.to && !isTableCellSelection(selection)) return null;

  const container = buildSelectionCopyContainer(editor, proseMirrorCss);
  if (!container) return null;

  document.body.appendChild(container);
  try {
    finalizeSelectionCopyContainerSize(container);
    const renderSize = getSelectionCopyRenderSize(container);
    return await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      width: renderSize.width,
      height: renderSize.height,
      windowWidth: renderSize.width,
      windowHeight: renderSize.height,
    });
  } finally {
    document.body.removeChild(container);
  }
}
