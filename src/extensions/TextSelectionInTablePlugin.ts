import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
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

export const textSelectionInTablePlugin = new Plugin({
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
      const textSelection = createSafeInlineTextSelection(newState, anchor, head);
      if (!textSelection) return null;
      const tr = newState.tr;
      tr.setSelection(textSelection);
      return tr;
    }

    return null;
  },
});

export const TextSelectionInTableExtension = Extension.create({
  name: 'textSelectionInTable',
  priority: 1001,

  addProseMirrorPlugins() {
    return [textSelectionInTablePlugin];
  },
});

export default TextSelectionInTableExtension;
