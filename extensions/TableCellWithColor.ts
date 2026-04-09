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

  // 当在单元格内选择文字时，不阻止，让原生 selection 生效
  // 返回 true 会阻止默认行为，导致选中整个单元格
  // 返回 false 让浏览器原生选择正常工作
  handleMouseDown() {
    return false;
  },
});

export default TableCellWithColor;
