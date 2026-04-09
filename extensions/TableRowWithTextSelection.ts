import { TableRow } from '@tiptap/extension-table';

/**
 * TableRowWithTextSelection - 允许在表格单元格内进行原生文字选择
 *
 * 问题根源：prosemirror-tables 的 tableEditing 插件在单元格内点击时
 * 会启动 CellSelection，干扰原生文字选择。
 *
 * 解决方案：在事件到达 tableEditing 之前，用 stopImmediatePropagation 阻止它。
 * 我们检测点击目标是否是单元格内的文字内容（p, span, text 等）。
 */
export const TableRowWithTextSelection = TableRow.extend({
  addProseMirrorPlugins() {
    return [];
  },

  handleDOMEvents: {
    // 在 mousedown 阶段阻止事件，防止 tableEditing 启动 CellSelection
    mousedown(event, _pos, _node) {
      const target = event.target as HTMLElement;

      // 查找最近的 td 或 th 单元格
      const cell = target.closest('td, th');

      if (!cell) return false;

      // 检查点击目标是否是单元格内的文字内容
      // 如果是 p, span, text 等元素，允许原生文字选择
      const isTextContent =
        target.tagName === 'P' ||
        target.tagName === 'SPAN' ||
        target.tagName === 'TEXT' ||
        target.tagName === 'B' ||
        target.tagName === 'I' ||
        target.tagName === 'U' ||
        target.tagName === 'STRONG' ||
        target.tagName === 'EM' ||
        target.tagName === 'A' ||
        target.tagName === 'CODE' ||
        target.tagName === 'S' ||
        target.tagName === 'DEL' ||
        target.tagName === 'INS' ||
        target.tagName === 'MARK' ||
        target.tagName === 'SUB' ||
        target.tagName === 'SUP' ||
        target.tagName === 'BR';

      // 如果点击的是文字内容元素
      if (isTextContent || target.textContent?.trim()) {
        // 阻止 tableEditing 的 handler，但让原生选择继续
        event.stopImmediatePropagation();
        return false;
      }

      // 对于单元格边框等非文字内容的点击，让 tableEditing 正常处理
      return false;
    },
  },
});

export default TableRowWithTextSelection;