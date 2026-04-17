import { Table } from '@tiptap/extension-table';
import { TextSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { createTable } from '@tiptap/extension-table';
import type { Schema } from '@tiptap/pm/model';

const DEFAULT_COL_WIDTH = 220;

/**
 * TableWithDefaultWidth - 带默认列宽的表格扩展
 *
 * 1. 新建表格时自动设置 colwidth = [220]
 * 2. 加载已有文档时，自动补齐缺失的 colwidth（确保 TableView 能正确计算表格总宽度）
 */
export const TableWithDefaultWidth = Table.extend({
  addCommands() {
    return {
      ...this.parent?.(),
      insertTable:
        ({ rows = 3, cols = 3, withHeaderRow = true } = {}) =>
        ({ tr, dispatch, editor }) => {
          const node = createTable(editor.schema as Schema, rows, cols, withHeaderRow);

          if (dispatch) {
            const offset = tr.selection.from + 1;

            tr.replaceSelectionWith(node)
              .scrollIntoView()
              .setSelection(TextSelection.near(tr.doc.resolve(offset)));

            // 立即设置所有 cell 的 colwidth
            tr.doc.nodesBetween(0, tr.doc.content.size, (n, pos) => {
              if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') {
                if (!n.attrs.colwidth || n.attrs.colwidth[0] === null) {
                  tr.setNodeMarkup(pos, undefined, {
                    ...n.attrs,
                    colwidth: [DEFAULT_COL_WIDTH],
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

  addProseMirrorPlugins() {
    const plugins = this.parent?.() || [];

    // 补齐已有表格中缺失的 colwidth
    plugins.push(
      new Plugin({
        key: new PluginKey('tableEnsureColWidth'),
        appendTransaction(transactions, _oldState, newState) {
          // 只在文档变化时处理（包括初始加载）
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          let modified = false;
          const tr = newState.tr;

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'table') return;

            // 遍历表格中的所有 cell，补齐缺失的 colwidth
            node.descendants((cell, cellPos) => {
              if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return;

              const cw = cell.attrs.colwidth;
              if (!cw || cw[0] === null || cw[0] === undefined) {
                const absPos = pos + 1 + cellPos; // +1 因为 table 节点自身占一个位置
                tr.setNodeMarkup(absPos, undefined, {
                  ...cell.attrs,
                  colwidth: [DEFAULT_COL_WIDTH],
                });
                modified = true;
              }
            });
          });

          return modified ? tr : null;
        },
      })
    );

    return plugins;
  },
});

export default TableWithDefaultWidth;
