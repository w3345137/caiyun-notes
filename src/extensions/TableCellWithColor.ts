import { TableCell } from '@tiptap/extension-table';

export interface CellColorOptions {
  HTMLAttributes: Record<string, any>;
}

export const TableCellWithColor = TableCell.extend<CellColorOptions>({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.style.backgroundColor || element.getAttribute('data-background-color'),
        renderHTML: (attributes: { backgroundColor?: string | null }) => {
          if (!attributes.backgroundColor) {
            return {};
          }
          return {
            'data-background-color': attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          };
        },
      },
      verticalAlign: {
        default: 'top',
        parseHTML: (element) => element.style.verticalAlign || element.getAttribute('data-vertical-align') || 'top',
        renderHTML: (attributes: { verticalAlign?: string }) => {
          return {
            'data-vertical-align': attributes.verticalAlign,
            style: `vertical-align: ${attributes.verticalAlign || 'top'}`,
          };
        },
      },
    };
  },

});

export default TableCellWithColor;
