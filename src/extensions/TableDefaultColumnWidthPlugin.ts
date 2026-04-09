import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state';
import { Node as ProsemirrorNode } from '@tiptap/pm/model';

/**
 * 表格默认列宽插件
 *
 * 功能：新建表格时，自动设置 colwidth = [220]
 * 这样 TableView 渲染时就会用 220px 而不是默认的 25px
 */
export const TableDefaultColumnWidthPlugin = (defaultWidth: number = 220) => {
  return new Plugin({
    key: new PluginKey('tableDefaultColumnWidth'),

    appendTransactions(transactions, prevState, nextState) {
      console.log('[TablePlugin] appendTransactions called, transactions:', transactions.length);
      // 只处理有文档变化的 transaction
      const docChanges = transactions.filter(tr => tr.docChanged);
      if (docChanges.length === 0) {
        console.log('[TablePlugin] No doc changes');
        return undefined;
      }
      console.log('[TablePlugin] Doc changes detected');

      // 追踪本轮已处理的表格位置，避免重复
      const processedTables = new Set<string>();
      let modified = false;
      const tr = nextState.tr;

      nextState.doc.descendants((node, pos) => {
        if (node.type.name !== 'table') return;
        if (!node.firstChild) return;

        console.log('[TablePlugin] Found table at pos:', pos);

        // 用表格的深拷贝作为唯一标识，避免重复处理
        const tableKey = `${pos}-${node.childCount}-${node.firstChild.childCount}`;
        if (processedTables.has(tableKey)) return;
        processedTables.add(tableKey);

        // 检查是否所有 cell 都没有 colwidth（即新建的表格）
        let needsInit = false;
        let cellCount = 0;
        node.descendants((cell) => {
          if (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader') {
            cellCount++;
            console.log('[TablePlugin] Cell colwidth:', cell.attrs.colwidth);
            if (!cell.attrs.colwidth || cell.attrs.colwidth[0] === null) {
              needsInit = true;
            }
          }
        });

        // 只有新建的表格（所有 cell 都没有 colwidth）才初始化
        if (!needsInit || cellCount === 0) return;

        // 更新所有 cell 的 colwidth 为默认值
        node.descendants((cell, cellPos) => {
          if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return;

          const currentColwidth = cell.attrs.colwidth;
          // 只有 colwidth 为 null 或空数组时才设置
          if (!currentColwidth || currentColwidth[0] === null) {
            const mappedPos = tr.mapping.map(pos + cellPos);
            tr.setNodeMarkup(mappedPos, undefined, {
              ...cell.attrs,
              colwidth: [defaultWidth],
            });
            modified = true;
          }
        });
      });

      return modified ? tr : undefined;
    },
  });
};

export default TableDefaultColumnWidthPlugin;
