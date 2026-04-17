import { TableHeader } from '@tiptap/extension-table';

export interface HeaderColorOptions {
  HTMLAttributes: Record<string, any>;
}

export const TableHeaderWithColor = TableHeader.extend<HeaderColorOptions>({
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
        default: null,
        parseHTML: (element) => element.style.verticalAlign || element.getAttribute('data-vertical-align'),
        renderHTML: (attributes: { verticalAlign?: string | null }) => {
          if (!attributes.verticalAlign) {
            return {};
          }
          return {
            'data-vertical-align': attributes.verticalAlign,
            style: `vertical-align: ${attributes.verticalAlign}`,
          };
        },
      },
    };
  },
});

export default TableHeaderWithColor;
