import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { CellSelection } from 'prosemirror-tables';

/**
 * 允许表格单元格内原生文字选择插件
 *
 * 问题：prosemirror-tables 的 tableEditing 插件会在单元格内拖动时创建 CellSelection，
 * 这会选择整个单元格而不是让用户选择文字。
 *
 * 解决方案：拦截 CellSelection，当 anchor 和 head 在同一个单元格内时，
 * 转换为普通的 TextSelection，让用户可以正常选字。
 */
export const TextSelectionInTablePlugin = new Plugin({
  key: new PluginKey('textSelectionInTable'),

  appendTransaction(transactions, oldState, newState) {
    const selection = newState.selection;
    if (!(selection instanceof CellSelection)) {
      return null;
    }

    const { $anchorCell, $headCell } = selection;

    // 如果 anchor 和 head 在同一个单元格内，转换为 TextSelection
    if ($anchorCell.pos === $headCell.pos) {
      const anchor = selection.$anchor.pos;
      const head = selection.$head.pos;
      const tr = newState.tr;
      tr.setSelection(TextSelection.create(newState.doc, anchor, head));
      return tr;
    }

    return null;
  },
});

export default TextSelectionInTablePlugin;