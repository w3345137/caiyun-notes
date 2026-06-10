import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { CellSelection } from 'prosemirror-tables';

/**
 * 表格单元格内精准文字选择插件 v2
 *
 * 方案：完全不阻止 CellSelection 的创建，而是在创建后立即转换回 TextSelection
 * 同时隐藏单元格选区的视觉效果
 */
function createSafeInlineTextSelection(state: EditorState, anchor: number, head: number): Selection | null {
  try {
    const maxPos = state.doc.content.size;
    const clamp = (pos: number) => Math.max(0, Math.min(maxPos, pos));
    const $anchor = state.doc.resolve(clamp(anchor));
    const $head = state.doc.resolve(clamp(head));
    if (!$anchor.parent.inlineContent || !$head.parent.inlineContent) {
      return null;
    }
    return TextSelection.between($anchor, $head, 1);
  } catch {
    return null;
  }
}

export const TableSelectionFixPlugin = new Plugin({
  key: new PluginKey('tableSelectionFix'),

  appendTransaction(transactions, prevState, nextState) {
    const transactionsThatNeedNormalization = transactions.filter(tr => tr.docChanged);

    if (transactionsThatNeedNormalization.length === 0) {
      return undefined;
    }

    const selection = nextState.selection;

    // 只有 CellSelection 需要处理
    if (!(selection instanceof CellSelection)) {
      return undefined;
    }

    const { $anchorCell, $headCell } = selection;

    // 如果 anchor 和 head 在同一个单元格内，转换为 TextSelection
    // 这样用户拖拽选择文字时，不会感觉整个单元格被选中
    if ($anchorCell.pos === $headCell.pos) {
      const anchor = selection.$anchor.pos;
      const head = selection.$head.pos;
      const textSelection = createSafeInlineTextSelection(nextState, anchor, head);
      if (!textSelection) return undefined;
      const tr = nextState.tr;
      tr.setSelection(textSelection);
      return tr;
    }

    return undefined;
  },

  // 禁用单元格选区的视觉绘制
  props: {
    // 彻底禁用单元格选区的高亮
    decorations(state) {
      const selection = state.selection;
      if (selection instanceof CellSelection) {
        // 返回空DecorationSet，彻底隐藏单元格选中效果
        return DecorationSet.empty;
      }
      return null;
    },
  },
});

// CSS 样式：确保表格单元格内文字可选
export const tableSelectionFixStyles = `
  /* 表格单元格内文字可选 */
  .ProseMirror td,
  .ProseMirror th {
    user-select: text;
    -moz-user-select: text;
    -webkit-user-select: text;
    -ms-user-select: text;
  }

  /* 移除 ProseMirror 单元格选中时的默认背景色 */
  .ProseMirror .selectedCell {
    background: transparent !important;
  }

  /* 确保单元格内容区域可编辑 */
  .ProseMirror td > *,
  .ProseMirror th > * {
    user-select: text;
  }
`;

export default TableSelectionFixPlugin;
