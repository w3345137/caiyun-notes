import { Table } from '@tiptap/extension-table';
import { TextSelection } from '@tiptap/pm/state';
import { createTable } from '@tiptap/extension-table';
import type { Schema } from '@tiptap/pm/model';

/**
 * TableWithDefaultWidth - 带默认列宽的表格扩展
 *
 * 新建表格时自动设置 colwidth = [220]
 */
export const TableWithDefaultWidth = Table.extend({
  addCommands() {
    return {
      ...this.parent?.(),
      insertTable:
        ({ rows = 3, cols = 3, withHeaderRow = true } = {}) =>
        ({ tr, dispatch, editor }) => {
          // 创建表格节点
          const node = createTable(editor.schema as Schema, rows, cols, withHeaderRow);

          if (dispatch) {
            const offset = tr.selection.from + 1;

            tr.replaceSelectionWith(node)
              .scrollIntoView()
              .setSelection(TextSelection.near(tr.doc.resolve(offset)));

            // 立即设置所有 cell 的 colwidth 为 220
            // 使用 nodesBetween 获取准确位置
            tr.doc.nodesBetween(0, tr.doc.content.size, (n, pos) => {
              if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') {
                if (!n.attrs.colwidth || n.attrs.colwidth[0] === null) {
                  tr.setNodeMarkup(pos, undefined, {
                    ...n.attrs,
                    colwidth: [220],
                  });
                }
              }
            });

            dispatch(tr);
          }

          return true;
        },
    };
  },
});

export default TableWithDefaultWidth;
