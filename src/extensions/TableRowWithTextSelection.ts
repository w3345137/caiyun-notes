import { TableRow } from '@tiptap/extension-table';

export const TableRowWithTextSelection = TableRow.extend({
  addProseMirrorPlugins() {
    return [];
  },
});

export default TableRowWithTextSelection;
